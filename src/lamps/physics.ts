import { MAX_BLOBS, type Params } from "../params";
import type { LampWall } from "./lamp";

const FLOOR = 0.02;
const CEIL = 1.0;

export const SIM_DT = 1 / 60;

export function advance(
  wall: LampWall,
  realDt: number,
  params: Params,
  timeScale: number,
  simClock: { t: number },
  _accumulator: { acc: number },
): void {
  const dt = Math.min(Math.max(realDt, 0), 1 / 30);
  const speed = Math.min(Math.max(timeScale, 0.25), 8);
  step(wall, dt * speed, params, simClock.t);
  simClock.t += dt;
}

export function step(wall: LampWall, dt: number, p: Params, t: number): void {
  const d = Math.min(dt, 0.08);
  for (let lamp = 0; lamp < wall.count; lamp++) stepLamp(wall, lamp, d, p, t);
}

function stepLamp(
  wall: LampWall,
  lamp: number,
  dt: number,
  p: Params,
  t: number,
): void {
  const warmRate = 1 / Math.max(5, p.warmupSec);
  if (wall.on[lamp]) {
    wall.warmth[lamp] = Math.min(1, wall.warmth[lamp] + warmRate * dt);
    if (wall.warmth[lamp] >= 0.85) wall.activeTime[lamp] += dt;
  } else {
    wall.warmth[lamp] = Math.max(0, wall.warmth[lamp] - warmRate * 1.5 * dt);
  }

  const drive = smoothstep(0.3, 0.85, wall.warmth[lamp]);
  if (drive < 0.05) {
    settleCold(wall, lamp, dt);
    return;
  }

  const heatMul = p.heatPower * wall.heatJit[lamp];
  const drag = 2.4 * p.viscosity * wall.viscJit[lamp];
  const buoyMul = 0.5 * p.buoyancy * wall.buoyJit[lamp];
  if (wall.mergeCooldown[lamp] > 0) wall.mergeCooldown[lamp] -= dt;

  const base = lamp * MAX_BLOBS;
  const A = wall.blobA;
  const B = wall.blobB;
  const maxR = 0.13 * p.blobSize;
  const minR = 0.05 * p.blobSize;

  let poolIdx = -1;
  let poolScore = -1;

  for (let b = 0; b < MAX_BLOBS; b++) {
    const i = base + b;
    const k = i * 4;
    if (B[k + 2] < 0.5) continue;

    if (B[k + 3] < 1) B[k + 3] = Math.min(1, B[k + 3] + dt * 0.5);
    wall.targetR[i] = clamp(wall.targetR[i], minR, maxR);

    const g = B[k + 3];
    const r = wall.targetR[i] * (0.1 + 0.9 * g * g * (3 - 2 * g));
    A[k + 2] = r;

    let x = A[k];
    let y = A[k + 1];
    let heat = A[k + 3];
    let vx = B[k];
    let vy = B[k + 1];

    const bulbZone = smoothstep(0.3, 0.06, y);
    const heatGain = 0.9 * heatMul * drive * bulbZone * (1 - heat);
    let heatLoss = 0.025 * heat * smoothstep(0.25, 0.5, y);

    if (y > 0.8) heatLoss += (y - 0.8) * 0.5 * heat;
    heat = clamp(heat + (heatGain - heatLoss) * dt, 0, 1);

    if (b === 0) heat = Math.min(heat, 0.48);

    const ay = buoyMul * drive * (heat - 0.5) * 1.5;
    const phase = wall.blobPhase[i];
    const ax =
      Math.sin(t * 0.2 + phase) * 0.01 +
      Math.sin(t * 0.08 + phase * 1.3) * 0.006 -
      x * 0.035;

    vx += ax * dt;
    vy += ay * dt;

    for (let b2 = b + 1; b2 < MAX_BLOBS; b2++) {
      const k2 = (base + b2) * 4;
      if (B[k2 + 2] < 0.5) continue;
      const dx = x - A[k2];
      const dy = y - A[k2 + 1];
      const dist = Math.hypot(dx, dy) + 1e-5;
      const need = (r + A[k2 + 2]) * 1.12;
      if (dist >= need) continue;
      const push = ((need - dist) / need) * 1.1 * dt;
      const fx = (dx / dist) * push;
      const fy = (dy / dist) * push * 0.65;
      vx += fx;
      vy += fy;
      B[k2] -= fx;
      B[k2 + 1] -= fy;
    }

    const damp = Math.exp(-drag * dt);
    vx *= damp;
    vy *= damp;

    const maxSpd = 0.12;
    const spd = Math.hypot(vx, vy);
    if (spd > maxSpd) {
      vx *= maxSpd / spd;
      vy *= maxSpd / spd;
    }

    x += vx * dt;
    y += vy * dt;

    const xMax = 1 - r * 1.1;
    if (x > xMax) {
      x = xMax;
      vx *= -0.15;
    } else if (x < -xMax) {
      x = -xMax;
      vx *= -0.15;
    }

    const yMin = FLOOR + r * 0.2;
    const yMax = CEIL - r * 0.1;
    if (y < yMin) {
      y = yMin;
      if (vy < 0) vy *= -0.1;
    } else if (y > yMax) {
      y = yMax;
      if (vy > 0) vy *= -0.05;
    }

    A[k] = x;
    A[k + 1] = y;
    A[k + 3] = heat;
    B[k] = vx;
    B[k + 1] = vy;

    if (y < 0.2 && r > poolScore) {
      poolScore = r;
      poolIdx = b;
    }
  }

  if (wall.mergeCooldown[lamp] <= 0) {
    for (let b1 = 0; b1 < MAX_BLOBS; b1++) {
      const k1 = (base + b1) * 4;
      if (B[k1 + 2] < 0.5 || A[k1 + 1] > 0.16) continue;
      for (let b2 = b1 + 1; b2 < MAX_BLOBS; b2++) {
        const k2 = (base + b2) * 4;
        if (B[k2 + 2] < 0.5 || A[k2 + 1] > 0.16) continue;
        const dist = Math.hypot(A[k2] - A[k1], A[k2 + 1] - A[k1 + 1]);
        if (dist < (A[k1 + 2] + A[k2 + 2]) * 0.45) {
          mergeBlobs(wall, lamp, b1, b2, p);
          wall.mergeCooldown[lamp] = 2.5;
          break;
        }
      }
      if (wall.mergeCooldown[lamp] > 0) break;
    }
  }

  if (wall.mergeCooldown[lamp] <= 0) {
    for (let b = 0; b < MAX_BLOBS; b++) {
      const k = (base + b) * 4;
      if (B[k + 2] < 0.5) continue;
      if (A[k + 2] > 0.11 * p.blobSize && A[k + 1] > 0.45 && B[k + 1] > 0.02) {
        if (splitBlob(wall, lamp, b, p)) {
          wall.mergeCooldown[lamp] = 3.0;
          break;
        }
      }
    }
  }

  let active = 0;
  let free = -1;
  let above = 0;
  poolIdx = -1;
  poolScore = -1;
  for (let b = 0; b < MAX_BLOBS; b++) {
    const k = (base + b) * 4;
    if (B[k + 2] < 0.5) {
      if (free < 0 && wall.respawn[base + b] <= 0) free = b;
      continue;
    }
    active++;
    if (A[k + 1] > 0.28) above++;
    if (A[k + 1] < 0.2 && A[k + 2] > poolScore) {
      poolScore = A[k + 2];
      poolIdx = b;
    }
  }

  if (active > wall.blobCount[lamp]) {
    for (let b = MAX_BLOBS - 1; b >= 1 && active > wall.blobCount[lamp]; b--) {
      const k = (base + b) * 4;
      if (B[k + 2] < 0.5 || A[k + 1] < 0.18) continue;
      B[k + 2] = 0;
      A[k + 2] = 0;
      wall.respawn[base + b] = 8;
      active--;
    }
  }

  if (poolIdx < 0 && free >= 0) {
    spawnPool(wall, lamp, free, p);
    poolIdx = free;
    active++;
    free = -1;
    for (let b = 0; b < MAX_BLOBS; b++) {
      if (B[(base + b) * 4 + 2] < 0.5 && wall.respawn[base + b] <= 0) {
        free = b;
        break;
      }
    }
  }

  const wantAbove = Math.min(4, Math.max(2, wall.blobCount[lamp] - 2));
  const launchPeriod = above < wantAbove ? 4.0 : 9.0;
  if (
    poolIdx >= 0 &&
    free >= 0 &&
    active < wall.blobCount[lamp] &&
    above < wantAbove &&
    drive > 0.45 &&
    wall.mergeCooldown[lamp] <= 0 &&
    (t + wall.seed[lamp] * 17) % launchPeriod < dt * 1.5
  ) {
    launchFromPool(wall, lamp, poolIdx, free, p);
    wall.mergeCooldown[lamp] = 2.0;
  }

  for (let b = 0; b < MAX_BLOBS; b++) {
    const i = base + b;
    const k = i * 4;
    if (B[k + 2] >= 0.5) continue;
    if (wall.respawn[i] > 0) {
      wall.respawn[i] -= dt;
      continue;
    }
    if (active >= wall.blobCount[lamp]) continue;
    spawnPool(wall, lamp, b, p);
    active++;
  }
}

function settleCold(wall: LampWall, lamp: number, dt: number): void {
  const base = lamp * MAX_BLOBS;
  const A = wall.blobA;
  const B = wall.blobB;
  for (let b = 0; b < MAX_BLOBS; b++) {
    const k = (base + b) * 4;
    if (B[k + 2] < 0.5) continue;
    A[k + 3] = Math.max(0, A[k + 3] - 0.35 * dt);
    B[k + 1] -= 0.25 * dt;
    A[k + 1] = Math.max(FLOOR + A[k + 2] * 0.2, A[k + 1] + B[k + 1] * dt);
    B[k] *= 0.92;
    B[k + 1] *= 0.92;
  }
}

function spawnPool(wall: LampWall, lamp: number, b: number, p: Params): void {
  const i = lamp * MAX_BLOBS + b;
  const k = i * 4;
  const rnd = fract(Math.sin(i * 91.7 + wall.seed[lamp] * 40));
  const tr = (0.11 + rnd * 0.02) * p.blobSize;
  wall.targetR[i] = tr;
  wall.blobPhase[i] = rnd * Math.PI * 2;
  wall.blobA[k] = (rnd - 0.5) * 0.2;
  wall.blobA[k + 1] = FLOOR + 0.05;
  wall.blobA[k + 2] = tr * 0.1;
  wall.blobA[k + 3] = 0.45;
  wall.blobB[k] = 0;
  wall.blobB[k + 1] = 0;
  wall.blobB[k + 2] = 1;
  wall.blobB[k + 3] = 0;
  wall.respawn[i] = 0;
}

function launchFromPool(
  wall: LampWall,
  lamp: number,
  pool: number,
  free: number,
  p: Params,
): void {
  const base = lamp * MAX_BLOBS;
  const A = wall.blobA;
  const B = wall.blobB;
  const kp = (base + pool) * 4;
  const kf = (base + free) * 4;
  const childR = (0.06 + Math.random() * 0.03) * p.blobSize;

  wall.targetR[base + pool] = Math.max(
    wall.targetR[base + pool] * 0.92,
    0.08 * p.blobSize,
  );
  A[kp + 2] = wall.targetR[base + pool];
  A[kp + 3] = Math.max(0.3, A[kp + 3] - 0.1);

  wall.targetR[base + free] = childR;
  wall.blobPhase[base + free] = Math.random() * Math.PI * 2;

  A[kf] = A[kp] + (Math.random() - 0.5) * 0.12;
  A[kf + 1] = A[kp + 1] + A[kp + 2] * 0.5;
  A[kf + 2] = childR * 0.1;
  A[kf + 3] = 0.9;
  B[kf] = (Math.random() - 0.5) * 0.04;
  B[kf + 1] = 0.06;
  B[kf + 2] = 1;
  B[kf + 3] = 0;
  wall.respawn[base + free] = 0;
}

function splitBlob(
  wall: LampWall,
  lamp: number,
  b: number,
  p: Params,
): boolean {
  const base = lamp * MAX_BLOBS;
  const A = wall.blobA;
  const B = wall.blobB;
  let active = 0;
  let free = -1;
  for (let s = 0; s < MAX_BLOBS; s++) {
    if (B[(base + s) * 4 + 2] >= 0.5) {
      active++;
      continue;
    }
    if (free < 0 && wall.respawn[base + s] <= 0) free = s;
  }
  if (free < 0 || active >= wall.blobCount[lamp]) return false;

  const k = (base + b) * 4;
  const kf = (base + free) * 4;
  const childR = Math.min(A[k + 2] * 0.42, 0.055 * p.blobSize);
  const parentR = Math.max(A[k + 2] * 0.72, 0.05 * p.blobSize);
  wall.targetR[base + b] = parentR;
  wall.targetR[base + free] = childR;
  A[k + 2] = parentR;

  const side = Math.random() < 0.5 ? -1 : 1;

  A[kf] = A[k] + side * parentR * 0.7;
  A[kf + 1] = A[k + 1] + 0.03;
  A[kf + 2] = childR * 0.3;
  A[kf + 3] = A[k + 3] * 0.88;
  B[kf] = side * 0.04;
  B[kf + 1] = Math.max(B[k + 1] * 0.5, 0.03);
  B[kf + 2] = 1;
  B[kf + 3] = 0.3;
  wall.blobPhase[base + free] = Math.random() * Math.PI * 2;
  return true;
}

function mergeBlobs(
  wall: LampWall,
  lamp: number,
  b1: number,
  b2: number,
  p: Params,
): void {
  const base = lamp * MAX_BLOBS;
  const A = wall.blobA;
  const B = wall.blobB;
  let big = base + b1;
  let small = base + b2;

  if (b1 !== 0 && (b2 === 0 || A[small * 4 + 2] > A[big * 4 + 2])) {
    [big, small] = [small, big];
  }
  const kb = big * 4;
  const ks = small * 4;
  const r1 = A[kb + 2];
  const r2 = A[ks + 2];
  const v1 = r1 ** 3;
  const v2 = r2 ** 3;
  const vSum = v1 + v2 + 1e-8;
  const rNew = Math.min(Math.cbrt(vSum), 0.13 * p.blobSize);
  A[kb] = (A[kb] * v1 + A[ks] * v2) / vSum;
  A[kb + 1] = (A[kb + 1] * v1 + A[ks + 1] * v2) / vSum;
  A[kb + 3] = (A[kb + 3] * v1 + A[ks + 3] * v2) / vSum;
  B[kb] = (B[kb] * v1 + B[ks] * v2) / vSum;
  B[kb + 1] = (B[kb + 1] * v1 + B[ks + 1] * v2) / vSum;
  wall.targetR[big] = rNew;
  A[kb + 2] = rNew;
  B[ks + 2] = 0;
  A[ks + 2] = 0;
  wall.respawn[small] = 4 + Math.random() * 4;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function fract(v: number): number {
  return v - Math.floor(v);
}

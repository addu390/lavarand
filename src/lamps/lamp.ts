import { MAX_BLOBS, CELL_ASPECT, THEMES, type Params } from "../params";

export type Phase = "off" | "warming" | "active" | "cooling";

export class LampWall {
  count: number;
  cols = 1;
  rows = 1;

  blobA: Float32Array;
  blobB: Float32Array;
  lampData: Float32Array;

  on: Uint8Array;
  warmth: Float32Array;
  activeTime: Float32Array;
  seed: Float32Array;

  heatJit: Float32Array;
  viscJit: Float32Array;
  buoyJit: Float32Array;
  blobCount: Uint8Array;

  targetR: Float32Array;
  respawn: Float32Array;
  blobPhase: Float32Array;
  mergeCooldown: Float32Array;

  constructor(params: Params, viewportAspect: number) {
    this.count = params.lampCount;
    const n = this.count;
    const nb = n * MAX_BLOBS;
    this.blobA = new Float32Array(nb * 4);
    this.blobB = new Float32Array(nb * 4);
    this.lampData = new Float32Array(n * 4 * 2);
    this.on = new Uint8Array(n);
    this.warmth = new Float32Array(n);
    this.activeTime = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.heatJit = new Float32Array(n);
    this.viscJit = new Float32Array(n);
    this.buoyJit = new Float32Array(n);
    this.blobCount = new Uint8Array(n);
    this.targetR = new Float32Array(nb);
    this.respawn = new Float32Array(nb);
    this.blobPhase = new Float32Array(nb);
    this.mergeCooldown = new Float32Array(n);

    this.layout(viewportAspect);
    this.initLamps(params);
    this.applyTheme(params);
  }

  layout(viewportAspect: number) {
    const cols = Math.max(
      1,
      Math.round(Math.sqrt(this.count * (viewportAspect / CELL_ASPECT))),
    );
    this.cols = Math.min(cols, this.count);
    this.rows = Math.ceil(this.count / this.cols);
  }

  private initLamps(params: Params) {
    for (let i = 0; i < this.count; i++) {
      const r = mulberry32(i * 7919 + 17);
      this.seed[i] = r();
      this.setJitters(i, r, params.variance);
      this.blobCount[i] = pickBlobCount(r, params);
      this.on[i] = 1;
      this.warmth[i] = 1;
      this.activeTime[i] = 30 + r() * 40;
      this.initBlobs(i, params, r);
    }
  }

  private setJitters(i: number, r: () => number, variance: number) {
    this.heatJit[i] = 1 + (r() - 0.5) * variance;
    this.viscJit[i] = 1 + (r() - 0.5) * variance;
    this.buoyJit[i] = 1 + (r() - 0.5) * variance;
  }

  applyVariance(params: Params) {
    for (let i = 0; i < this.count; i++) {
      const r = mulberry32(i * 7919 + 17);
      r();
      this.setJitters(i, r, params.variance);
    }
  }

  private initBlobs(lamp: number, params: Params, rand: () => number) {
    const base = lamp * MAX_BLOBS;
    const n = this.blobCount[lamp];
    const phase = this.seed[lamp];

    for (let b = 0; b < MAX_BLOBS; b++) {
      const k = (base + b) * 4;
      const active = b < n ? 1 : 0;
      this.respawn[base + b] = 0;
      this.blobPhase[base + b] = rand() * Math.PI * 2;

      if (!active) {
        this.targetR[base + b] = 0.05 * params.blobSize;
        this.blobA[k] = 0;
        this.blobA[k + 1] = 0.05;
        this.blobA[k + 2] = 0;
        this.blobA[k + 3] = 0;
        this.blobB[k] = 0;
        this.blobB[k + 1] = 0;
        this.blobB[k + 2] = 0;
        this.blobB[k + 3] = 0;
        continue;
      }

      if (b === 0) {
        const tr = (0.115 + rand() * 0.025) * params.blobSize;
        this.targetR[base + b] = tr;
        this.blobA[k] = (rand() - 0.5) * 0.15;
        this.blobA[k + 1] = 0.1;
        this.blobA[k + 2] = tr;
        this.blobA[k + 3] = 0.55;
        this.blobB[k] = 0;
        this.blobB[k + 1] = 0;
        this.blobB[k + 2] = 1;
        this.blobB[k + 3] = 1;
        continue;
      }

      const cycle = (phase + (b - 1) / Math.max(1, n - 1) + rand() * 0.05) % 1;
      let y: number;
      let heat: number;
      let vy: number;
      let tr: number;
      let x: number;

      if (cycle < 0.4) {
        y = 0.15 + (cycle / 0.4) * 0.8;
        heat = 0.92 - cycle * 0.3;
        vy = 0.05 + rand() * 0.025;
        tr = (0.07 + rand() * 0.035) * params.blobSize;
        x = (rand() - 0.5) * 0.55;
      } else if (cycle < 0.55) {
        y = 0.88 + ((cycle - 0.4) / 0.15) * 0.08;
        heat = 0.3;
        vy = -0.025 - rand() * 0.015;
        tr = (0.06 + rand() * 0.03) * params.blobSize;
        x = (rand() - 0.5) * 0.45;
      } else {
        y = 0.9 - ((cycle - 0.55) / 0.45) * 0.75;
        heat = 0.22 + rand() * 0.1;
        vy = -0.045 - rand() * 0.02;
        tr = (0.065 + rand() * 0.03) * params.blobSize;
        x = (rand() - 0.5) * 0.5;
      }

      this.targetR[base + b] = tr;
      this.blobA[k] = x;
      this.blobA[k + 1] = clamp01(y);
      this.blobA[k + 2] = tr;
      this.blobA[k + 3] = clamp01(heat);
      this.blobB[k] = (rand() - 0.5) * 0.04;
      this.blobB[k + 1] = vy;
      this.blobB[k + 2] = 1;
      this.blobB[k + 3] = 1;
    }
  }

  applyTheme(params: Params) {
    const names = Object.keys(THEMES).filter((n) => n !== "random");
    const liqRow = this.count * 4;
    for (let i = 0; i < this.count; i++) {
      const r = mulberry32(i * 104729 + 3);
      let themeName: Params["theme"];
      if (params.matrix === "alternate") {
        const col = i % this.cols;
        const row = Math.floor(i / this.cols);
        themeName = (col + row) % 2 === 0 ? params.theme : params.themeB;
      } else if (params.matrix === "mix") {
        themeName = names[Math.floor(r() * names.length)] as Params["theme"];
      } else {
        themeName = params.theme;
      }
      const t = THEMES[themeName];
      const hue =
        t.hue < 0 ? r() : (t.hue + (r() - 0.5) * 2 * t.jitter + 1) % 1;
      this.lampData[i * 4 + 1] = hue;
      this.lampData[liqRow + i * 4] = t.liquid[0];
      this.lampData[liqRow + i * 4 + 1] = t.liquid[1];
      this.lampData[liqRow + i * 4 + 2] = t.liquid[2];
    }
  }

  syncLampData() {
    for (let i = 0; i < this.count; i++) {
      this.lampData[i * 4] = this.warmth[i];
      this.lampData[i * 4 + 2] = this.on[i];
      this.lampData[i * 4 + 3] = this.seed[i];
    }
  }

  phase(i: number): Phase {
    if (this.on[i]) return this.warmth[i] >= 0.85 ? "active" : "warming";
    return this.warmth[i] > 0.02 ? "cooling" : "off";
  }

  toggle(i: number) {
    this.on[i] = this.on[i] ? 0 : 1;
    if (!this.on[i]) this.activeTime[i] = 0;
  }

  setAll(on: boolean) {
    for (let i = 0; i < this.count; i++) {
      this.on[i] = on ? 1 : 0;
      if (!on) this.activeTime[i] = 0;
    }
  }

  anyOff(): boolean {
    for (let i = 0; i < this.count; i++) if (!this.on[i]) return true;
    return false;
  }

  isStable(): boolean {
    for (let i = 0; i < this.count; i++) {
      if (this.on[i] && (this.warmth[i] < 0.98 || this.activeTime[i] < 10)) {
        return false;
      }
    }
    return true;
  }

  applyBlobCount(params: Params): void {
    for (let lamp = 0; lamp < this.count; lamp++) {
      const r = mulberry32(
        lamp * 7919 + params.blobMin * 17 + params.blobMax * 131,
      );
      this.blobCount[lamp] = pickBlobCount(r, params);
      const base = lamp * MAX_BLOBS;
      let active = 0;
      for (let b = 0; b < MAX_BLOBS; b++) {
        if (this.blobB[(base + b) * 4 + 2] >= 0.5) active++;
      }
      if (active > this.blobCount[lamp]) {
        let need = active - this.blobCount[lamp];
        for (let b = MAX_BLOBS - 1; b >= 1 && need > 0; b--) {
          const k = (base + b) * 4;
          if (this.blobB[k + 2] < 0.5) continue;
          this.blobB[k + 2] = 0;
          this.blobA[k + 2] = 0;
          this.respawn[base + b] = 999;
          need--;
        }
      } else if (active < this.blobCount[lamp]) {
        for (let b = 0; b < MAX_BLOBS; b++) {
          if (this.blobB[(base + b) * 4 + 2] >= 0.5) continue;
          if (this.respawn[base + b] > 100) this.respawn[base + b] = 0.5 + r();
        }
      }
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function pickBlobCount(r: () => number, params: Params): number {
  const lo = Math.min(params.blobMin, params.blobMax);
  const hi = Math.max(params.blobMin, params.blobMax);
  const n = lo + Math.floor(r() * (hi - lo + 1));
  return Math.min(8, Math.max(3, n));
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

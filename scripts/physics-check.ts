import { defaultParams, MAX_BLOBS } from "../src/params";
import { LampWall } from "../src/lamps/lamp";
import { step } from "../src/lamps/physics";

const params = defaultParams();
params.lampCount = 8;
params.blobMin = 5;
params.blobMax = 6;
const wall = new LampWall(params, 16 / 9);
for (let i = 0; i < wall.count; i++) {
  wall.on[i] = 1;
  wall.warmth[i] = 1;
}

const dt = 1 / 60;
const minY = new Float32Array(wall.count * MAX_BLOBS);
const maxY = new Float32Array(wall.count * MAX_BLOBS);
minY.fill(1);
maxY.fill(0);

let jitterHits = 0;
const prevY = new Float32Array(wall.count * MAX_BLOBS);
const prevVy = new Float32Array(wall.count * MAX_BLOBS);
for (let i = 0; i < prevY.length; i++) {
  prevY[i] = wall.blobA[i * 4 + 1];
  prevVy[i] = wall.blobB[i * 4 + 1];
}

for (let t = 0; t < 40; t += dt) {
  step(wall, dt * 1.8, params, t);
  for (let lamp = 0; lamp < wall.count; lamp++) {
    for (let b = 0; b < MAX_BLOBS; b++) {
      const idx = lamp * MAX_BLOBS + b;
      const k = idx * 4;
      if (wall.blobB[k + 2] < 0.5) continue;
      const y = wall.blobA[k + 1];
      const vy = wall.blobB[k + 1];
      if (y < minY[idx]) minY[idx] = y;
      if (y > maxY[idx]) maxY[idx] = y;
      if (
        Math.abs(y - prevY[idx]) < 0.002 &&
        vy * prevVy[idx] < -0.0001 &&
        Math.abs(vy) > 0.02 &&
        Math.abs(prevVy[idx]) > 0.02
      ) {
        jitterHits++;
      }
      prevY[idx] = y;
      prevVy[idx] = vy;
    }
  }
}

let trips = 0;
let risingNow = 0;
let sinkingNow = 0;
let multi = 0;
let active = 0;

for (let lamp = 0; lamp < wall.count; lamp++) {
  const ys: number[] = [];
  for (let b = 0; b < MAX_BLOBS; b++) {
    const idx = lamp * MAX_BLOBS + b;
    const k = idx * 4;
    if (wall.blobB[k + 2] < 0.5) continue;
    active++;
    const y = wall.blobA[k + 1];
    const vy = wall.blobB[k + 1];
    ys.push(y);

    if (minY[idx] < 0.25 && maxY[idx] > 0.85) trips++;
    if (vy > 0.02) risingNow++;
    if (vy < -0.02) sinkingNow++;
  }
  if (ys.length >= 3 && Math.max(...ys) - Math.min(...ys) > 0.3) multi++;
}

console.log({
  trips,
  risingNow,
  sinkingNow,
  multi: `${multi}/${wall.count}`,
  active,
  jitterHits,
});

const failures: string[] = [];
if (jitterHits > 80) failures.push(`too much position jitter (${jitterHits})`);
if (trips < 4) failures.push(`too few travelers (${trips})`);
if (risingNow + sinkingNow < 6) failures.push("almost no motion");
if (multi < wall.count * 0.5) failures.push("lamps not multi-height");
if (active < wall.count * 3) failures.push("not enough wax blobs");

if (failures.length) {
  console.error("FAIL:", failures.join("; "));
  process.exit(1);
}
console.log("PASS: calm circulating wall");

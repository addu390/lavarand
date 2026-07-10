import "./style.css";
import { defaultParams, CELL_ASPECT, MAX_BLOBS } from "./params";
import { LampWall } from "./lamps/lamp";
import { advance } from "./lamps/physics";
import { Renderer, type Camera } from "./lamps/renderer";
import { EntropyCamera } from "./entropy/camera";
import { FrameJitterSource, attachMouseSource } from "./entropy/sources";
import { Sidebar } from "./ui/sidebar";
import { PasswordPanel } from "./ui/password";
import { AdminPanel } from "./ui/admin";
import { initDock } from "./ui/dock";

const params = defaultParams();
const canvas = document.getElementById("wall") as HTMLCanvasElement;
const renderer = new Renderer(canvas);

const MAX_LAMPS = 480;

function fillGrid(): { cols: number; rows: number } {
  const rows = Math.max(1, Math.round(params.shelves));
  const cellH = window.innerHeight / rows;
  let cols = Math.max(1, Math.floor(window.innerWidth / (cellH * CELL_ASPECT)));
  cols = Math.min(cols, Math.floor(MAX_LAMPS / rows));
  return { cols, rows };
}

function syncLampCount(): void {
  if (params.fillScreen) {
    const g = fillGrid();
    params.lampCount = g.cols * g.rows;
  }
}

syncLampCount();
let wall = new LampWall(
  params,
  renderer.aspect,
  params.fillScreen ? fillGrid() : undefined,
);

const cam: Camera = { x: 0, y: 0, w: wall.cols, h: wall.rows };
let camTarget: Camera = { ...cam };
let heroLamp = -1;
const heroHint = document.getElementById("hero-hint")!;

function wallCam(): Camera {
  return { x: 0, y: 0, w: wall.cols, h: wall.rows };
}

function heroCam(lamp: number): Camera {
  const cx = lamp % wall.cols;
  const cy = Math.floor(lamp / wall.cols);

  const h = 1.18;
  const w = renderer.aspect * h;
  return { x: cx + 0.5 - w / 2, y: cy + 0.5 - h / 2, w, h };
}

function setHero(lamp: number): void {
  heroLamp = lamp;
  camTarget = lamp >= 0 ? heroCam(lamp) : wallCam();
  heroHint.hidden = lamp < 0;
  heroRot = 0;
  heroRotVel = 0;
  canvas.classList.toggle("grab", lamp >= 0);
}

let heroRot = 0;
let heroRotVel = 0;
let dragging = false;
let dragMoved = false;
let dragStartX = 0;
let dragLastX = 0;
let dragLastT = 0;

canvas.addEventListener("pointerdown", (e) => {
  if (heroLamp < 0) return;
  dragging = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragLastX = e.clientX;
  dragLastT = performance.now();
  heroRotVel = 0;
  canvas.classList.add("grabbing");
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragLastX;
  const now = performance.now();
  const dtms = Math.max(now - dragLastT, 1);
  if (Math.abs(e.clientX - dragStartX) > 5) dragMoved = true;
  if (Math.abs(dx) > 0) {
    const dRot = dx * 0.011;
    heroRot += dRot;
    const inst = (dRot / dtms) * 1000;
    heroRotVel = heroRotVel * 0.6 + inst * 0.4;
  }
  dragLastX = e.clientX;
  dragLastT = now;
});

const endDrag = (e: PointerEvent) => {
  if (!dragging) return;
  dragging = false;
  canvas.classList.remove("grabbing");
  if (canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

const sidebar = new Sidebar(document.getElementById("sidebar")!);
const entropyCam = new EntropyCamera(
  renderer,
  params,
  sidebar,
  document.getElementById("flash")!,
);
entropyCam.pool.onMix = (label) => sidebar.blip(label);
new PasswordPanel(document.getElementById("pw-panel")!, entropyCam.pool, () =>
  entropyCam.captureAndWait(),
);
const jitter = new FrameJitterSource(entropyCam.pool, params);
attachMouseSource(entropyCam.pool, params);

let fastForward = false;

const admin = new AdminPanel(document.getElementById("admin-root")!, params, {
  onMaster(on) {
    wall.setAll(on);
  },
  onFastForward() {
    if (!fastForward) {
      fastForward = true;
      admin.setFastForwarding(true);
    }
  },
  onLampCount() {
    syncLampCount();
    rebuildWall();
    admin.refreshLampCount();
  },
  onBlobs() {
    wall.applyBlobCount(params);
  },
  onVariance() {
    wall.applyVariance(params);
  },
  onTheme() {
    wall.applyTheme(params);
  },
  onMode() {
    applyRoomMode();
  },
  onCaptureNow() {
    entropyCam.requestCapture();
  },
  onRandomize() {
    admin.randomizeParams();
    rebuildWall();
  },
  onReset() {
    admin.resetParams();
    applyRoomMode();
    syncLampCount();
    rebuildWall();
  },
  allOn() {
    return !wall.anyOff();
  },
});

initDock();

function rebuildWall(): void {
  const old = wall;
  wall = new LampWall(
    params,
    renderer.aspect,
    params.fillScreen ? fillGrid() : undefined,
  );

  const n = Math.min(old.count, wall.count);
  for (let i = 0; i < n; i++) {
    wall.on[i] = old.on[i];
    wall.warmth[i] = old.warmth[i];
    wall.activeTime[i] = old.activeTime[i];
  }
  if (heroLamp >= wall.count) setHero(-1);
  camTarget = heroLamp >= 0 ? heroCam(heroLamp) : wallCam();
  admin.refreshPowerLabels();
}

canvas.addEventListener("click", (e) => {
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;
  const py = 1 - (e.clientY - rect.top) / rect.height;
  const wx = cam.x + px * cam.w;
  const wy = cam.y + py * cam.h;
  const cx = Math.floor(wx);
  const cy = Math.floor(wy);
  const inGrid = cx >= 0 && cx < wall.cols && cy >= 0 && cy < wall.rows;
  const lamp = inGrid ? cy * wall.cols + cx : -1;
  if (lamp < 0 || lamp >= wall.count) {
    setHero(-1);
    return;
  }

  const aspect = renderer.aspect * (cam.h / cam.w);
  const qx = (wx - cx - 0.5) * aspect;
  const qy = wy - cy;

  const onBase = qy > 0.04 && qy < 0.41 && Math.abs(qx) < 0.28;
  const onLamp = qy > 0.04 && qy < 0.98 && Math.abs(qx) < 0.28;

  if (heroLamp >= 0) {
    if (onBase && lamp === heroLamp) {
      wall.toggle(lamp);
      admin.refreshPowerLabels();
    } else {
      setHero(-1);
    }
  } else if (onBase) {
    wall.toggle(lamp);
    admin.refreshPowerLabels();
  } else if (onLamp) {
    setHero(lamp);
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setHero(-1);
});

window.addEventListener("resize", () => {
  renderer.resize();
  if (params.fillScreen) {
    const g = fillGrid();
    if (g.cols !== wall.cols || g.rows !== wall.rows) {
      params.lampCount = g.cols * g.rows;
      rebuildWall();
      admin.refreshLampCount();
    }
  } else {
    wall.layout(renderer.aspect);
    wall.applyTheme(params);
  }
  camTarget = heroLamp >= 0 ? heroCam(heroLamp) : wallCam();
});

function applyRoomMode(): void {
  document.body.classList.toggle("light", params.mode === "light");
}
applyRoomMode();

const simClock = { t: Math.random() * 1000 };
const accumulator = { acc: 0 };
let lastNow = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - lastNow) / 1000, 1 / 30);
  lastNow = now;

  jitter.tick(now);

  const ts = fastForward ? 8 : params.timeScale;
  advance(wall, dt, params, ts, simClock, accumulator);
  if (fastForward && wall.isStable()) {
    fastForward = false;
    admin.setFastForwarding(false);
  }

  if (!dragging && heroLamp >= 0 && Math.abs(heroRotVel) > 1e-4) {
    heroRot += heroRotVel * dt;
    heroRotVel *= Math.exp(-dt * 3.2);
  }

  const k = 1 - Math.exp(-dt * 6);
  cam.x += (camTarget.x - cam.x) * k;
  cam.y += (camTarget.y - cam.y) * k;
  cam.w += (camTarget.w - cam.w) * k;
  cam.h += (camTarget.h - cam.h) * k;

  const detail = Math.min(1, Math.max(0, (2.2 - cam.h) / 1.08));

  wall.syncLampData();
  renderer.render(wall, cam, {
    time: simClock.t,
    detail,
    glow: params.glow,
    light: params.mode === "light" ? 1 : 0,
    rot: heroRot,
    hero: heroLamp,
  });
  entropyCam.afterRender(now);

  requestAnimationFrame(frame);
}

renderer.resize();
requestAnimationFrame(frame);

window.addEventListener("lava-hero", ((e: CustomEvent<number>) => {
  setHero(e.detail ?? -1);
}) as EventListener);
Object.assign(window as never, {
  __lava: {
    params,
    get wall() {
      return wall;
    },
    setHero,
    MAX_BLOBS,
    get rot() {
      return heroRot;
    },
    get hero() {
      return heroLamp;
    },
  },
});

export const MAX_BLOBS = 10;
export const CELL_ASPECT = 0.46;

export interface ThemeDef {
  hue: number;

  jitter: number;

  liquid: [number, number, number];
}

export const THEMES: Record<string, ThemeDef> = {
  classic: { hue: 0.07, jitter: 0.008, liquid: [0.12, 0.38, 0.85] },
  magma: { hue: 0.02, jitter: 0.012, liquid: [0.18, 0.08, 0.32] },
  emerald: { hue: 0.1, jitter: 0.015, liquid: [0.04, 0.28, 0.22] },
  sunset: { hue: 0.95, jitter: 0.015, liquid: [0.12, 0.18, 0.45] },
  random: { hue: -1, jitter: 1, liquid: [0.08, 0.3, 0.6] },
};

export type Matrix = "uniform" | "alternate" | "mix";
export type RoomMode = "dark" | "light";

export interface Params {
  lampCount: number;
  timeScale: number;

  warmupSec: number;
  heatPower: number;
  viscosity: number;
  buoyancy: number;

  blobMin: number;
  blobMax: number;

  variance: number;
  blobSize: number;
  glow: number;
  theme: keyof typeof THEMES;

  themeB: keyof typeof THEMES;

  matrix: Matrix;

  mode: RoomMode;
  captureIntervalSec: number;
  srcLamps: boolean;
  srcJitter: boolean;
  srcMouse: boolean;
  srcCsprng: boolean;
}

export function defaultParams(): Params {
  return {
    lampCount: 96,
    timeScale: 1.8,
    warmupSec: 90,
    heatPower: 1.0,
    viscosity: 1.1,
    buoyancy: 1.0,
    blobMin: 5,
    blobMax: 7,
    variance: 0.4,
    blobSize: 1.3,
    glow: 0.95,
    theme: "emerald",
    themeB: "sunset",
    matrix: "alternate",
    mode: "dark",
    captureIntervalSec: 10,
    srcLamps: true,
    srcJitter: true,
    srcMouse: true,
    srcCsprng: false,
  };
}

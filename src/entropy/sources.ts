import type { EntropyPool } from "./pool";
import type { Params } from "../params";

export class FrameJitterSource {
  private buf = new Float64Array(64);
  private idx = 0;
  private last = 0;

  constructor(
    private pool: EntropyPool,
    private params: Params,
  ) {}

  tick(now: number): void {
    if (this.last > 0) {
      this.buf[this.idx++] = now - this.last;
      if (this.idx >= this.buf.length) {
        this.idx = 0;
        if (this.params.srcJitter) {
          void this.pool.mix(
            "jitter",
            new Uint8Array(this.buf.buffer.slice(0)),
          );
        }
      }
    }
    this.last = now;
  }
}

export function attachMouseSource(pool: EntropyPool, params: Params): void {
  const buf = new Float64Array(48);
  let idx = 0;
  window.addEventListener("pointermove", (e) => {
    buf[idx++] = performance.now();
    buf[idx++] = e.clientX;
    buf[idx++] = e.clientY;
    if (idx >= buf.length) {
      idx = 0;
      if (params.srcMouse) {
        void pool.mix("mouse", new Uint8Array(buf.buffer.slice(0)));
      }
    }
  });
}

export async function mixCsprng(pool: EntropyPool): Promise<void> {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  await pool.mix("csprng", b);
}

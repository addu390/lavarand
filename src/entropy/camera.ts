import type { Renderer } from "../lamps/renderer";
import type { Params } from "../params";
import { EntropyPool, toCoins, toDie, toHex, toUuid } from "./pool";
import { mixCsprng } from "./sources";
import type { Sidebar } from "../ui/sidebar";

export class EntropyCamera {
  readonly pool = new EntropyPool();
  private nextCapture = 0;
  private pending = false;
  private busy = false;
  private waiters: (() => void)[] = [];

  constructor(
    private renderer: Renderer,
    private params: Params,
    private sidebar: Sidebar,
    private flashEl: HTMLElement,
  ) {}

  requestCapture(): void {
    this.pending = true;
  }

  captureAndWait(): Promise<void> {
    this.pending = true;
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  afterRender(nowMs: number): void {
    const interval = this.params.captureIntervalSec * 1000;

    if (!this.params.captureEnabled) {
      this.nextCapture = 0;
      this.sidebar.setPaused(true);
    } else {
      if (this.nextCapture === 0) this.nextCapture = nowMs + 1500;
      if (nowMs >= this.nextCapture) {
        this.pending = true;
        this.nextCapture = nowMs + interval;
      }
      this.sidebar.setPaused(false);
      this.sidebar.setCountdown(
        1 - Math.max(0, this.nextCapture - nowMs) / interval,
      );
    }

    if (!this.pending || this.busy) return;
    this.pending = false;
    this.busy = true;

    const pixels = this.renderer.readPixels();
    this.sidebar.setThumbnail(this.renderer.canvas);
    this.flash();

    void this.develop(pixels.slice(0)).finally(() => {
      this.busy = false;
    });
  }

  private flash(): void {
    this.flashEl.classList.remove("active");

    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("active");
  }

  private async develop(pixels: Uint8Array<ArrayBuffer>): Promise<void> {
    if (this.params.srcLamps) {
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", pixels),
      );
      await this.pool.mix("lamps", digest);
    }
    if (this.params.srcCsprng) {
      await mixCsprng(this.pool);
    }

    const out = await this.pool.derive(72);
    this.sidebar.publish({
      digest: toHex(out.subarray(0, 32)),
      uuid: toUuid(out.subarray(32, 48)),
      d20: toDie(out.subarray(48, 64), 20),
      coins: toCoins(out.subarray(64, 72), 8),
      mixes: this.pool.totalMixes,
    });
    for (const resolve of this.waiters.splice(0)) resolve();
  }
}

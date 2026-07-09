import type { SourceLabel } from "../entropy/pool";

export interface PublishedOutputs {
  digest: string;
  uuid: string;
  d20: number;
  coins: string;
  password: string;
  mixes: number;
}

const SOURCE_NAMES: Record<SourceLabel, string> = {
  lamps: "Lamp pixels",
  jitter: "Frame jitter",
  mouse: "Mouse noise",
  csprng: "Platform CSPRNG",
};

export class Sidebar {
  private thumbCtx: CanvasRenderingContext2D;
  private pausedEl: HTMLElement;
  private camWrap: HTMLElement;
  private paused = false;
  private digestEl: HTMLElement;
  private historyEl: HTMLElement;
  private outputsEl: HTMLElement;
  private countdownEl: HTMLElement;
  private mixCountEl: HTMLElement;
  private sourceDots = new Map<SourceLabel, HTMLElement>();
  private history: string[] = [];

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <section class="panel">
        <h2>Camera</h2>
        <div class="panel-body cam-wrap">
          <canvas class="thumb" width="288" height="162"></canvas>
          <div class="cam-paused" hidden>capture paused</div>
          <div class="countdown"><div class="countdown-fill"></div></div>
        </div>
      </section>
      <section class="panel">
        <h2>Latest digest <span class="mix-count"></span></h2>
        <div class="panel-body">
          <div class="digest">awaiting first capture&hellip;</div>
          <div class="history"></div>
        </div>
      </section>
      <section class="panel">
        <h2>Derived randomness</h2>
        <div class="panel-body">
          <div class="outputs">
            <div class="out-row"><span class="out-label">UUID</span><span class="out-val" data-k="uuid">&mdash;</span></div>
            <div class="out-row"><span class="out-label">d20 roll</span><span class="out-val" data-k="d20">&mdash;</span></div>
            <div class="out-row"><span class="out-label">8 coins</span><span class="out-val" data-k="coins">&mdash;</span></div>
            <div class="out-row"><span class="out-label">Password</span><span class="out-val" data-k="password">&mdash;</span></div>
          </div>
          <p class="hint">click a value to copy</p>
        </div>
      </section>
      <section class="panel">
        <h2>Entropy sources</h2>
        <div class="panel-body sources"></div>
      </section>
    `;

    root.querySelectorAll<HTMLElement>(".panel h2").forEach((h2) => {
      h2.addEventListener("click", () => {
        h2.closest(".panel")!.classList.toggle("collapsed");
      });
    });
    this.thumbCtx = root
      .querySelector<HTMLCanvasElement>(".thumb")!
      .getContext("2d")!;
    this.pausedEl = root.querySelector(".cam-paused")!;
    this.camWrap = root.querySelector(".cam-wrap")!;
    this.digestEl = root.querySelector(".digest")!;
    this.historyEl = root.querySelector(".history")!;
    this.outputsEl = root.querySelector(".outputs")!;
    this.countdownEl = root.querySelector(".countdown-fill")!;
    this.mixCountEl = root.querySelector(".mix-count")!;

    const sourcesEl = root.querySelector(".sources")!;
    (Object.keys(SOURCE_NAMES) as SourceLabel[]).forEach((label) => {
      const row = document.createElement("div");
      row.className = "source-row";
      row.innerHTML = `<span class="dot"></span><span>${SOURCE_NAMES[label]}</span>`;
      sourcesEl.appendChild(row);
      this.sourceDots.set(label, row.querySelector(".dot")!);
    });

    this.outputsEl.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest(".out-val");
      if (el?.textContent && el.textContent !== "\u2014") {
        void navigator.clipboard?.writeText(el.textContent);
        el.classList.remove("copied");
        void (el as HTMLElement).offsetWidth;
        el.classList.add("copied");
      }
    });
  }

  setThumbnail(glCanvas: HTMLCanvasElement): void {
    const c = this.thumbCtx.canvas;
    this.thumbCtx.drawImage(glCanvas, 0, 0, c.width, c.height);
  }

  setCountdown(frac: number): void {
    this.countdownEl.style.width = `${Math.min(1, Math.max(0, frac)) * 100}%`;
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.pausedEl.hidden = !paused;
    this.camWrap.classList.toggle("paused", paused);
    if (paused) this.countdownEl.style.width = "0%";
  }

  blip(label: SourceLabel): void {
    const dot = this.sourceDots.get(label);
    if (!dot) return;
    dot.classList.remove("blip");
    void dot.offsetWidth;
    dot.classList.add("blip");
  }

  publish(o: PublishedOutputs): void {
    if (
      this.digestEl.textContent &&
      !this.digestEl.textContent.startsWith("awaiting")
    ) {
      this.history.unshift(this.digestEl.textContent);
      this.history = this.history.slice(0, 6);
      this.historyEl.innerHTML = this.history
        .map((h) => `<div class="hist-row">${h}</div>`)
        .join("");
    }
    this.digestEl.textContent = o.digest;
    this.mixCountEl.textContent = `· ${o.mixes} mixes`;
    const set = (k: string, v: string) => {
      this.outputsEl.querySelector(`[data-k="${k}"]`)!.textContent = v;
    };
    set("uuid", o.uuid);
    set("d20", String(o.d20));
    set("coins", o.coins);
    set("password", o.password);
  }
}

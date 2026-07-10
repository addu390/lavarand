import type { EntropyPool } from "../entropy/pool";

const SETS: Record<string, string> = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  num: "0123456789",
  sym: "!@#$%^&*-_=+",
};

const AMBIGUOUS = /[IlO01o]/g;

const SCORE_LABELS = ["very weak", "weak", "fair", "strong", "very strong"];

type Checker = InstanceType<typeof import("@zxcvbn-ts/core").ZxcvbnFactory>;

export class PasswordPanel {
  private textEl: HTMLElement;
  private meterEl: HTMLElement;
  private strengthEl: HTMLElement;
  private infoEl: HTMLElement;
  private lenInput: HTMLInputElement;
  private lenVal: HTMLElement;
  private lenFill: HTMLElement;
  private toggles: HTMLInputElement[];
  private capToggle: HTMLInputElement;
  private checker: Checker | null = null;
  private seq = 0;

  constructor(
    root: HTMLElement,
    private pool: EntropyPool,
    private capture: () => Promise<void>,
  ) {
    this.textEl = root.querySelector(".pw-text")!;
    this.meterEl = root.querySelector(".pw-meter-fill")!;
    this.strengthEl = root.querySelector(".pw-strength")!;
    this.infoEl = root.querySelector(".pw-info")!;
    this.lenInput = root.querySelector(".pw-len")!;
    this.lenVal = root.querySelector(".knob-val")!;
    this.lenFill = root.querySelector(".dual-fill")!;
    this.toggles = Array.from(
      root.querySelectorAll<HTMLInputElement>(".pw-toggles input[data-set]"),
    );
    this.capToggle = root.querySelector<HTMLInputElement>(".pw-cap")!;
    this.capToggle.addEventListener("change", () => {
      void this.generate();
    });

    this.lenInput.addEventListener("input", () => {
      this.syncLen();
      void this.generate();
    });
    for (const t of this.toggles) {
      t.addEventListener("change", () => {
        if (this.charset().length === 0) {
          t.checked = true;
          return;
        }
        void this.generate();
      });
    }
    root.querySelector(".pw-gen")!.addEventListener("click", () => {
      void this.generate();
    });
    const out = root.querySelector<HTMLElement>(".pw-out")!;
    out.addEventListener("click", () => {
      const text = this.textEl.textContent;
      if (text && text !== "\u2014") {
        void navigator.clipboard?.writeText(text);
        out.classList.remove("copied");
        void out.offsetWidth;
        out.classList.add("copied");
      }
    });

    this.syncLen();
    void this.generate(true);
    void this.loadZxcvbn();
  }

  private syncLen(): void {
    const min = parseInt(this.lenInput.min, 10);
    const max = parseInt(this.lenInput.max, 10);
    const val = parseInt(this.lenInput.value, 10);
    this.lenVal.textContent = String(val);
    this.lenFill.style.left = "0%";
    this.lenFill.style.width = `${((val - min) / (max - min)) * 100}%`;
  }

  private charset(): string {
    const easy = this.toggles.find((t) => t.dataset.set === "easy")!.checked;
    let chars = "";
    for (const t of this.toggles) {
      if (t.dataset.set !== "easy" && t.checked) chars += SETS[t.dataset.set!];
    }
    return easy ? chars.replace(AMBIGUOUS, "") : chars;
  }

  private async loadZxcvbn(): Promise<void> {
    const [core, common, en] = await Promise.all([
      import("@zxcvbn-ts/core"),
      import("@zxcvbn-ts/language-common"),
      import("@zxcvbn-ts/language-en"),
    ]);
    this.checker = new core.ZxcvbnFactory({
      dictionary: { ...common.dictionary, ...en.dictionary },
      graphs: common.adjacencyGraphs,
      translations: en.translations,
    });
    const text = this.textEl.textContent;
    if (text && text !== "\u2014") this.rate(text);
  }

  async generate(skipCapture = false): Promise<void> {
    const id = ++this.seq;
    if (!skipCapture && this.capToggle.checked) {
      await this.capture();
      if (id !== this.seq) return;
    }
    const len = parseInt(this.lenInput.value, 10);
    const chars = this.charset();
    const limit = 256 - (256 % chars.length);
    let s = "";
    while (s.length < len) {
      const bytes = await this.pool.derive((len - s.length) * 2);
      if (id !== this.seq) return;
      for (const b of bytes) {
        if (s.length >= len) break;
        if (b < limit) s += chars[b % chars.length];
      }
    }
    this.textEl.textContent = s;
    this.rate(s);
  }

  private rate(password: string): void {
    const bits = Math.round(
      password.length * Math.log2(this.charset().length),
    );
    if (!this.checker) {
      this.strengthEl.textContent = "\u2026";
      this.infoEl.textContent = `${bits} bits`;
      return;
    }
    const r = this.checker.check(password);
    this.meterEl.style.width = `${((r.score + 1) / 5) * 100}%`;
    this.strengthEl.textContent = SCORE_LABELS[r.score];
    const crack = r.crackTimes.offlineSlowHashingXPerSecond.display;
    this.infoEl.textContent = `${bits} bits \u00b7 ${crack} to crack`;
  }
}

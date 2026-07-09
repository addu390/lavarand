import { THEMES, defaultParams, type Params } from "../params";

export interface AdminActions {
  onMaster(on: boolean): void;
  onFastForward(): void;
  onLampCount(): void;
  onBlobs(): void;
  onVariance(): void;
  onTheme(): void;
  onMode(): void;
  onCaptureNow(): void;
  onRandomize(): void;
  onReset(): void;
  allOn(): boolean;
}

interface SliderDef {
  key: keyof Params;
  label: string;
  min: number;
  max: number;
  step: number;
  onChange?: "lamps" | "blobs" | "variance";
  format?: (v: number) => string;
}

const SLIDERS: { section: string; items: SliderDef[] }[] = [
  {
    section: "Simulation",
    items: [
      {
        key: "timeScale",
        label: "Time scale",
        min: 1,
        max: 60,
        step: 1,
        format: (v) => `${v}x`,
      },
      {
        key: "warmupSec",
        label: "Warm-up duration",
        min: 30,
        max: 600,
        step: 10,
        format: (v) => `${v}s`,
      },
    ],
  },
  {
    section: "Physics",
    items: [
      { key: "heatPower", label: "Bulb heat", min: 0.2, max: 3, step: 0.05 },
      { key: "viscosity", label: "Viscosity", min: 0.2, max: 3, step: 0.05 },
      { key: "buoyancy", label: "Buoyancy", min: 0.2, max: 3, step: 0.05 },

      { key: "blobSize", label: "Blob size", min: 0.6, max: 1.6, step: 0.05 },
      {
        key: "variance",
        label: "Per-lamp variance",
        min: 0,
        max: 1,
        step: 0.05,
        onChange: "variance",
      },
    ],
  },
  {
    section: "Appearance",
    items: [
      {
        key: "shelves",
        label: "Shelves",
        min: 2,
        max: 8,
        step: 1,
        onChange: "lamps",
      },
      {
        key: "lampCount",
        label: "Lamp count",
        min: 24,
        max: 384,
        step: 4,
        onChange: "lamps",
      },
      { key: "glow", label: "Glow intensity", min: 0, max: 2, step: 0.05 },
    ],
  },
  {
    section: "Entropy",
    items: [
      {
        key: "captureIntervalSec",
        label: "Capture interval",
        min: 2,
        max: 300,
        step: 1,
        format: (v) =>
          v >= 60 ? `${Math.floor(v / 60)}m${v % 60 ? ` ${v % 60}s` : ""}` : `${v}s`,
      },
    ],
  },
];

const TOGGLES: { key: keyof Params; label: string }[] = [
  { key: "captureEnabled", label: "Auto capture" },
  { key: "srcLamps", label: "Lamp pixels" },
  { key: "srcJitter", label: "Frame jitter" },
  { key: "srcMouse", label: "Mouse noise" },
  { key: "srcCsprng", label: "Platform CSPRNG" },
];

export class AdminPanel {
  private root: HTMLElement;
  private ffBtn!: HTMLButtonElement;
  private masterBtn!: HTMLButtonElement;
  private lampKnob: {
    wrap: HTMLElement;
    input: HTMLInputElement;
    val: Element;
    setFill: () => void;
  } | null = null;
  private shelvesKnob: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    private params: Params,
    private actions: AdminActions,
  ) {
    this.root = document.createElement("div");
    this.root.className = "admin-drawer shell";
    container.appendChild(this.root);
    this.build();
  }

  private build(): void {
    this.root.innerHTML = "";

    const power = document.createElement("div");
    power.className = "admin-section";
    power.innerHTML = `<h3>Power</h3>`;
    const row = document.createElement("div");
    row.className = "btn-row";
    this.masterBtn = button("", () => {
      this.actions.onMaster(!this.actions.allOn());
      this.refreshPowerLabels();
    });
    this.ffBtn = button("Fast-forward to stable", () =>
      this.actions.onFastForward(),
    );
    row.append(this.masterBtn, this.ffBtn);
    power.appendChild(row);
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "tip: click a lamp\u2019s base to flip its own switch";
    power.appendChild(note);
    this.root.appendChild(power);
    this.refreshPowerLabels();

    for (const group of SLIDERS) {
      const sec = document.createElement("div");
      sec.className = "admin-section";
      sec.innerHTML = `<h3>${group.section}</h3>`;
      if (group.section === "Appearance") {
        sec.appendChild(this.fillScreenToggle());
      }
      for (const def of group.items) sec.appendChild(this.slider(def));
      if (group.section === "Physics") {
        sec.appendChild(
          this.rangeSlider("Blobs per lamp", "blobMin", "blobMax", 3, 8, () =>
            this.actions.onBlobs(),
          ),
        );
      }
      if (group.section === "Appearance") this.appearanceControls(sec);
      if (group.section === "Entropy") {
        for (const t of TOGGLES) sec.appendChild(this.toggle(t.key, t.label));
        const cap = button("Capture now", () => this.actions.onCaptureNow());
        cap.classList.add("wide");
        sec.appendChild(cap);
      }
      this.root.appendChild(sec);
    }

    const foot = document.createElement("div");
    foot.className = "btn-row admin-section";
    foot.append(
      button("Randomize all", () => {
        this.actions.onRandomize();
        this.build();
      }),
      button("Reset defaults", () => {
        this.actions.onReset();
        this.build();
      }),
    );
    this.root.appendChild(foot);
  }

  private rangeSlider(
    label: string,
    keyLo: keyof Params,
    keyHi: keyof Params,
    min: number,
    max: number,
    onChange: () => void,
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "knob";
    const lo = this.params[keyLo] as number;
    const hi = this.params[keyHi] as number;
    wrap.innerHTML = `
      <span class="knob-label">${label}</span>
      <div class="dual">
        <div class="dual-track"><div class="dual-fill"></div></div>
        <input class="lo" type="range" min="${min}" max="${max}" step="1" value="${lo}">
        <input class="hi" type="range" min="${min}" max="${max}" step="1" value="${hi}">
      </div>
      <span class="knob-val"></span>
    `;
    const loEl = wrap.querySelector<HTMLInputElement>(".lo")!;
    const hiEl = wrap.querySelector<HTMLInputElement>(".hi")!;
    const fill = wrap.querySelector<HTMLElement>(".dual-fill")!;
    const valEl = wrap.querySelector(".knob-val")!;

    const sync = () => {
      const a = parseInt(loEl.value, 10);
      const b = parseInt(hiEl.value, 10);
      (this.params[keyLo] as number) = Math.min(a, b);
      (this.params[keyHi] as number) = Math.max(a, b);
      const l = ((Math.min(a, b) - min) / (max - min)) * 100;
      const r = ((Math.max(a, b) - min) / (max - min)) * 100;
      fill.style.left = `${l}%`;
      fill.style.width = `${r - l}%`;
      valEl.textContent =
        a === b ? `${a}` : `${Math.min(a, b)}\u2013${Math.max(a, b)}`;
    };
    sync();
    loEl.addEventListener("input", () => {
      sync();
      onChange();
    });
    hiEl.addEventListener("input", () => {
      sync();
      onChange();
    });
    return wrap;
  }

  private slider(def: SliderDef): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "knob";
    const fmt =
      def.format ?? ((v: number) => (def.step >= 1 ? String(v) : v.toFixed(2)));
    const val = this.params[def.key] as number;

    wrap.innerHTML = `
      <span class="knob-label">${def.label}</span>
      <div class="dual single">
        <div class="dual-track"><div class="dual-fill"></div></div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}">
      </div>
      <span class="knob-val">${fmt(val)}</span>
    `;
    const input = wrap.querySelector("input")!;
    const fill = wrap.querySelector<HTMLElement>(".dual-fill")!;
    const valEl = wrap.querySelector(".knob-val")!;
    const setFill = () => {
      const pct =
        ((parseFloat(input.value) - def.min) / (def.max - def.min)) * 100;
      fill.style.left = "0%";
      fill.style.width = `${pct}%`;
    };
    setFill();
    if (def.key === "lampCount") {
      this.lampKnob = { wrap, input, val: valEl, setFill };
      this.syncLampKnob();
    }
    if (def.key === "shelves") {
      this.shelvesKnob = wrap;
      this.syncLampKnob();
    }
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      (this.params[def.key] as number) = v;
      valEl.textContent = fmt(v);
      setFill();
      if (def.onChange === "lamps") this.actions.onLampCount();
      if (def.onChange === "blobs") this.actions.onBlobs();
      if (def.onChange === "variance") this.actions.onVariance();
    });
    return wrap;
  }

  private fillScreenToggle(): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "knob toggle";
    wrap.innerHTML = `
      <span class="knob-label">Fill screen</span>
      <input type="checkbox" ${this.params.fillScreen ? "checked" : ""}>
    `;
    wrap.querySelector("input")!.addEventListener("change", (e) => {
      this.params.fillScreen = (e.target as HTMLInputElement).checked;
      this.syncLampKnob();
      this.actions.onLampCount();
    });
    return wrap;
  }

  private syncLampKnob(): void {
    const auto = this.params.fillScreen;
    if (this.lampKnob) {
      this.lampKnob.input.disabled = auto;
      this.lampKnob.wrap.classList.toggle("dimmed", auto);
    }
    this.shelvesKnob?.classList.toggle("dimmed", !auto);
  }

  refreshLampCount(): void {
    if (!this.lampKnob) return;
    const v = this.params.lampCount;
    this.lampKnob.input.value = String(v);
    this.lampKnob.val.textContent = String(v);
    this.lampKnob.setFill();
  }

  private appearanceControls(sec: HTMLElement): void {
    sec.appendChild(
      this.select("Room", ["dark", "light"], this.params.mode, (v) => {
        this.params.mode = v as Params["mode"];
        this.actions.onMode();
      }),
    );

    const themes = Object.keys(THEMES);
    const altRow = this.select("Alt type", themes, this.params.themeB, (v) => {
      this.params.themeB = v as Params["theme"];
      this.actions.onTheme();
    });
    const syncAlt = () => {
      altRow.style.display = this.params.matrix === "alternate" ? "" : "none";
    };

    sec.appendChild(
      this.select(
        "Matrix",
        ["uniform", "alternate", "mix"],
        this.params.matrix,
        (v) => {
          this.params.matrix = v as Params["matrix"];
          syncAlt();
          this.actions.onTheme();
        },
      ),
    );
    sec.appendChild(
      this.select("Lamp type", themes, this.params.theme, (v) => {
        this.params.theme = v as Params["theme"];
        this.actions.onTheme();
      }),
    );
    sec.appendChild(altRow);
    syncAlt();
  }

  private select(
    label: string,
    options: string[],
    current: string,
    onChange: (v: string) => void,
  ): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "knob";
    const opts = options
      .map(
        (t) =>
          `<option value="${t}" ${t === current ? "selected" : ""}>${t}</option>`,
      )
      .join("");
    wrap.innerHTML = `<span class="knob-label">${label}</span><select>${opts}</select>`;
    wrap.querySelector("select")!.addEventListener("change", (e) => {
      onChange((e.target as HTMLSelectElement).value);
    });
    return wrap;
  }

  private toggle(key: keyof Params, label: string): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "knob toggle";
    wrap.innerHTML = `
      <span class="knob-label">${label}</span>
      <input type="checkbox" ${this.params[key] ? "checked" : ""}>
    `;
    wrap.querySelector("input")!.addEventListener("change", (e) => {
      (this.params[key] as boolean) = (e.target as HTMLInputElement).checked;
    });
    return wrap;
  }

  refreshPowerLabels(): void {
    this.masterBtn.textContent = this.actions.allOn()
      ? "Switch all off"
      : "Switch all on";
  }

  setFastForwarding(active: boolean): void {
    this.ffBtn.textContent = active
      ? "Fast-forwarding\u2026"
      : "Fast-forward to stable";
    this.ffBtn.disabled = active;
  }

  randomizeParams(): void {
    const r = Math.random;
    this.params.heatPower = round2(0.5 + r() * 2);
    this.params.viscosity = round2(0.5 + r() * 2);
    this.params.buoyancy = round2(0.5 + r() * 2);
    this.params.blobMin = 3 + Math.floor(r() * 4);
    this.params.blobMax = Math.min(
      8,
      this.params.blobMin + 1 + Math.floor(r() * 3),
    );
    this.params.variance = round2(r() * 0.8);
    this.params.blobSize = round2(0.6 + r());
    this.params.glow = round2(0.5 + r() * 1.2);
    const themes = Object.keys(THEMES);
    this.params.theme = themes[
      Math.floor(r() * themes.length)
    ] as Params["theme"];
    this.params.themeB = themes[
      Math.floor(r() * themes.length)
    ] as Params["theme"];
    const matrices: Params["matrix"][] = ["uniform", "alternate", "mix"];
    this.params.matrix = matrices[Math.floor(r() * matrices.length)];
  }

  resetParams(): void {
    const d = defaultParams();

    for (const k of Object.keys(d) as (keyof Params)[]) {
      (this.params[k] as unknown) = d[k];
    }
  }
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function round2(v: number): number {
  return Math.round(v * 20) / 20;
}

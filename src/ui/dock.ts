export function initDock(): void {
  const dock = document.getElementById("dock")!;
  const collapseBtn = document.getElementById("dock-collapse")!;
  const tabs = Array.from(
    dock.querySelectorAll<HTMLButtonElement>(".dock-tab"),
  );
  const views: Record<string, HTMLElement> = {
    panels: document.getElementById("sidebar")!,
    controls: document.getElementById("admin-root")!,
  };

  const setTab = (name: string): void => {
    for (const t of tabs) t.classList.toggle("active", t.dataset.tab === name);
    for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
  };

  const setCollapsed = (collapsed: boolean): void => {
    dock.classList.toggle("collapsed", collapsed);
    collapseBtn.classList.toggle("closed", collapsed);
  };

  for (const t of tabs) {
    t.addEventListener("click", () => {
      setTab(t.dataset.tab!);
      setCollapsed(false);
    });
  }
  collapseBtn.addEventListener("click", () => {
    setCollapsed(!dock.classList.contains("collapsed"));
  });

  setTab("panels");
  setCollapsed(window.matchMedia("(max-width: 900px)").matches);
}

import type { MarsFeature } from "../data/types";
import { descriptorKey } from "../data/types";

interface ListOpts {
  onPick: (id: number) => void;
}

export interface ListApi {
  setQuery(q: string): void;
  highlight(id: number | null): void;
}

export function createList(
  filtersEl: HTMLElement,
  listEl: HTMLElement,
  features: MarsFeature[],
  opts: ListOpts,
): ListApi {
  const classes = Array.from(new Set(features.map((f) => descriptorKey(f.type))))
    .filter(Boolean)
    .sort();

  let query = "";
  let cls = "all";
  let sort: "name" | "size" = "name";
  let activeId: number | null = null;

  filtersEl.innerHTML = `
    <label class="field">
      <span>Class</span>
      <select id="f-class">
        <option value="all">All classes (${features.length})</option>
        ${classes
          .map((c) => `<option value="${c}">${c[0].toUpperCase()}${c.slice(1)}</option>`)
          .join("")}
      </select>
    </label>
    <label class="field">
      <span>Sort</span>
      <select id="f-sort">
        <option value="name">Name (A–Z)</option>
        <option value="size">Size (largest)</option>
      </select>
    </label>
    <p id="f-count" class="f-count"></p>`;

  const classSel = filtersEl.querySelector<HTMLSelectElement>("#f-class")!;
  const sortSel = filtersEl.querySelector<HTMLSelectElement>("#f-sort")!;
  const countEl = filtersEl.querySelector<HTMLParagraphElement>("#f-count")!;

  classSel.addEventListener("change", () => { cls = classSel.value; render(); });
  sortSel.addEventListener("change", () => { sort = sortSel.value as "name" | "size"; render(); });

  function matches(f: MarsFeature): boolean {
    if (cls !== "all" && descriptorKey(f.type) !== cls) return false;
    if (query && !f.name.toLowerCase().includes(query)) return false;
    return true;
  }

  function render(): void {
    const rows = features.filter(matches).sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : (b.diameterKm ?? 0) - (a.diameterKm ?? 0),
    );
    countEl.textContent = `${rows.length} feature${rows.length === 1 ? "" : "s"}`;

    const frag = document.createDocumentFragment();
    for (const f of rows) {
      const row = document.createElement("button");
      row.className = "row" + (f.id === activeId ? " is-active" : "");
      row.type = "button";
      row.dataset.id = String(f.id);
      row.setAttribute("role", "option");
      row.innerHTML =
        `<span class="row__name">${f.name}</span>` +
        `<span class="row__meta">${descriptorKey(f.type)}` +
        `${f.diameterKm ? ` · ${Math.round(f.diameterKm)} km` : ""}</span>`;
      row.addEventListener("click", () => opts.onPick(f.id));
      frag.appendChild(row);
    }
    listEl.replaceChildren(frag);
  }

  render();

  return {
    setQuery(q: string) {
      query = q.trim().toLowerCase();
      render();
    },
    highlight(id: number | null) {
      activeId = id;
      for (const el of listEl.querySelectorAll<HTMLElement>(".row")) {
        const on = el.dataset.id === String(id);
        el.classList.toggle("is-active", on);
        if (on) el.scrollIntoView({ block: "nearest" });
      }
    },
  };
}

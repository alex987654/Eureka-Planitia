import type { MarsFeature } from "../data/types";
import { descriptorKey } from "../data/types";
import type { ColloquialFeature, LandingSite } from "../data/supplementary";

// One row model for everything the catalogue can show: official features,
// landing sites, and informal (colloquial) features. Built once at boot.
export interface CatalogueRow {
  id: number;
  name: string;
  clsKey: string; // descriptor class | "landing" | "informal"
  meta: string; // small second line
  searchText: string; // lowercase haystack; official features include their aliases
  sizeKm: number | null; // size-sort key
}

export function buildCatalogueRows(
  features: MarsFeature[],
  sites: LandingSite[],
  colloquial: ColloquialFeature[],
): CatalogueRow[] {
  const rows: CatalogueRow[] = [];
  for (const f of features) {
    const cls = descriptorKey(f.type);
    const aka = (f.aka ?? []).map((a) => a.alias);
    rows.push({
      id: f.id,
      name: f.name,
      clsKey: cls,
      meta:
        cls +
        (f.diameterKm ? ` · ${Math.round(f.diameterKm)} km` : "") +
        (aka.length ? ` · “${aka.join("”, “")}”` : ""),
      searchText: [f.name, ...aka].join(" ").toLowerCase(),
      sizeKm: f.diameterKm,
    });
  }
  for (const s of sites) {
    rows.push({
      id: s.id,
      name: s.name,
      clsKey: "landing",
      meta: `landing site · ${s.landingDate.slice(0, 4)}`,
      searchText: `${s.name} ${s.mission} ${s.craft} ${s.memorialName}`.toLowerCase(),
      sizeKm: null,
    });
  }
  for (const c of colloquial) {
    rows.push({
      id: c.id,
      name: c.name,
      clsKey: "informal",
      meta: `${c.classShort} · informal`,
      searchText: `${c.name} ${c.region}`.toLowerCase(),
      sizeKm: c.sizeKm,
    });
  }
  return rows;
}

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
  rows: CatalogueRow[],
  opts: ListOpts,
): ListApi {
  const classes = Array.from(
    new Set(rows.filter((r) => r.clsKey !== "landing" && r.clsKey !== "informal").map((r) => r.clsKey)),
  )
    .filter(Boolean)
    .sort();
  const hasLanding = rows.some((r) => r.clsKey === "landing");
  const hasInformal = rows.some((r) => r.clsKey === "informal");

  let query = "";
  let cls = "all";
  let sort: "name" | "size" = "name";
  let activeId: number | null = null;

  filtersEl.innerHTML = `
    <label class="field">
      <span>Class</span>
      <select id="f-class">
        <option value="all">All classes (${rows.length})</option>
        ${classes
          .map((c) => `<option value="${c}">${c[0].toUpperCase()}${c.slice(1)}</option>`)
          .join("")}
        ${hasLanding ? `<option value="landing">Landing sites</option>` : ""}
        ${hasInformal ? `<option value="informal">Informal names</option>` : ""}
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

  function matches(r: CatalogueRow): boolean {
    if (cls !== "all" && r.clsKey !== cls) return false;
    if (query && !r.searchText.includes(query)) return false;
    return true;
  }

  function render(): void {
    const shown = rows.filter(matches).sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : (b.sizeKm ?? 0) - (a.sizeKm ?? 0),
    );
    countEl.textContent = `${shown.length} feature${shown.length === 1 ? "" : "s"}`;

    const frag = document.createDocumentFragment();
    for (const r of shown) {
      const row = document.createElement("button");
      row.className = "row" + (r.id === activeId ? " is-active" : "");
      row.type = "button";
      row.dataset.id = String(r.id);
      row.setAttribute("role", "option");
      row.innerHTML =
        `<span class="row__name">${r.name}</span>` +
        `<span class="row__meta">${r.meta}</span>`;
      row.addEventListener("click", () => opts.onPick(r.id));
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

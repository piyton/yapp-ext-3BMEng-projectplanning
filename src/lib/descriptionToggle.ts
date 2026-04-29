/**
 * description HTML mutations — flip individuele Quill-checklist items
 * (<li data-list="checked|unchecked">) in een task-description.
 *
 * De walker spiegelt `parseDescriptionSections` + `sectionItems` +
 * `uncategorisedItems` uit phaseDetection.ts, zodat (canonieke category +
 * index) bij lezen en schrijven naar hetzelfde <li> wijst.
 *
 * Canonieke categorie komt uit SECTION_ALIASES:
 *  - "startInfo" / "controle" / "werk", of null (ongerubriceerd)
 *
 * Volgorde-regels die de parser gebruikt (toChecklistItems-volgorde):
 *  - startInfo: items onder headers die naar "startInfo" alias'en
 *  - controle:  items onder headers die naar "controle"  alias'en
 *  - werk:      items onder "werk"-headers, DAARNA de ongerubriceerde items
 *    (uncategorisedItems)
 */

import { SECTION_ALIASES } from "./constants";

type Category = "startInfo" | "controle" | "werk";

function headerTag(tag: string): boolean {
  return tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5";
}

function categoryForHeader(raw: string): Category | null {
  const key = raw.toLowerCase().replace(/\s+/g, " ").replace(/:$/, "");
  return SECTION_ALIASES[key] ?? null;
}

/**
 * Bouw per canonieke categorie een array van matching `<li>` elementen in
 * exact dezelfde volgorde als phaseDetection's toChecklistItems-output.
 */
function indexChecklistItems(root: Element): Record<Category, Element[]> {
  const byCategory: Record<Category, Element[]> = {
    startInfo: [],
    controle: [],
    werk: [],
  };
  // Verzamel tijdelijk per sectie, want "werk" krijgt uncategorised ACHTER
  // de expliciete werk-items aangehangen.
  const werkHeaderItems: Element[] = [];
  const uncategorised: Element[] = [];

  let currentCategory: Category | null = null;
  let inHeaderedSection = false;

  const walk = (node: Node): void => {
    if (!(node instanceof Element)) return;

    const tag = node.tagName.toLowerCase();

    if (headerTag(tag)) {
      const raw = (node.textContent || "").trim();
      currentCategory = categoryForHeader(raw);
      inHeaderedSection = true;
      return;
    }

    if (tag === "li") {
      const dataList = (node.getAttribute("data-list") || "").toLowerCase();
      if (dataList) {
        const text = (node.textContent || "").trim();
        if (text) {
          if (!inHeaderedSection || currentCategory === null) {
            // Geen (passende) header → valt onder uncategorised → werk
            uncategorised.push(node);
          } else if (currentCategory === "werk") {
            werkHeaderItems.push(node);
          } else {
            byCategory[currentCategory].push(node);
          }
        }
      }
      return;
    }

    for (const child of Array.from(node.childNodes)) walk(child);
  };

  walk(root);

  byCategory.werk = [...werkHeaderItems, ...uncategorised];
  return byCategory;
}

/**
 * Flip het `data-list` attribuut van één `<li>` in de description.
 * `section` is de canonieke categorie ("startInfo" | "controle" | "werk")
 * zoals opgeslagen in ChecklistItem.source.section.
 * `itemIndex` is de index binnen die canonieke categorie.
 *
 * Gooit een error als het item niet gevonden wordt.
 */
export function toggleChecklistItemInHtml(
  html: string,
  section: string,
  itemIndex: number,
  nextDone: boolean,
): string {
  if (typeof DOMParser === "undefined") {
    return toggleChecklistItemFallback(html, section, itemIndex, nextDone);
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;

  const category = section as Category;
  const index = indexChecklistItems(root);
  const list = index[category];

  if (!list || !list[itemIndex]) {
    throw new Error(
      `toggleChecklistItemInHtml: item niet gevonden (section="${section}", index=${itemIndex}, found=${list?.length ?? 0})`,
    );
  }

  list[itemIndex].setAttribute("data-list", nextDone ? "checked" : "unchecked");
  return root.innerHTML;
}

/**
 * Vervang de tekst van één checklist-item in de description-HTML.
 * Behoudt eventuele Quill `<span class="ql-ui">` markers binnen het `<li>`;
 * vervangt enkel de visuele tekst-content.
 *
 * Gooit een error als het item niet gevonden wordt.
 */
export function setChecklistItemTextInHtml(
  html: string,
  section: string,
  itemIndex: number,
  newText: string,
): string {
  if (typeof DOMParser === "undefined") {
    return setChecklistItemTextFallback(html, section, itemIndex, newText);
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;

  const category = section as Category;
  const index = indexChecklistItems(root);
  const list = index[category];

  if (!list || !list[itemIndex]) {
    throw new Error(
      `setChecklistItemTextInHtml: item niet gevonden (section="${section}", index=${itemIndex}, found=${list?.length ?? 0})`,
    );
  }

  const li = list[itemIndex];
  // Verwijder alle children behalve eventuele Quill ql-ui spans (markers).
  const preserved: Element[] = [];
  for (const child of Array.from(li.childNodes)) {
    if (
      child.nodeType === 1 &&
      (child as Element).tagName.toLowerCase() === "span" &&
      ((child as Element).getAttribute("class") || "").includes("ql-ui")
    ) {
      preserved.push(child as Element);
    }
    li.removeChild(child);
  }
  for (const span of preserved) li.appendChild(span);
  li.appendChild(doc.createTextNode(newText));
  return root.innerHTML;
}

/**
 * Zet alle `<li data-list="unchecked">` om naar `"checked"`. Gebruikt
 * wanneer een task op Completed gezet wordt — alle sub-checkboxes in de
 * description worden dan ook visueel afgevinkt.
 */
export function checkAllInHtml(html: string): string {
  if (!html) return html;
  if (typeof DOMParser === "undefined") {
    return html.replace(/data-list="unchecked"/gi, 'data-list="checked"');
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  const items = root.querySelectorAll('li[data-list="unchecked"]');
  items.forEach((li) => li.setAttribute("data-list", "checked"));
  return root.innerHTML;
}

/** Regex-fallback (geen DOMParser). Simpeler model: tel tokens in volgorde
 *  met dezelfde alias-regels. */
function toggleChecklistItemFallback(
  html: string,
  section: string,
  itemIndex: number,
  nextDone: boolean,
): string {
  const tokenRegex = /<(h[1-5])[^>]*>(.*?)<\/\1>|<li([^>]*data-list="([^"]*)"[^>]*)>(.*?)<\/li>/gis;

  const category = section as Category;
  type Hit = { start: number; end: number; attrs: string; inner: string };
  const hits: Record<Category, Hit[]> = { startInfo: [], controle: [], werk: [] };
  const werkHeaderHits: Hit[] = [];
  const uncategorisedHits: Hit[] = [];

  let currentCategory: Category | null = null;
  let inHeaderedSection = false;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[1]) {
      currentCategory = categoryForHeader(stripTags(match[2]).trim());
      inHeaderedSection = true;
      continue;
    }
    const text = stripTags(match[5]).trim();
    if (!text) continue;
    const hit: Hit = {
      start: match.index,
      end: match.index + match[0].length,
      attrs: match[3],
      inner: match[5],
    };
    if (!inHeaderedSection || currentCategory === null) {
      uncategorisedHits.push(hit);
    } else if (currentCategory === "werk") {
      werkHeaderHits.push(hit);
    } else {
      hits[currentCategory].push(hit);
    }
  }
  hits.werk = [...werkHeaderHits, ...uncategorisedHits];

  const target = hits[category]?.[itemIndex];
  if (!target) {
    throw new Error(
      `toggleChecklistItemFallback: item niet gevonden (section="${section}", index=${itemIndex})`,
    );
  }

  const newAttrs = target.attrs.replace(
    /data-list="[^"]*"/,
    `data-list="${nextDone ? "checked" : "unchecked"}"`,
  );
  return (
    html.slice(0, target.start) +
    `<li${newAttrs}>${target.inner}</li>` +
    html.slice(target.end)
  );
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Regex-fallback voor setChecklistItemTextInHtml. */
function setChecklistItemTextFallback(
  html: string,
  section: string,
  itemIndex: number,
  newText: string,
): string {
  const tokenRegex = /<(h[1-5])[^>]*>(.*?)<\/\1>|<li([^>]*data-list="([^"]*)"[^>]*)>(.*?)<\/li>/gis;

  const category = section as Category;
  type Hit = { start: number; end: number; attrs: string; inner: string };
  const hits: Record<Category, Hit[]> = { startInfo: [], controle: [], werk: [] };
  const werkHeaderHits: Hit[] = [];
  const uncategorisedHits: Hit[] = [];

  let currentCategory: Category | null = null;
  let inHeaderedSection = false;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[1]) {
      currentCategory = categoryForHeader(stripTags(match[2]).trim());
      inHeaderedSection = true;
      continue;
    }
    const text = stripTags(match[5]).trim();
    if (!text) continue;
    const hit: Hit = {
      start: match.index,
      end: match.index + match[0].length,
      attrs: match[3],
      inner: match[5],
    };
    if (!inHeaderedSection || currentCategory === null) {
      uncategorisedHits.push(hit);
    } else if (currentCategory === "werk") {
      werkHeaderHits.push(hit);
    } else {
      hits[currentCategory].push(hit);
    }
  }
  hits.werk = [...werkHeaderHits, ...uncategorisedHits];

  const target = hits[category]?.[itemIndex];
  if (!target) {
    throw new Error(
      `setChecklistItemTextFallback: item niet gevonden (section="${section}", index=${itemIndex})`,
    );
  }

  // Behoud Quill ql-ui spans uit de original inner.
  const qlUiMatches = target.inner.match(/<span[^>]*class="[^"]*ql-ui[^"]*"[^>]*>.*?<\/span>/gis) || [];
  const newInner = qlUiMatches.join("") + escapeHtml(newText);
  return (
    html.slice(0, target.start) +
    `<li${target.attrs}>${newInner}</li>` +
    html.slice(target.end)
  );
}

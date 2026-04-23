/**
 * description HTML mutations — flip individuele Quill-checklist items
 * (<li data-list="checked|unchecked">) in een task-description.
 *
 * De walker spiegelt `parseDescriptionSections` uit phaseDetection.ts qua
 * sectie-herkenning, zodat (section + index) bij lezen en schrijven naar
 * dezelfde <li> wijst.
 */

function headerTag(tag: string): boolean {
  return tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5";
}

/**
 * Flip het `data-list` attribuut van één `<li>` in de description.
 * `section` is de raw header (zoals ook opgeslagen in ChecklistItem.source.section),
 * niet de genormaliseerde categorie. `itemIndex` is de positie binnen die sectie.
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
    // Fallback: naïeve regex-aanpak — zelden nodig want dit draait in browser.
    return toggleChecklistItemFallback(html, section, itemIndex, nextDone);
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;

  let currentHeader = "";
  let indexInSection = 0;
  let matched: Element | null = null;

  const walk = (node: Node): void => {
    if (matched) return;
    if (!(node instanceof Element)) return;

    const tag = node.tagName.toLowerCase();

    if (headerTag(tag)) {
      currentHeader = (node.textContent || "").trim();
      indexInSection = 0;
      return;
    }

    if (tag === "li") {
      // Alleen items met een data-list tellen mee — bullet-items in gemengde
      // lijsten buiten de parser-scope laten we met rust.
      const dataList = (node.getAttribute("data-list") || "").toLowerCase();
      if (dataList) {
        const text = (node.textContent || "").trim();
        if (text) {
          if (currentHeader === section && indexInSection === itemIndex) {
            matched = node;
            return;
          }
          indexInSection++;
        }
      }
      return;
    }

    for (const child of Array.from(node.childNodes)) walk(child);
  };

  walk(root);

  if (!matched) {
    throw new Error(
      `toggleChecklistItemInHtml: item niet gevonden (section="${section}", index=${itemIndex})`,
    );
  }

  (matched as Element).setAttribute("data-list", nextDone ? "checked" : "unchecked");
  return root.innerHTML;
}

/**
 * Zet alle `<li data-list="checked">` om naar `"unchecked"`. Gebruikt
 * wanneer een task op Completed gezet wordt — eventuele sub-checkboxes
 * in de description worden dan ook visueel leeg.
 */
export function uncheckAllInHtml(html: string): string {
  if (!html) return html;
  if (typeof DOMParser === "undefined") {
    return html.replace(/data-list="checked"/gi, 'data-list="unchecked"');
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  const items = root.querySelectorAll('li[data-list="checked"]');
  items.forEach((li) => li.setAttribute("data-list", "unchecked"));
  return root.innerHTML;
}

/** Regex-fallback (geen DOMParser). Best-effort; produceert correcte output
 *  voor de Quill-HTML die ERPNext opslaat. */
function toggleChecklistItemFallback(
  html: string,
  section: string,
  itemIndex: number,
  nextDone: boolean,
): string {
  const tokenRegex = /<(h[1-5])[^>]*>(.*?)<\/\1>|<li([^>]*data-list="([^"]*)"[^>]*)>(.*?)<\/li>/gis;

  let currentHeader = "";
  let indexInSection = 0;
  let result = "";
  let lastIndex = 0;
  let done = false;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(html)) !== null) {
    if (done) break;
    if (match[1]) {
      currentHeader = stripTags(match[2]).trim();
      indexInSection = 0;
      continue;
    }
    // li match
    const text = stripTags(match[5]).trim();
    if (!text) continue;
    if (currentHeader === section && indexInSection === itemIndex) {
      const attrs = match[3].replace(
        /data-list="[^"]*"/,
        `data-list="${nextDone ? "checked" : "unchecked"}"`,
      );
      result += html.slice(lastIndex, match.index) + `<li${attrs}>${match[5]}</li>`;
      lastIndex = match.index + match[0].length;
      done = true;
    }
    indexInSection++;
  }
  result += html.slice(lastIndex);
  if (!done) {
    throw new Error(
      `toggleChecklistItemFallback: item niet gevonden (section="${section}", index=${itemIndex})`,
    );
  }
  return result;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

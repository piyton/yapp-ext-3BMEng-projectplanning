/**
 * Fase-detectie: ruwe ERPNext Task records → ProjectView met fases, overgangen
 * en checklist-items.
 *
 * Bronnen die we combineren:
 *  - Top-level task met subject "N_TEMPLATE CODE …" → fase-task
 *  - Top-level task met subject "Overgang FROM→TO (TEMPLATE)" → overgangs-task
 *  - Subtask (parent_task = fase-task) → nabrander onder die fase
 *  - Subtask (parent_task = overgangs-task) → extra controle/start-item (CTRL:/START: prefix)
 *  - Description HTML (Quill-formaat) → checklist-items, gegroepeerd op <h3>/<h4>-header
 */

import {
  FASE_SUBJECT_PATTERN,
  TRANSITION_SUBJECT_PATTERN,
  SUBTASK_KIND_PATTERN,
  VALID_PHASE_CODES,
  TEMPLATE_PHASES,
  SECTION_ALIASES,
} from "./constants";
import { applyOverlayAll, type TaskOverlay } from "./taskMutations";
import type {
  ChecklistItem,
  Phase,
  PhaseCode,
  PhaseStatus,
  ProjectRecord,
  ProjectView,
  SubtaskItem,
  TaskRecord,
  TemplateKind,
  Transition,
  TransitionStatus,
} from "../types";

// ─── Quill-HTML parsing ─────────────────────────────────────────────────────

type Section = {
  /** Genormaliseerde categorie, of null als ongerubriceerd. */
  category: "startInfo" | "controle" | "werk" | null;
  /** Originele header-tekst. "" als geen header. */
  header: string;
  items: { label: string; done: boolean }[];
};

/**
 * Parse een Quill-description HTML naar secties met checklist-items.
 *
 * Heuristiek:
 *  - `<h3>` / `<h4>` elementen starten een nieuwe sectie. De tekst wordt
 *     gematched tegen SECTION_ALIASES om de categorie te bepalen.
 *  - `<li>` elementen zijn items. `data-list="checked"` = done; "unchecked"
 *     of "bullet" = open; "ordered" telt als open (ongewone situatie).
 *  - Alle tekst wordt van overtollige HTML ontdaan (innerText-achtige strip).
 *
 * Werkt zowel in de browser (DOMParser) als buiten (fallback naar regex).
 */
export function parseDescriptionSections(html: string | null): Section[] {
  if (!html) return [];
  if (typeof DOMParser === "undefined") return parseDescriptionFallback(html);

  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  const sections: Section[] = [];
  let current: Section = { category: null, header: "", items: [] };

  const walk = (node: Node): void => {
    if (!(node instanceof Element)) return;

    const tag = node.tagName.toLowerCase();

    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5") {
      // Start nieuwe sectie als de vorige niet leeg is.
      if (current.header || current.items.length) {
        sections.push(current);
      }
      const raw = (node.textContent || "").trim();
      const key = raw.toLowerCase().replace(/\s+/g, " ").replace(/:$/, "");
      current = {
        category: SECTION_ALIASES[key] ?? null,
        header: raw,
        items: [],
      };
      return;
    }

    if (tag === "li") {
      const dataList = (node.getAttribute("data-list") || "").toLowerCase();
      const done = dataList === "checked";
      // Quill injects <span class="ql-ui"> markers we must strip.
      const text = (node.textContent || "").trim();
      if (text) current.items.push({ label: text, done });
      return;
    }

    for (const child of Array.from(node.childNodes)) walk(child);
  };

  walk(root);
  if (current.header || current.items.length) sections.push(current);
  return sections;
}

/** Regex-fallback voor omgevingen zonder DOMParser (tests). */
function parseDescriptionFallback(html: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { category: null, header: "", items: [] };

  const tokenRegex = /<(h[1-5])[^>]*>(.*?)<\/\1>|<li[^>]*data-list="([^"]*)"[^>]*>(.*?)<\/li>/gis;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[1]) {
      if (current.header || current.items.length) sections.push(current);
      const raw = stripTags(match[2]).trim();
      const key = raw.toLowerCase().replace(/\s+/g, " ").replace(/:$/, "");
      current = {
        category: SECTION_ALIASES[key] ?? null,
        header: raw,
        items: [],
      };
    } else if (match[3] !== undefined) {
      const done = match[3] === "checked";
      const text = stripTags(match[4]).trim();
      if (text) current.items.push({ label: text, done });
    }
  }
  if (current.header || current.items.length) sections.push(current);
  return sections;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

function sectionItems(
  sections: Section[],
  category: "startInfo" | "controle" | "werk",
): { label: string; done: boolean }[] {
  return sections.filter((s) => s.category === category).flatMap((s) => s.items);
}

/** Items zonder expliciete categorie — vallen onder "werk" als fallback. */
function uncategorisedItems(sections: Section[]): { label: string; done: boolean }[] {
  return sections.filter((s) => s.category === null).flatMap((s) => s.items);
}

function toChecklistItems(
  raw: { label: string; done: boolean }[],
  taskName: string,
  section: string,
): ChecklistItem[] {
  return raw.map((item, index) => ({
    id: `${taskName}::${section}::${index}`,
    label: item.label,
    done: item.done,
    source: { taskName, itemIndex: index, section },
  }));
}

// ─── Subject-herkenning ─────────────────────────────────────────────────────

type PhaseMatch = { template: TemplateKind; code: PhaseCode };

function matchPhaseSubject(subject: string): PhaseMatch | null {
  const m = FASE_SUBJECT_PATTERN.exec(subject.trim());
  if (!m) return null;
  const template = m[2] as TemplateKind;
  const code = m[3] as PhaseCode;
  if (!VALID_PHASE_CODES.has(code)) return null;
  return { template, code };
}

type TransitionMatch = { template: TemplateKind; from: PhaseCode; to: PhaseCode };

function matchTransitionSubject(subject: string): TransitionMatch | null {
  const m = TRANSITION_SUBJECT_PATTERN.exec(subject.trim());
  if (!m) return null;
  const from = m[1] as PhaseCode;
  const to = m[2] as PhaseCode;
  const template = m[3] as TemplateKind;
  if (!VALID_PHASE_CODES.has(from) || !VALID_PHASE_CODES.has(to)) return null;
  return { template, from, to };
}

function matchSubtaskKind(subject: string): SubtaskItem["kind"] {
  const m = SUBTASK_KIND_PATTERN.exec(subject.trim());
  if (!m) return null;
  return m[1] as "CTRL" | "START";
}

// ─── Status-afleiding ───────────────────────────────────────────────────────

function phaseStatus(task: TaskRecord, openCount: number): PhaseStatus {
  const s = task.status.toLowerCase();
  if (s === "completed" && openCount === 0) return "compleet";
  if (s === "completed" && openCount > 0) return "afgerond";
  if (s === "working" || s === "overdue") return "actief";
  return "pending";
}

function transitionStatus(openCount: number, allDone: boolean): TransitionStatus {
  if (allDone) return "compleet";
  if (openCount > 0) return "items-missen";
  return "toekomstig";
}

// ─── Hoofdfunctie ───────────────────────────────────────────────────────────

/**
 * Bouw een ProjectView voor één project uit de ruwe ERPNext records.
 * De classification (bucket/urgencyScore) wordt door classification.ts
 * later ingevuld — hier geven we een placeholder terug.
 */
export interface BuildOptions {
  /** `dedicated` (default) = overgang toont alleen eigen description/subtasks.
   *  `merged` = oude gedrag, voegt controle-vorige + startvereiste-volgende mee. */
  transitionSource?: "merged" | "dedicated";
  /** Optimistic overlay: overschrijf Task-velden vóór view-opbouw. */
  overlay?: TaskOverlay;
}

export function buildProjectView(
  project: ProjectRecord,
  projectTasks: TaskRecord[],
  options: BuildOptions = {},
): ProjectView {
  const transitionSource = options.transitionSource ?? "dedicated";
  if (options.overlay && options.overlay.size > 0) {
    projectTasks = applyOverlayAll(projectTasks, options.overlay);
  }
  const topLevel = projectTasks.filter((t) => !t.parent_task);
  const subtasksByParent = new Map<string, TaskRecord[]>();
  for (const t of projectTasks) {
    if (t.parent_task) {
      const arr = subtasksByParent.get(t.parent_task) ?? [];
      arr.push(t);
      subtasksByParent.set(t.parent_task, arr);
    }
  }

  // Classify top-level into fase vs overgang vs adhoc.
  const phaseTasksByCode = new Map<PhaseCode, TaskRecord>();
  const transitionTasksByKey = new Map<string, TaskRecord>();
  const adhoc: TaskRecord[] = [];
  let detectedTemplate: TemplateKind = "none";

  for (const t of topLevel) {
    const pm = matchPhaseSubject(t.subject);
    if (pm) {
      phaseTasksByCode.set(pm.code, t);
      if (detectedTemplate === "none") detectedTemplate = pm.template;
      continue;
    }
    const tm = matchTransitionSubject(t.subject);
    if (tm) {
      transitionTasksByKey.set(`${tm.from}->${tm.to}`, t);
      if (detectedTemplate === "none") detectedTemplate = tm.template;
      continue;
    }
    adhoc.push(t);
  }

  const phaseOrder: PhaseCode[] =
    detectedTemplate === "none"
      ? Array.from(phaseTasksByCode.keys())
      : TEMPLATE_PHASES[detectedTemplate];

  const phases: Phase[] = [];
  for (const code of phaseOrder) {
    const task = phaseTasksByCode.get(code);
    if (!task) continue;
    const sections = parseDescriptionSections(task.description);
    const werkRaw = [...sectionItems(sections, "werk"), ...uncategorisedItems(sections)];
    const startVRaw = sectionItems(sections, "startInfo");
    const ctrlRaw = sectionItems(sections, "controle");

    const werk = toChecklistItems(werkRaw, task.name, "werk");
    const startVereiste = toChecklistItems(startVRaw, task.name, "startInfo");
    const controle = toChecklistItems(ctrlRaw, task.name, "controle");

    const subs = (subtasksByParent.get(task.name) ?? []).map<SubtaskItem>((s) => ({
      taskName: s.name,
      subject: s.subject,
      status: s.status,
      done: s.status.toLowerCase() === "completed",
      kind: matchSubtaskKind(s.subject),
    }));

    const openCount =
      werk.filter((x) => !x.done).length +
      startVereiste.filter((x) => !x.done).length +
      controle.filter((x) => !x.done).length +
      subs.filter((x) => !x.done).length;

    phases.push({
      code,
      taskName: task.name,
      subject: task.subject,
      status: phaseStatus(task, openCount),
      dates: { start: task.exp_start_date, end: task.exp_end_date },
      werk,
      startVereiste,
      controle,
      subtasks: subs,
    });
  }

  // Single-active-phase enforcement: hoogstens één fase mag 'actief' zijn.
  // Als er meerdere staan (ERPNext inconsistentie), behoud alleen de eerste
  // in fase-volgorde; de rest valt terug naar klaar-voor-start.
  let sawActive = false;
  for (const p of phases) {
    if (p.status === "actief") {
      if (sawActive) p.status = "klaar-voor-start";
      else sawActive = true;
    }
  }

  const transitions: Transition[] = [];
  for (let i = 0; i < phaseOrder.length - 1; i++) {
    const from = phaseOrder[i];
    const to = phaseOrder[i + 1];
    const key = `${from}->${to}`;
    const task = transitionTasksByKey.get(key) ?? null;
    const fromPhase = phases.find((p) => p.code === from);
    const toPhase = phases.find((p) => p.code === to);

    // Items-bronnen afhankelijk van transitionSource:
    //   merged   → overgangs-task description + fromPhase.controle + toPhase.startVereiste
    //   dedicated → alleen overgangs-task description (en subtasks)
    const mergeFromPhases = transitionSource === "merged";
    let ctrlItems: ChecklistItem[] = mergeFromPhases && fromPhase ? fromPhase.controle : [];
    let startItems: ChecklistItem[] = mergeFromPhases && toPhase ? toPhase.startVereiste : [];
    let transSubs: SubtaskItem[] = [];

    if (task) {
      const sections = parseDescriptionSections(task.description);
      const ctrlRaw = sectionItems(sections, "controle");
      const startRaw = sectionItems(sections, "startInfo");
      ctrlItems = [
        ...toChecklistItems(ctrlRaw, task.name, "controle"),
        ...ctrlItems,
      ];
      startItems = [
        ...toChecklistItems(startRaw, task.name, "startInfo"),
        ...startItems,
      ];
      transSubs = (subtasksByParent.get(task.name) ?? []).map<SubtaskItem>((s) => ({
        taskName: s.name,
        subject: s.subject,
        status: s.status,
        done: s.status.toLowerCase() === "completed",
        kind: matchSubtaskKind(s.subject),
      }));
    }

    const totalItems = ctrlItems.length + startItems.length + transSubs.length;
    const openItems =
      ctrlItems.filter((x) => !x.done).length +
      startItems.filter((x) => !x.done).length +
      transSubs.filter((x) => !x.done).length;
    const allDone = totalItems > 0 && openItems === 0;

    transitions.push({
      from,
      to,
      taskName: task ? task.name : null,
      status: transitionStatus(openItems, allDone),
      controle: ctrlItems,
      startInfo: startItems,
      subtasks: transSubs,
    });
  }

  return {
    project,
    template: detectedTemplate,
    phases,
    transitions,
    adhocTasks: adhoc,
    classification: {
      bucket: "actueel",
      daysSinceActivity: 0,
      urgencyScore: 0,
    },
    totalHours: 0,
  };
}

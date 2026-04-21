import type { PhaseCode, TemplateKind } from "../types";

/**
 * Herkenningspatronen voor fase- en overgangs-tasks.
 *
 * Fase-task subject voorbeeld:  "2_CLT VO Voorlopig Ontwerp"
 * Overgangs-task subject voorbeeld: "Overgang VO→DO (CLT)"
 */

export const FASE_SUBJECT_PATTERN = /^([0-9])_(CLT|VL)\s+([A-Za-z]+)(?:\s+.*)?$/;

export const TRANSITION_SUBJECT_PATTERN = /^Overgang\s+([A-Za-z]+)\s*→\s*([A-Za-z]+)\s+\((CLT|VL)\)$/;

export const SUBTASK_KIND_PATTERN = /^(CTRL|START)\s*:\s*(.+)$/;

/**
 * Canonieke fase-volgorde per template. Wordt gebruikt om fases in de
 * juiste volgorde te renderen en om overgangen (fase N → fase N+1) te
 * synthetiseren als de overgangs-task ontbreekt.
 */
export const TEMPLATE_PHASES: Record<Exclude<TemplateKind, "none">, PhaseCode[]> = {
  CLT: ["Start", "SO", "VO", "DO", "TO", "UO"],
  VL: ["Start", "SO", "VO", "DO"],
};

/**
 * Alias-map — als een fase-task subject bv. "1_CLT SO Structuur Ontwerp"
 * heeft, is de code "SO". Dit staat al in de regex-group, maar we valideren
 * tegen deze set om typos of legacy-subjects eruit te vangen.
 */
export const VALID_PHASE_CODES: ReadonlySet<PhaseCode> = new Set([
  "Start",
  "SO",
  "VO",
  "DO",
  "TO",
  "UO",
]);

/**
 * Description-sectie-aliases. ERPNext description gebruikt Quill-HTML met
 * `<h3>` of `<h4>` headers. We normaliseren verschillende spellings naar één
 * canonieke categorie.
 */
export const SECTION_ALIASES: Record<string, "startInfo" | "controle" | "werk"> = {
  "start vereiste": "startInfo",
  "startvereiste": "startInfo",
  "startinformatie": "startInfo",
  "start informatie": "startInfo",
  "controle": "controle",
  "controle:": "controle",
  "controles": "controle",
  "tekenwerk": "werk",
  "tekenwerk:": "werk",
  "werk": "werk",
  "checklist": "werk",
};

/**
 * On-hold drempel — geen timesheet-boeking en geen task-modificatie
 * boven deze leeftijd = on-hold bucket.
 */
export const ON_HOLD_THRESHOLD_DAYS = 28;

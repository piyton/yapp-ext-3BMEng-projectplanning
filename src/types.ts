/**
 * Gedeelde typen voor het Projectplanning-dashboard.
 *
 * Ruwe ERPNext records (`TaskRecord`, `ProjectRecord`, `TimesheetRecord`)
 * komen via yappBridge.fetchList binnen. De fase-detectie zet die om
 * naar een boom van `ProjectView → Phase → Transition → ChecklistItem`
 * die de componenten direct kunnen renderen.
 */

// ─── Ruwe ERPNext velden ────────────────────────────────────────────────────

export interface TaskRecord {
  name: string;
  subject: string;
  project: string;
  parent_task: string | null;
  is_group: 0 | 1;
  status: string;
  /** Workflow state (Task heeft een workflow met o.a. Pending Review
   *  Intern/Extern, Information required, On Hold). Aanwezig wanneer een
   *  Task-workflow actief is. */
  workflow_state: string | null;
  priority: string;
  exp_start_date: string | null;
  exp_end_date: string | null;
  progress: number;
  description: string | null;
  modified: string;
}

export interface ProjectRecord {
  name: string;
  project_name: string;
  status: string;
  customer: string | null;
  expected_start_date: string | null;
  expected_end_date: string | null;
  percent_complete: number;
  custom_project_manager?: string | null;
  company?: string;
}

export interface TimesheetRecord {
  name: string;
  employee: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  parent_project: string | null;
}

// ─── Fase-model (afgeleid) ──────────────────────────────────────────────────

export const PHASE_CODES = ["Start", "SO", "VO", "DO", "TO", "UO"] as const;
export type PhaseCode = (typeof PHASE_CODES)[number];

export type TemplateKind = "CLT" | "VL" | "none";

export type PhaseStatus =
  | "compleet" // Task.Completed + alle items afgevinkt
  | "afgerond" // Task.Completed, maar er resten open items
  | "actief" // Task.Working of Overdue met recente activiteit
  | "klaar-voor-start" // Task.Open + vorige fase compleet + info-items ok
  | "pending"; // Task.Open zonder klaar-status

export type TransitionStatus =
  | "compleet" // alle controle- en start-items afgevinkt
  | "items-missen"
  | "toekomstig";

export interface ChecklistItem {
  /** Stabiele id — combinatie van task-name en item-index, voor React keys. */
  id: string;
  /** Tekst van het item (HTML-gestript). */
  label: string;
  done: boolean;
  /** Bron in ERPNext — welke Task-description (of subtask) dit item levert. */
  source: {
    taskName: string;
    /** Index van het item binnen de description-lijst. */
    itemIndex: number;
    /** Welke sectie binnen de description (`Controle`, `Start vereiste`, …). */
    section: string;
  };
}

export interface SubtaskItem {
  /** Task.name — de echte ERPNext Task-record (nabrander). */
  taskName: string;
  subject: string;
  status: string;
  done: boolean;
  /** `CTRL` / `START` prefix op het subject (overgangs-subtask), anders null. */
  kind: "CTRL" | "START" | null;
}

export interface Phase {
  code: PhaseCode;
  /** Naam van de bijbehorende fase-task in ERPNext. */
  taskName: string;
  /** Ruwe subject (bv. "2_CLT VO Voorlopig Ontwerp"). */
  subject: string;
  status: PhaseStatus;
  dates: { start: string | null; end: string | null };
  /** Werk-items (uit description, sectie "Tekenwerk" of ongerubriceerd). */
  werk: ChecklistItem[];
  /** Start-vereiste-items (uit description, sectie "Start vereiste"). */
  startVereiste: ChecklistItem[];
  /** Controle-items (uit description, sectie "Controle"). */
  controle: ChecklistItem[];
  /** Nabrander-subtasks (echte Task-records met parent_task = fase-task). */
  subtasks: SubtaskItem[];
}

export interface Transition {
  /** Fase vóór de overgang. */
  from: PhaseCode;
  /** Fase ná de overgang. */
  to: PhaseCode;
  /** Naam van de overgangs-task in ERPNext, of null voor synthetische overgang. */
  taskName: string | null;
  status: TransitionStatus;
  /** Controle-items (samenvoeging: description uit overgangs-task + controle uit `from`-fase-task). */
  controle: ChecklistItem[];
  /** Startinformatie-items (samenvoeging: description uit overgangs-task + start-vereiste uit `to`-fase-task). */
  startInfo: ChecklistItem[];
  /** Subtasks onder de overgangs-task (gelabeld CTRL/START). */
  subtasks: SubtaskItem[];
}

export interface ProjectView {
  project: ProjectRecord;
  template: TemplateKind;
  phases: Phase[];
  transitions: Transition[];
  /** Ad-hoc tasks die niet aan een fase-template zijn gekoppeld. */
  adhocTasks: TaskRecord[];
  /** Berekend uit classification.ts. */
  classification: {
    bucket: "actueel" | "on-hold" | "archief";
    daysSinceActivity: number;
    urgencyScore: number;
  };
  /** Totaal bestede uren voor dit project (uit timesheets). */
  totalHours: number;
}

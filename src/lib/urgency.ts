/**
 * Urgentie-berekening op basis van Task.exp_end_date en project-drempels.
 *
 * Bron van waarheid: `Task.exp_end_date` (fase-task óf overgangs-task).
 * Project-urgency = hoogste urgency van alle open fase/overgang-tasks.
 */

import type { Phase, ProjectView, Transition } from "../types";
import type { ProjectplanningSettings } from "./settings";

export type UrgencyLevel = "red" | "amber" | "none";

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayDiff(target: Date, today: Date): number {
  const MS = 1000 * 60 * 60 * 24;
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((b - a) / MS);
}

export interface UrgencyInfo {
  level: UrgencyLevel;
  /** Dagen tot deadline (negatief = overdue). `null` = geen deadline bekend. */
  daysLeft: number | null;
  deadline: Date | null;
}

export function computeUrgency(
  endDate: string | null | undefined,
  thresholds: ProjectplanningSettings["urgencyThresholds"],
  today: Date = new Date(),
): UrgencyInfo {
  const d = parseDate(endDate);
  if (!d) return { level: "none", daysLeft: null, deadline: null };
  const days = dayDiff(d, today);
  let level: UrgencyLevel = "none";
  if (days < thresholds.red) level = "red";
  else if (days < thresholds.amber) level = "amber";
  return { level, daysLeft: days, deadline: d };
}

function phaseIsOpen(phase: Phase): boolean {
  return phase.status !== "compleet" && phase.status !== "afgerond";
}

function transitionIsOpen(t: Transition): boolean {
  return t.status !== "compleet";
}

/**
 * Hoogste urgency van open fase- of overgangs-deadlines in het project.
 * Returnt ook de dichtstbijzijnde deadline (kleinste `daysLeft`).
 */
export function computeProjectUrgency(
  view: ProjectView,
  settings: ProjectplanningSettings,
  today: Date = new Date(),
): UrgencyInfo {
  const candidates: UrgencyInfo[] = [];
  for (const phase of view.phases) {
    if (!phaseIsOpen(phase)) continue;
    const u = computeUrgency(phase.dates.end, settings.urgencyThresholds, today);
    if (u.deadline) candidates.push(u);
  }
  // Project-level deadline als fallback.
  const pDeadline = computeUrgency(
    view.project.expected_end_date,
    settings.urgencyThresholds,
    today,
  );
  if (pDeadline.deadline) candidates.push(pDeadline);

  if (candidates.length === 0) return { level: "none", daysLeft: null, deadline: null };

  candidates.sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
  return candidates[0];
}

export interface UrgentTask {
  taskName: string;
  subject: string;
  phaseLabel: string;
  urgency: UrgencyInfo;
  assignees: string[];
}

/**
 * Top-N urgente fase- of overgangs-taken binnen een project (red + amber).
 * Subtasks tellen niet mee — die hebben geen deadline in ERPNext-tasks tenzij
 * expliciet ingesteld; voeg desgewenst later toe.
 */
export function computeUrgentTasks(
  view: ProjectView,
  assigneesByTask: Map<string, string[]>,
  settings: ProjectplanningSettings,
  limit = 3,
  today: Date = new Date(),
): UrgentTask[] {
  const out: UrgentTask[] = [];
  for (const phase of view.phases) {
    if (!phaseIsOpen(phase)) continue;
    const u = computeUrgency(phase.dates.end, settings.urgencyThresholds, today);
    if (u.level === "none") continue;
    out.push({
      taskName: phase.taskName,
      subject: phase.subject,
      phaseLabel: phase.code,
      urgency: u,
      assignees: assigneesByTask.get(phase.taskName) ?? [],
    });
  }
  for (const t of view.transitions) {
    if (!transitionIsOpen(t)) continue;
    if (!t.taskName) continue;
    // Transition task deadline zit niet op Transition-type; overslaan tenzij
    // taskMap/opslag beschikbaar. Voor nu: alleen fase-taken.
  }
  out.sort((a, b) => (a.urgency.daysLeft ?? Infinity) - (b.urgency.daysLeft ?? Infinity));
  return out.slice(0, limit);
}

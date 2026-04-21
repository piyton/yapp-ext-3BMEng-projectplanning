/**
 * Classificatie: bucket (actueel / on-hold / archief), urgentie-score en
 * totaal bestede uren per project.
 */

import { ON_HOLD_THRESHOLD_DAYS } from "./constants";
import type {
  ProjectView,
  TaskRecord,
  TimesheetRecord,
} from "../types";

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Vul classification, daysSinceActivity, urgencyScore en totalHours in op
 * een ProjectView op basis van de project-tasks en timesheet-records.
 *
 * Bucket-logica:
 *  - project.status = "Completed" of "Cancelled" → archief
 *  - geen timesheet-activiteit EN geen task-modificatie > 28 dagen → on-hold
 *  - anders → actueel
 *
 * Urgentie-score (hoger = urgenter, voor sortering binnen bucket):
 *  - +3 per fase met status "actief"
 *  - +2 per fase met status "klaar-voor-start"
 *  - +1 per overgang "items-missen"
 *  - -1 per 7 dagen inactiviteit (dempt bij lang stil staan)
 *  - +5 als projectdeadline < 14 dagen en niet afgerond
 */
export function classifyProject(
  view: ProjectView,
  tasks: TaskRecord[],
  timesheets: TimesheetRecord[],
  today: Date = new Date(),
): ProjectView {
  // Totaal-uren uit timesheets voor dit project.
  const projectTimesheets = timesheets.filter(
    (ts) => ts.parent_project === view.project.name,
  );
  const totalHours = projectTimesheets.reduce((sum, ts) => sum + (ts.total_hours || 0), 0);

  // Laatste activiteit: meest recente timesheet OF task modified.
  const lastTimesheet = projectTimesheets
    .map((ts) => parseDate(ts.end_date))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const lastTaskModified = tasks
    .map((t) => parseDate(t.modified))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const lastActivity =
    lastTimesheet && lastTaskModified
      ? lastTimesheet > lastTaskModified
        ? lastTimesheet
        : lastTaskModified
      : (lastTimesheet ?? lastTaskModified ?? null);

  const daysSinceActivity = lastActivity ? daysBetween(lastActivity, today) : 999;

  // Bucket.
  const projectStatus = view.project.status.toLowerCase();
  let bucket: ProjectView["classification"]["bucket"];
  if (projectStatus === "completed" || projectStatus === "cancelled") {
    bucket = "archief";
  } else if (daysSinceActivity > ON_HOLD_THRESHOLD_DAYS) {
    bucket = "on-hold";
  } else {
    bucket = "actueel";
  }

  // Urgency.
  let urgency = 0;
  for (const phase of view.phases) {
    if (phase.status === "actief") urgency += 3;
    if (phase.status === "klaar-voor-start") urgency += 2;
  }
  for (const t of view.transitions) {
    if (t.status === "items-missen") urgency += 1;
  }
  urgency -= Math.floor(daysSinceActivity / 7);

  const deadline = parseDate(view.project.expected_end_date);
  if (deadline && bucket !== "archief") {
    const days = daysBetween(today, deadline);
    if (days >= 0 && days < 14) urgency += 5;
  }

  return {
    ...view,
    classification: { bucket, daysSinceActivity, urgencyScore: urgency },
    totalHours: Math.round(totalHours * 10) / 10,
  };
}

/**
 * View-laag mapping van bestaande PhaseStatus naar de spec-vocabulaire
 * (actief / wachten / controle / ingepland / hold) die de FaseTracker gebruikt.
 *
 * phaseDetection.ts en types.ts blijven onaangetast — dit is puur
 * presentatie-logica.
 */

import type { Phase, ProjectView } from "../types";

export type FaseTrackerStatus =
  | "actief"
  | "wachten"
  | "controle"
  | "ingepland"
  | "hold";

export type FaseTrackerPosition = "done" | "current" | "future";

/**
 * Index van de "huidige" fase in `view.phases`. Voorkeur:
 * 1. status `actief`
 * 2. eerste `klaar-voor-start`
 * 3. eerste `pending`
 * 4. eerste niet-compleet/afgerond
 * 5. laatste fase
 */
export function currentPhaseIndex(view: ProjectView): number {
  const { phases } = view;
  if (phases.length === 0) return 0;
  let firstReady: number | null = null;
  let firstPending: number | null = null;
  let firstOpen: number | null = null;
  for (let i = 0; i < phases.length; i++) {
    const s = phases[i].status;
    if (s === "actief") return i;
    if (s === "klaar-voor-start" && firstReady === null) firstReady = i;
    if (s === "pending" && firstPending === null) firstPending = i;
    if (s !== "compleet" && s !== "afgerond" && firstOpen === null) firstOpen = i;
  }
  return firstReady ?? firstPending ?? firstOpen ?? phases.length - 1;
}

/**
 * Positie van een fase in de tracker: done / current / future.
 */
export function phasePosition(
  index: number,
  currentIndex: number,
  phase: Phase,
): FaseTrackerPosition {
  if (index < currentIndex) return "done";
  if (index === currentIndex) {
    // Edge case: laatste fase is volledig afgerond → toon als done.
    if (phase.status === "compleet" || phase.status === "afgerond") return "done";
    return "current";
  }
  return "future";
}

/**
 * Mapt huidige fase (+ project-context) naar de spec-status. Hold overschrijft
 * alle andere statussen op view-niveau.
 *
 * Heuristiek voor `wachten` / `controle` (niet 1-op-1 uit PhaseStatus af te
 * leiden — daarom ruwe Task.status meegeven):
 *   - wachten ← raw status `Pending Review` of overgangs-task heeft open
 *               START-subtasks.
 *   - controle ← raw status `Working` met open CTRL-subtasks in vorige
 *                overgang.
 */
export function trackerStatus(
  view: ProjectView,
  currentIndex: number,
  rawStatusByTaskName?: Map<string, string>,
): FaseTrackerStatus {
  if (view.classification.bucket === "on-hold") return "hold";

  const phase = view.phases[currentIndex];
  if (!phase) return "ingepland";

  const raw = (rawStatusByTaskName?.get(phase.taskName) ?? "").toLowerCase();
  if (raw === "pending review") return "wachten";

  // Overgang vóór de huidige fase — open START-subtasks of open controle-items
  // betekent we wachten op input/controle voordat deze fase echt loopt.
  const prevTransition = currentIndex > 0 ? view.transitions[currentIndex - 1] : null;
  if (prevTransition) {
    const openCtrl = prevTransition.controle.filter((c) => !c.done).length
      + prevTransition.subtasks.filter((s) => !s.done && s.kind === "CTRL").length;
    const openStart = prevTransition.startInfo.filter((c) => !c.done).length
      + prevTransition.subtasks.filter((s) => !s.done && s.kind === "START").length;
    if (openCtrl > 0 && phase.status === "actief") return "controle";
    if (openStart > 0 && phase.status !== "actief") return "wachten";
  }

  switch (phase.status) {
    case "actief":
      return "actief";
    case "klaar-voor-start":
    case "pending":
      return "ingepland";
    // compleet/afgerond als huidige → laatste fase, val terug op ingepland
    default:
      return "ingepland";
  }
}

/**
 * Voortgang binnen de huidige fase als 0..1 fractie. Telt alle checklist-items
 * en subtasks van de fase.
 */
export function phaseProgress01(phase: Phase): number {
  const all = [
    ...phase.werk,
    ...phase.startVereiste,
    ...phase.controle,
  ];
  const subs = phase.subtasks;
  const total = all.length + subs.length;
  if (total === 0) return phase.status === "actief" ? 0.4 : 0.05;
  const done = all.filter((i) => i.done).length + subs.filter((s) => s.done).length;
  return done / total;
}

/**
 * Open-items-aantal (voor notif-badge op een phase-bubble).
 */
export function phaseOpenCount(phase: Phase): number {
  return (
    phase.werk.filter((x) => !x.done).length +
    phase.startVereiste.filter((x) => !x.done).length +
    phase.controle.filter((x) => !x.done).length +
    phase.subtasks.filter((x) => !x.done).length
  );
}

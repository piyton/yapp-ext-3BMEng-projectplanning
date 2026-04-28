/**
 * Timeline-items voor de FaseTracker rail.
 *
 * De spec-rail toont alleen fase-bubbles — transities zijn weergegeven door
 * het rail-segment ertussen, niet door een eigen bubble. De carousel-body
 * eronder werkt nog wel met fase + transitie items (PhaseCarousel),
 * dus die behouden we in een aparte builder.
 */

import type { Phase, Transition } from "../types";
import { phaseOpenCount } from "./faseStatus";

export interface RailItem {
  /** Index in `view.phases`. */
  phaseIndex: number;
  phase: Phase;
  openCount: number;
}

export function buildRailItems(phases: Phase[]): RailItem[] {
  return phases.map((phase, i) => ({
    phaseIndex: i,
    phase,
    openCount: phaseOpenCount(phase),
  }));
}

/* === Carousel-items (fase + transitie afgewisseld) ======================
 * De carousel onder de rail toont fase- én transitiekaarten. Deze builder
 * vervangt `buildTimelineItems` uit het oude PhaseTimeline-component.
 */

export type CarouselItem =
  | { kind: "phase"; index: number; phase: Phase; phaseIndex: number; openCount: number }
  | { kind: "transition"; index: number; transition: Transition; openCount: number };

function transitionOpenCount(t: Transition): number {
  return (
    t.controle.filter((x) => !x.done).length +
    t.startInfo.filter((x) => !x.done).length +
    t.subtasks.filter((x) => !x.done).length
  );
}

export function buildCarouselItems(
  phases: Phase[],
  transitions: Transition[],
): CarouselItem[] {
  const items: CarouselItem[] = [];
  let idx = 0;
  phases.forEach((phase, i) => {
    items.push({
      kind: "phase",
      index: idx++,
      phase,
      phaseIndex: i,
      openCount: phaseOpenCount(phase),
    });
    const transition = transitions[i];
    if (transition) {
      items.push({
        kind: "transition",
        index: idx++,
        transition,
        openCount: transitionOpenCount(transition),
      });
    }
  });
  return items;
}

/** Carousel-index voor een phaseIndex (== positie in de fase-lijst). */
export function carouselIndexForPhase(
  items: CarouselItem[],
  phaseIndex: number,
): number {
  for (const it of items) {
    if (it.kind === "phase" && it.phaseIndex === phaseIndex) return it.index;
  }
  return 0;
}

/**
 * Geometrie voor de loading-bar achter de bubbles.
 *
 *   bar-done   = grijs gedeelte t/m huidige fase (excl. een kleine inset
 *                vóór de bubble zodat de bar onder de bubble eindigt).
 *   bar-active = gekleurd segment dat over de huidige fase heen loopt
 *                en doorbloedt naar rechts naar gelang voortgang.
 *
 * Voor 5 fases (indices 0..4): elke fase zit op `i * 25%`. Eén "slice"
 * tussen twee fases is dus 25%.
 */
export function railGeometry(
  phaseCount: number,
  currentIndex: number,
  currentProgress01: number,
): { doneWidth: number; activeLeft: number; activeWidth: number } {
  if (phaseCount <= 1) return { doneWidth: 0, activeLeft: 0, activeWidth: 4 };
  const slice = 100 / (phaseCount - 1);
  const doneWidth = Math.max(0, currentIndex * slice - slice * 0.4);
  const activeLeft = doneWidth;
  const clamped = Math.min(1, Math.max(0, currentProgress01));
  const activeWidth = slice * clamped + slice * 0.4;
  return { doneWidth, activeLeft, activeWidth };
}

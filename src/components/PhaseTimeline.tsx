/**
 * PhaseTimeline — horizontale bollen-timeline: fases + overgangsbollen.
 * Klik op een bol → onNavigate(index) zodat de parent de carousel opent.
 */

import type { Phase, Transition, TransitionStatus, PhaseStatus } from "../types";
import type { UrgencyLevel } from "../lib/urgency";

type TimelineItem =
  | { kind: "phase"; index: number; phase: Phase; openCount: number; urgency?: UrgencyLevel }
  | { kind: "transition"; index: number; transition: Transition; openCount: number };

function phaseBgClass(status: PhaseStatus): string {
  switch (status) {
    case "compleet":         return "bg-green-3bm-soft text-white/80";
    case "afgerond":         return "bg-green-3bm text-white";
    case "actief":           return "bg-purple-3bm text-white animate-pulse-actief";
    case "klaar-voor-start": return "bg-white border-2 border-amber-3bm text-amber-3bm animate-pulse-klaar-start";
    case "pending":          return "bg-gray-300 text-gray-500";
  }
}

function connectorClass(status: PhaseStatus | TransitionStatus | "active"): string {
  if (status === "compleet") return "bg-green-3bm-soft";
  if (status === "afgerond") return "bg-green-3bm";
  if (status === "actief" || status === "active") return "bg-purple-3bm";
  if (status === "items-missen") return "bg-amber-3bm";
  return "bg-[repeating-linear-gradient(90deg,_#d1d5db_0_6px,_transparent_6px_12px)]";
}

function phaseOpenCount(p: Phase): number {
  return (
    p.werk.filter((x) => !x.done).length +
    p.startVereiste.filter((x) => !x.done).length +
    p.controle.filter((x) => !x.done).length +
    p.subtasks.filter((x) => !x.done).length
  );
}

function transitionOpenCount(t: Transition): number {
  return (
    t.controle.filter((x) => !x.done).length +
    t.startInfo.filter((x) => !x.done).length +
    t.subtasks.filter((x) => !x.done).length
  );
}

export function buildTimelineItems(
  phases: Phase[],
  transitions: Transition[],
  urgencyByPhaseTask?: Map<string, UrgencyLevel>,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  let idx = 0;
  phases.forEach((phase, i) => {
    items.push({
      kind: "phase",
      index: idx++,
      phase,
      openCount: phaseOpenCount(phase),
      urgency: urgencyByPhaseTask?.get(phase.taskName),
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

interface Props {
  items: TimelineItem[];
  activeIndex: number | null;
  onNavigate: (index: number) => void;
  compact?: boolean;
}

export default function PhaseTimeline({ items, activeIndex, onNavigate, compact }: Props) {
  if (items.length === 0) {
    return <div className="text-xs text-gray-400 italic">geen fases</div>;
  }

  const dotSize = compact ? "w-[28px] h-[28px] text-[10px]" : "w-[40px] h-[40px] text-[11px]";
  // Gebruik flex-1 op de connectors zodat ze de beschikbare grid-kolom opvullen.
  const connectorWidth = compact ? "flex-1 min-w-[12px] mx-0.5" : "flex-1 min-w-[16px] mx-1";

  return (
    <div className="flex items-center gap-0 flex-nowrap w-full">
      {items.map((item, i) => {
        const isActive = activeIndex === item.index;
        if (item.kind === "phase") {
          const urgencyRing =
            item.urgency === "red"
              ? "ring-2 ring-red-500 ring-offset-1"
              : item.urgency === "amber"
                ? "ring-2 ring-amber-500 ring-offset-1"
                : "";
          return (
            <div key={`p-${item.phase.code}`} className="flex items-center flex-shrink-0">
              <button
                type="button"
                onClick={() => onNavigate(item.index)}
                aria-label={`Fase ${item.phase.code}`}
                className={`${dotSize} ${phaseBgClass(
                  item.phase.status,
                )} rounded-full flex items-center justify-center font-bold relative cursor-pointer flex-shrink-0 ${
                  isActive
                    ? "ring-2 ring-purple-3bm ring-offset-2"
                    : urgencyRing
                }`}
              >
                {item.phase.code === "Start" ? "▶" : item.phase.code}
                {item.openCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-amber-3bm text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center leading-none">
                    {item.openCount}
                  </span>
                )}
              </button>
              {i < items.length - 1 && (
                <div
                  className={`h-[3px] ${connectorWidth} ${connectorClass(item.phase.status)}`}
                />
              )}
            </div>
          );
        }
        // transition — alleen een pijltje, geen bol
        const arrowColor =
          item.transition.status === "compleet"      ? "text-green-700"
          : item.transition.status === "items-missen" ? "text-amber-700"
          :                                             "text-gray-400";
        const arrowSize = compact ? "text-[14px]" : "text-lg";
        return (
          <div key={`t-${item.transition.from}-${item.transition.to}`} className="flex items-center flex-shrink-0">
            <button
              type="button"
              onClick={() => onNavigate(item.index)}
              aria-label={`Overgang ${item.transition.from}→${item.transition.to}`}
              className={`${arrowSize} ${arrowColor} relative cursor-pointer flex-shrink-0 px-1 leading-none font-bold ${
                isActive ? "ring-1 ring-purple-3bm ring-offset-1 rounded" : ""
              } hover:opacity-70`}
              title={`Overgang ${item.transition.from}→${item.transition.to}`}
            >
              →
              {item.openCount > 0 && (
                <span className="absolute -top-2 -right-1 bg-amber-3bm text-white text-[8px] font-bold rounded-full min-w-[12px] h-[12px] px-0.5 flex items-center justify-center leading-none">
                  {item.openCount}
                </span>
              )}
            </button>
            {i < items.length - 1 && (
              <div
                className={`h-[3px] ${connectorWidth} ${connectorClass(item.transition.status)}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export type { TimelineItem };

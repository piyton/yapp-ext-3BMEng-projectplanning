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

/**
 * Tailwind-kleurcode (voor SVG `fill`) corresponderend met `connectorClass`.
 * Gebruikt dezelfde tinten zodat de pijl-driehoek exact aansluit op de
 * connector-balk.
 */
function connectorHex(status: PhaseStatus | TransitionStatus | "active"): string {
  if (status === "compleet") return "var(--color-green-3bm-soft)";
  if (status === "afgerond") return "var(--color-green-3bm)";
  if (status === "actief" || status === "active") return "var(--color-purple-3bm)";
  if (status === "items-missen") return "var(--color-amber-3bm)";
  return "#d1d5db";
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
              {i < items.length - 1 && (() => {
                // Kleur van de connector-stub direct ná de bol: match met
                // de volgende overgangspijl (indien aanwezig), anders fase-status.
                const nextItem = items[i + 1];
                const stubStatus = nextItem && nextItem.kind === "transition"
                  ? nextItem.transition.status
                  : item.phase.status;
                return (
                  <div
                    className={`h-[3px] w-[8px] flex-shrink-0 ${connectorClass(stubStatus)}`}
                  />
                );
              })()}
            </div>
          );
        }
        // transition — geïntegreerde pijl: connector-balk met ingebouwde
        // driehoek in dezelfde kleur, vormt visueel één lijn tussen de bollen.
        const color = connectorHex(item.transition.status);
        const arrowHeight = compact ? 14 : 18;
        return (
          <div key={`t-${item.transition.from}-${item.transition.to}`} className="flex items-center flex-shrink-0 flex-1 min-w-[32px]">
            <button
              type="button"
              onClick={() => onNavigate(item.index)}
              aria-label={`Overgang ${item.transition.from}→${item.transition.to}`}
              className={`relative cursor-pointer w-full h-[${arrowHeight}px] flex items-center justify-stretch group hover:brightness-110 transition ${
                isActive ? "ring-1 ring-purple-3bm ring-offset-1 rounded" : ""
              }`}
              style={{ height: arrowHeight }}
              title={`Overgang ${item.transition.from}→${item.transition.to}`}
            >
              <svg
                width="100%"
                height={arrowHeight}
                viewBox={`0 0 100 ${arrowHeight}`}
                preserveAspectRatio="none"
                className="block overflow-visible"
                aria-hidden="true"
              >
                {/* Doorlopende balk van links naar net vóór de pijlpunt */}
                <rect
                  x="0"
                  y={(arrowHeight - 3) / 2}
                  width="88"
                  height="3"
                  fill={color}
                />
                {/* Driehoekige pijlpunt — zelfde kleur, breed aansluitend op balk */}
                <polygon
                  points={`88,0 100,${arrowHeight / 2} 88,${arrowHeight}`}
                  fill={color}
                />
              </svg>
              {item.openCount > 0 && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-3bm text-white text-[8px] font-bold rounded-full min-w-[12px] h-[12px] px-0.5 flex items-center justify-center leading-none">
                  {item.openCount}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export type { TimelineItem };

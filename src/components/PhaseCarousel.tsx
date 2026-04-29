/**
 * PhaseCarousel — 3-kolom layout met vorige/actieve/volgende block en pijltjes.
 * Inhoud per block is ofwel PhaseDetailBlock ofwel TransitionBlock.
 */

import type { CarouselItem } from "../lib/faseTimeline";
import PhaseDetailBlock from "./PhaseDetailBlock";
import TransitionBlock from "./TransitionBlock";
import type { ChecklistItem, Phase, SubtaskItem } from "../types";
import type { UrgencyInfo } from "../lib/urgency";
import type { ProjectplanningSettings } from "../lib/settings";
import { computeUrgency } from "../lib/urgency";

interface Props {
  items: CarouselItem[];
  activeIndex: number;
  onNavigate: (index: number) => void;
  erpnextUrl?: string | null;
  settings: ProjectplanningSettings;
  /** Raw ERPNext Task.status per fase-task. */
  rawStatusByTaskName?: Map<string, string>;
  onToggleChecklist?: (item: ChecklistItem, nextDone: boolean) => void;
  onEditChecklistText?: (item: ChecklistItem, newText: string) => void;
  onToggleSubtask?: (subtask: SubtaskItem, nextDone: boolean) => void;
  onEditSubtask?: (subtask: SubtaskItem, newSubject: string) => void;
  onStartPhase?: (phase: Phase) => void;
  onSetPhaseStatus?: (phase: Phase, status: string) => void;
  onSetPhaseDates?: (phase: Phase, expStart: string | null, expEnd: string | null) => void;
}

interface RenderOpts {
  faded: boolean;
  erpnextUrl?: string | null;
  settings: ProjectplanningSettings;
  rawStatusByTaskName?: Map<string, string>;
  handlers: Pick<Props,
    "onToggleChecklist" | "onEditChecklistText" |
    "onToggleSubtask" | "onEditSubtask" |
    "onStartPhase" | "onSetPhaseStatus" | "onSetPhaseDates">;
}

function renderItem(item: CarouselItem, opts: RenderOpts) {
  if (item.kind === "phase") {
    const urgency: UrgencyInfo = computeUrgency(
      item.phase.dates.end,
      opts.settings.urgencyThresholds,
    );
    return (
      <PhaseDetailBlock
        phase={item.phase}
        faded={opts.faded}
        erpnextUrl={opts.erpnextUrl}
        urgency={urgency}
        rawStatus={opts.rawStatusByTaskName?.get(item.phase.taskName)}
        onToggleChecklist={opts.handlers.onToggleChecklist}
        onEditChecklistText={opts.faded ? undefined : opts.handlers.onEditChecklistText}
        onToggleSubtask={opts.handlers.onToggleSubtask}
        onEditSubtask={opts.handlers.onEditSubtask}
        onStartPhase={opts.faded ? undefined : opts.handlers.onStartPhase}
        onSetPhaseStatus={opts.faded ? undefined : opts.handlers.onSetPhaseStatus}
        onSetPhaseDates={opts.faded ? undefined : opts.handlers.onSetPhaseDates}
      />
    );
  }
  return (
    <TransitionBlock
      transition={item.transition}
      faded={opts.faded}
      erpnextUrl={opts.erpnextUrl}
      onToggleChecklist={opts.handlers.onToggleChecklist}
      onEditChecklistText={opts.faded ? undefined : opts.handlers.onEditChecklistText}
      onToggleSubtask={opts.handlers.onToggleSubtask}
      onEditSubtask={opts.handlers.onEditSubtask}
    />
  );
}

export default function PhaseCarousel({
  items, activeIndex, onNavigate, erpnextUrl, settings, rawStatusByTaskName,
  onToggleChecklist, onEditChecklistText, onToggleSubtask, onEditSubtask,
  onStartPhase, onSetPhaseStatus, onSetPhaseDates,
}: Props) {
  if (items.length === 0) return null;
  const prev = activeIndex > 0 ? items[activeIndex - 1] : null;
  const current = items[activeIndex];
  const next = activeIndex < items.length - 1 ? items[activeIndex + 1] : null;

  const handlers = {
    onToggleChecklist, onEditChecklistText,
    onToggleSubtask, onEditSubtask,
    onStartPhase, onSetPhaseStatus, onSetPhaseDates,
  };

  const navBtn = (direction: "prev" | "next", enabled: boolean, label: string, glyph: string) => (
    <button
      type="button"
      onClick={() => {
        if (!enabled) return;
        onNavigate(direction === "prev" ? activeIndex - 1 : activeIndex + 1);
      }}
      disabled={!enabled}
      aria-label={label}
      className={`flex-shrink-0 self-stretch flex items-center justify-center w-7 text-xl select-none ${
        enabled
          ? "text-purple-3bm cursor-pointer hover:bg-purple-3bm/10"
          : "text-gray-300 cursor-default"
      }`}
    >
      {glyph}
    </button>
  );

  return (
    <div className="flex items-stretch gap-0 mt-3">
      <div className="flex-[0.7] overflow-hidden pointer-events-none min-w-0">
        {prev ? renderItem(prev, { faded: true, erpnextUrl, settings, rawStatusByTaskName, handlers }) : null}
      </div>

      {navBtn("prev", !!prev, "Vorige", "◀")}

      <div className="flex-[1.6] min-w-0">
        {renderItem(current, { faded: false, erpnextUrl, settings, rawStatusByTaskName, handlers })}
      </div>

      {navBtn("next", !!next, "Volgende", "▶")}

      <div className="flex-[0.7] overflow-hidden pointer-events-none min-w-0">
        {next ? renderItem(next, { faded: true, erpnextUrl, settings, rawStatusByTaskName, handlers }) : null}
      </div>
    </div>
  );
}

/**
 * PhaseCarousel — 3-kolom layout met vorige/actieve/volgende block en pijltjes.
 * Inhoud per block is ofwel PhaseDetailBlock ofwel TransitionBlock.
 */

import type { TimelineItem } from "./PhaseTimeline";
import PhaseDetailBlock from "./PhaseDetailBlock";
import TransitionBlock from "./TransitionBlock";
import type { ChecklistItem, Phase, SubtaskItem } from "../types";
import type { UrgencyInfo } from "../lib/urgency";
import type { ProjectplanningSettings } from "../lib/settings";
import { computeUrgency } from "../lib/urgency";

interface Props {
  items: TimelineItem[];
  activeIndex: number;
  onNavigate: (index: number) => void;
  erpnextUrl?: string | null;
  settings: ProjectplanningSettings;
  /** Raw ERPNext Task.status per fase-task. */
  rawStatusByTaskName?: Map<string, string>;
  onToggleChecklist?: (item: ChecklistItem, nextDone: boolean) => void;
  onToggleSubtask?: (subtask: SubtaskItem, nextDone: boolean) => void;
  onEditSubtask?: (subtask: SubtaskItem, newSubject: string) => void;
  onStartPhase?: (phase: Phase) => void;
  onSetPhaseStatus?: (phase: Phase, status: string) => void;
}

interface RenderOpts {
  faded: boolean;
  erpnextUrl?: string | null;
  settings: ProjectplanningSettings;
  rawStatusByTaskName?: Map<string, string>;
  handlers: Pick<Props,
    "onToggleChecklist" | "onToggleSubtask" | "onEditSubtask" |
    "onStartPhase" | "onSetPhaseStatus">;
}

function renderItem(item: TimelineItem, opts: RenderOpts) {
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
        onToggleSubtask={opts.handlers.onToggleSubtask}
        onEditSubtask={opts.handlers.onEditSubtask}
        onStartPhase={opts.faded ? undefined : opts.handlers.onStartPhase}
        onSetPhaseStatus={opts.faded ? undefined : opts.handlers.onSetPhaseStatus}
      />
    );
  }
  return (
    <TransitionBlock
      transition={item.transition}
      faded={opts.faded}
      erpnextUrl={opts.erpnextUrl}
      onToggleChecklist={opts.handlers.onToggleChecklist}
      onToggleSubtask={opts.handlers.onToggleSubtask}
      onEditSubtask={opts.handlers.onEditSubtask}
    />
  );
}

export default function PhaseCarousel({
  items, activeIndex, onNavigate, erpnextUrl, settings, rawStatusByTaskName,
  onToggleChecklist, onToggleSubtask, onEditSubtask,
  onStartPhase, onSetPhaseStatus,
}: Props) {
  if (items.length === 0) return null;
  const prev = activeIndex > 0 ? items[activeIndex - 1] : null;
  const current = items[activeIndex];
  const next = activeIndex < items.length - 1 ? items[activeIndex + 1] : null;

  const handlers = { onToggleChecklist, onToggleSubtask, onEditSubtask, onStartPhase, onSetPhaseStatus };

  return (
    <div className="flex items-start gap-0 mt-3">
      <button
        type="button"
        onClick={() => prev && onNavigate(activeIndex - 1)}
        disabled={!prev}
        className={`px-2 pt-8 text-2xl text-purple-3bm select-none sticky top-2 self-start ${
          prev ? "cursor-pointer hover:opacity-70" : "text-gray-300 cursor-default"
        }`}
        aria-label="Vorige"
      >
        ◀
      </button>

      <div className="flex-[0.7] overflow-hidden pointer-events-none min-w-0">
        {prev ? renderItem(prev, { faded: true, erpnextUrl, settings, rawStatusByTaskName, handlers }) : null}
      </div>
      <div className="flex-[1.6] min-w-0">
        {renderItem(current, { faded: false, erpnextUrl, settings, rawStatusByTaskName, handlers })}
      </div>
      <div className="flex-[0.7] overflow-hidden pointer-events-none min-w-0">
        {next ? renderItem(next, { faded: true, erpnextUrl, settings, rawStatusByTaskName, handlers }) : null}
      </div>

      <button
        type="button"
        onClick={() => next && onNavigate(activeIndex + 1)}
        disabled={!next}
        className={`px-2 pt-8 text-2xl text-purple-3bm select-none sticky top-2 self-start ${
          next ? "cursor-pointer hover:opacity-70" : "text-gray-300 cursor-default"
        }`}
        aria-label="Volgende"
      >
        ▶
      </button>
    </div>
  );
}

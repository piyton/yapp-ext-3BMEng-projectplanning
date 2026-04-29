/**
 * Detail van één fase in de carousel: werk-checklist, start-vereiste,
 * controle, en (eventuele) nabrander-subtasks.
 */
import type { ChecklistItem, Phase, SubtaskItem } from "../types";
import { ChecklistLine, SubtaskLine } from "./ChecklistLine";
import type { UrgencyInfo } from "../lib/urgency";
import { openTask } from "../lib/yappBridge";

interface Props {
  phase: Phase;
  faded?: boolean;
  erpnextUrl?: string | null;
  onToggleChecklist?: (item: ChecklistItem, nextDone: boolean) => void;
  onEditChecklistText?: (item: ChecklistItem, newText: string) => void;
  onToggleSubtask?: (subtask: SubtaskItem, nextDone: boolean) => void;
  onEditSubtask?: (subtask: SubtaskItem, newSubject: string) => void;
  onStartPhase?: (phase: Phase) => void;
  onSetPhaseStatus?: (phase: Phase, status: string) => void;
  onSetPhaseDates?: (phase: Phase, expStart: string | null, expEnd: string | null) => void;
  /** Raw Task.status voor deze fase (zodat dropdown de juiste waarde toont). */
  rawStatus?: string;
  urgency?: UrgencyInfo;
}

const ERPNEXT_TASK_STATUSES = ["Open", "Working", "Pending Review", "Overdue", "Completed", "Cancelled"];

function phaseLabel(phase: Phase): string {
  const codeMap: Record<string, string> = {
    Start: "Start",
    SO: "Structuur Ontwerp",
    VO: "Voorlopig Ontwerp",
    DO: "Definitief Ontwerp",
    TO: "Technisch Ontwerp",
    UO: "Uitvoeringsgereed",
  };
  return `${phase.code} — ${codeMap[phase.code] ?? phase.code}`;
}

function borderColor(status: Phase["status"]): string {
  switch (status) {
    case "compleet":         return "border-green-3bm-soft bg-green-50";
    case "afgerond":         return "border-green-3bm bg-green-50";
    case "actief":           return "border-purple-3bm bg-white";
    case "klaar-voor-start": return "border-amber-3bm bg-amber-50";
    case "pending":          return "border-gray-300 bg-gray-50";
  }
}

function urgencyTextClass(level: UrgencyInfo["level"]): string {
  switch (level) {
    case "red":   return "text-red-700 font-semibold";
    case "amber": return "text-amber-700 font-semibold";
    default:      return "text-gray-500";
  }
}

export default function PhaseDetailBlock({
  phase, faded, erpnextUrl,
  onToggleChecklist, onEditChecklistText,
  onToggleSubtask, onEditSubtask,
  onStartPhase, onSetPhaseStatus, onSetPhaseDates,
  rawStatus,
  urgency,
}: Props) {
  const canStart = phase.status !== "actief" && phase.status !== "compleet" && phase.status !== "afgerond";
  const currentStatus = rawStatus ?? (phase.status === "actief" ? "Working" : phase.status === "compleet" || phase.status === "afgerond" ? "Completed" : "Open");
  const containerCls = `border-2 rounded-md p-3 h-full ${borderColor(phase.status)} ${
    faded ? "opacity-40 grayscale" : ""
  }`;
  const totalOpen =
    phase.werk.filter((x) => !x.done).length +
    phase.startVereiste.filter((x) => !x.done).length +
    phase.controle.filter((x) => !x.done).length +
    phase.subtasks.filter((x) => !x.done).length;

  return (
    <div className={containerCls}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-purple-3bm">{phaseLabel(phase)}</h3>
        {onSetPhaseStatus ? (
          <select
            value={currentStatus}
            onChange={(e) => onSetPhaseStatus(phase, e.target.value)}
            className="text-[10px] border border-gray-300 rounded px-1 py-0.5 bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            {ERPNEXT_TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <span className="text-[11px] text-gray-500">{phase.status}</span>
        )}
      </div>

      {canStart && onStartPhase && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onStartPhase(phase); }}
          className="mt-2 text-[11px] bg-purple-3bm text-white px-2 py-1 rounded hover:opacity-90"
          title="Zet deze fase op Working en sluit eventuele andere Working-fase af"
        >
          ▶ Start deze fase
        </button>
      )}
      {(phase.dates.start || phase.dates.end || onSetPhaseDates) && (
        <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
          {onSetPhaseDates ? (
            <>
              <input
                type="date"
                value={phase.dates.start ?? ""}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onSetPhaseDates(phase, e.target.value || null, phase.dates.end)}
                className="text-[11px] border border-gray-200 rounded px-1 py-0 bg-white hover:border-purple-3bm/40 focus:outline-none focus:border-purple-3bm"
                title="Verwacht start"
              />
              <span>→</span>
              <input
                type="date"
                value={phase.dates.end ?? ""}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onSetPhaseDates(phase, phase.dates.start, e.target.value || null)}
                className="text-[11px] border border-gray-200 rounded px-1 py-0 bg-white hover:border-purple-3bm/40 focus:outline-none focus:border-purple-3bm"
                title="Verwacht eind / deadline"
              />
            </>
          ) : (
            <span>{phase.dates.start ?? "?"} → {phase.dates.end ?? "?"}</span>
          )}
          {urgency && urgency.level !== "none" && urgency.daysLeft !== null && (
            <span className={urgencyTextClass(urgency.level)}>
              {urgency.daysLeft < 0
                ? `${Math.abs(urgency.daysLeft)}d te laat`
                : `nog ${urgency.daysLeft}d`}
            </span>
          )}
        </div>
      )}
      <div className="text-[11px] text-gray-400 mt-1">
        {totalOpen === 0 ? "alle items afgevinkt" : `${totalOpen} item${totalOpen === 1 ? "" : "s"} open`}
      </div>

      {phase.subtasks.length > 0 && (
        <section className="mt-3">
          <div className="text-[10px] uppercase font-bold text-purple-3bm tracking-wider mb-1">
            Subtaken
          </div>
          <ul className="list-none space-y-0.5">
            {phase.subtasks.map((s) => (
              <SubtaskLine
                key={s.taskName}
                subtask={s}
                onOpen={(name) => openTask(name).catch((e) => console.error("openTask failed:", e))}
                onToggle={onToggleSubtask}
                onEditSubject={onEditSubtask}
              />
            ))}
          </ul>
        </section>
      )}

      {phase.startVereiste.length > 0 && (
        <section className="mt-3">
          <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1">
            ⓘ Start vereiste
          </div>
          <ul className="list-none">
            {phase.startVereiste.map((i) => (
              <ChecklistLine key={i.id} item={i} onToggle={onToggleChecklist} onEditText={onEditChecklistText} />
            ))}
          </ul>
        </section>
      )}

      {phase.werk.length > 0 && (
        <section className="mt-3">
          <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1">
            Werk / tekenwerk
          </div>
          <ul className="list-none">
            {phase.werk.map((i) => (
              <ChecklistLine key={i.id} item={i} onToggle={onToggleChecklist} onEditText={onEditChecklistText} />
            ))}
          </ul>
        </section>
      )}

      {phase.controle.length > 0 && (
        <section className="mt-3">
          <div className="text-[10px] uppercase font-bold text-amber-700 tracking-wider mb-1">
            ⚠ Controle
          </div>
          <ul className="list-none">
            {phase.controle.map((i) => (
              <ChecklistLine key={i.id} item={i} onToggle={onToggleChecklist} onEditText={onEditChecklistText} />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-3 pt-2 border-t border-gray-200 flex items-center gap-3">
        <button
          type="button"
          onClick={() => openTask(phase.taskName).catch((e) => console.error("openTask failed:", e))}
          className="text-[10px] text-purple-3bm hover:underline cursor-pointer"
        >
          → bewerk {phase.taskName} in Y-app
        </button>
        {erpnextUrl && (
          <a
            href={`${erpnextUrl}/app/task/${phase.taskName}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-gray-400 hover:underline"
          >
            ERPNext
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Detail van een overgang in de carousel: controle (vorige fase) + startinfo
 * (volgende fase). Bron afhankelijk van transitionSource-setting:
 *  - `dedicated` → alleen items/subtasks uit de overgangs-task
 *  - `merged`    → plus controle uit vorige fase-task en startvereiste uit
 *                   de volgende fase-task
 */
import type { ChecklistItem, SubtaskItem, Transition } from "../types";
import { ChecklistLine, SubtaskLine } from "./ChecklistLine";

interface Props {
  transition: Transition;
  faded?: boolean;
  erpnextUrl?: string | null;
  onToggleChecklist?: (item: ChecklistItem, nextDone: boolean) => void;
  onToggleSubtask?: (subtask: SubtaskItem, nextDone: boolean) => void;
  onEditSubtask?: (subtask: SubtaskItem, newSubject: string) => void;
}

function borderColor(status: Transition["status"]): string {
  switch (status) {
    case "compleet":      return "border-green-3bm-soft";
    case "items-missen":  return "border-amber-3bm";
    case "toekomstig":    return "border-gray-300";
  }
}

export default function TransitionBlock({
  transition, faded, erpnextUrl,
  onToggleChecklist, onToggleSubtask, onEditSubtask,
}: Props) {
  const ctrlSubs = transition.subtasks.filter((s) => s.kind === "CTRL" || s.kind === null);
  const startSubs = transition.subtasks.filter((s) => s.kind === "START");

  const ctrlOpen =
    transition.controle.filter((x) => !x.done).length +
    ctrlSubs.filter((x) => !x.done).length;
  const startOpen =
    transition.startInfo.filter((x) => !x.done).length +
    startSubs.filter((x) => !x.done).length;
  const ctrlTotal = transition.controle.length + ctrlSubs.length;
  const startTotal = transition.startInfo.length + startSubs.length;

  const containerCls = `border-2 rounded-md p-3 h-full bg-gradient-to-r from-red-50 to-amber-50 ${borderColor(transition.status)} ${
    faded ? "opacity-40 grayscale" : ""
  }`;

  const openTask = (name: string) => {
    if (erpnextUrl) window.open(`${erpnextUrl}/app/task/${name}`, "_blank");
  };

  return (
    <div className={containerCls}>
      <div className="text-center text-[11px] uppercase tracking-widest font-bold text-purple-3bm mb-3">
        Overgang {transition.from} → {transition.to}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
        {/* Controle */}
        <div>
          <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-red-800 tracking-wider mb-2">
            <span>⚠ Controle {transition.from}</span>
            <span className="ml-auto text-gray-500 font-normal">
              {ctrlTotal - ctrlOpen}/{ctrlTotal}
            </span>
          </div>
          <ul className="list-none space-y-0.5">
            {ctrlSubs.map((s) => (
              <SubtaskLine
                key={s.taskName}
                subtask={s}
                onOpen={openTask}
                onToggle={onToggleSubtask}
                onEditSubject={onEditSubtask}
              />
            ))}
            {transition.controle.map((i) => (
              <ChecklistLine key={i.id} item={i} onToggle={onToggleChecklist} />
            ))}
            {ctrlTotal === 0 && <li className="text-[11px] text-gray-400 italic">geen items</li>}
          </ul>
        </div>

        <div className="flex items-center h-full text-purple-3bm text-lg">→</div>

        {/* Startinformatie */}
        <div>
          <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-amber-800 tracking-wider mb-2">
            <span>ⓘ Start {transition.to}</span>
            <span className="ml-auto text-gray-500 font-normal">
              {startTotal - startOpen}/{startTotal}
            </span>
          </div>
          <ul className="list-none space-y-0.5">
            {startSubs.map((s) => (
              <SubtaskLine
                key={s.taskName}
                subtask={s}
                onOpen={openTask}
                onToggle={onToggleSubtask}
                onEditSubject={onEditSubtask}
              />
            ))}
            {transition.startInfo.map((i) => (
              <ChecklistLine key={i.id} item={i} onToggle={onToggleChecklist} />
            ))}
            {startTotal === 0 && <li className="text-[11px] text-gray-400 italic">geen items</li>}
          </ul>
        </div>
      </div>

      {transition.taskName && erpnextUrl && (
        <div className="mt-3 pt-2 border-t border-amber-200">
          <a
            href={`${erpnextUrl}/app/task/${transition.taskName}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-purple-3bm hover:underline"
          >
            → open {transition.taskName} in ERPNext
          </a>
        </div>
      )}
      {!transition.taskName && (
        <div className="mt-3 pt-2 border-t border-amber-200 text-[10px] text-gray-500 italic">
          Synthetische overgang (afgeleid uit aangrenzende fase-tasks)
        </div>
      )}
    </div>
  );
}

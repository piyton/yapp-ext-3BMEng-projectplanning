/**
 * Compacte project-rij + uitklapbare timeline/carousel.
 * Toont deadline-chip + tot 3 urgente taken onder de rij (als settings.showUrgencyChip).
 */
import { useMemo, useState } from "react";
import type { ChecklistItem, Phase, ProjectView, SubtaskItem } from "../types";
import PhaseTimeline, { buildTimelineItems } from "./PhaseTimeline";
import PhaseCarousel from "./PhaseCarousel";
import type { ProjectplanningSettings } from "../lib/settings";
import {
  computeProjectUrgency,
  computeUrgency,
  computeUrgentTasks,
  type UrgencyLevel,
} from "../lib/urgency";
import { shortName } from "../lib/assignees";

interface Props {
  view: ProjectView;
  erpnextUrl: string | null;
  settings: ProjectplanningSettings;
  assigneesByTask: Map<string, string[]>;
  userNames: Map<string, string>;
  rawStatusByTaskName?: Map<string, string>;
  onToggleChecklist?: (item: ChecklistItem, nextDone: boolean) => void;
  onToggleSubtask?: (subtask: SubtaskItem, nextDone: boolean) => void;
  onEditSubtask?: (subtask: SubtaskItem, newSubject: string) => void;
  onStartPhase?: (phase: Phase, projectName: string) => void;
  onSetPhaseStatus?: (phase: Phase, status: string) => void;
  onAddAdhocTask?: (projectName: string, subject: string) => Promise<void> | void;
}

function templateBadge(template: ProjectView["template"]): { label: string; cls: string } {
  if (template === "CLT") return { label: "CLT", cls: "bg-emerald-50 text-emerald-700" };
  if (template === "VL")  return { label: "VL",  cls: "bg-blue-50 text-blue-700" };
  return { label: "—", cls: "bg-gray-100 text-gray-500" };
}

function chipClass(level: UrgencyLevel): string {
  if (level === "red")   return "bg-red-100 text-red-700 border border-red-300";
  if (level === "amber") return "bg-amber-100 text-amber-800 border border-amber-300";
  return "bg-gray-100 text-gray-500 border border-gray-200";
}

function formatDaysLeft(days: number | null): string {
  if (days === null) return "";
  if (days < 0) return `${Math.abs(days)}d te laat`;
  return `${days}d`;
}

/** Index van actieve fase. Voorkeur: status 'actief'. Fallback: eerste
 *  klaar-voor-start, daarna eerste pending, anders 0. */
function firstOpenPhaseIndex(items: ReturnType<typeof buildTimelineItems>): number {
  let firstReady: number | null = null;
  let firstPending: number | null = null;
  for (const it of items) {
    if (it.kind !== "phase") continue;
    const s = it.phase.status;
    if (s === "actief") return it.index;
    if (s === "klaar-voor-start" && firstReady === null) firstReady = it.index;
    if (s === "pending" && firstPending === null) firstPending = it.index;
  }
  return firstReady ?? firstPending ?? 0;
}

export default function ProjectRow({
  view, erpnextUrl, settings, assigneesByTask, userNames, rawStatusByTaskName,
  onToggleChecklist, onToggleSubtask, onEditSubtask,
  onStartPhase, onSetPhaseStatus, onAddAdhocTask,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocDraft, setAdhocDraft] = useState("");
  const [adhocSaving, setAdhocSaving] = useState(false);

  const submitAdhoc = async () => {
    const subject = adhocDraft.trim();
    if (!subject || !onAddAdhocTask) return;
    setAdhocSaving(true);
    try {
      await onAddAdhocTask(view.project.name, subject);
      setAdhocDraft("");
      setAdhocOpen(false);
    } finally {
      setAdhocSaving(false);
    }
  };

  const urgencyByPhaseTask = useMemo(() => {
    const m = new Map<string, UrgencyLevel>();
    for (const p of view.phases) {
      const u = computeUrgency(p.dates.end, settings.urgencyThresholds);
      if (u.level !== "none") m.set(p.taskName, u.level);
    }
    return m;
  }, [view.phases, settings.urgencyThresholds]);

  const items = useMemo(
    () => buildTimelineItems(view.phases, view.transitions, urgencyByPhaseTask),
    [view.phases, view.transitions, urgencyByPhaseTask],
  );

  const projectUrgency = useMemo(
    () => computeProjectUrgency(view, settings),
    [view, settings],
  );

  const urgentTasks = useMemo(
    () => computeUrgentTasks(view, assigneesByTask, settings, 3),
    [view, assigneesByTask, settings],
  );

  const badge = templateBadge(view.template);
  const isOnHold = view.classification.bucket === "on-hold";

  const openCarousel = (idx: number) => {
    setExpanded(true);
    setActiveIndex(idx);
  };

  const toggleRow = () => {
    if (expanded) {
      setExpanded(false);
      setActiveIndex(null);
    } else {
      setExpanded(true);
      setActiveIndex(firstOpenPhaseIndex(items));
    }
  };

  const jumpToPhaseTask = (taskName: string) => {
    const hit = items.find((it) => it.kind === "phase" && it.phase.taskName === taskName);
    if (hit) openCarousel(hit.index);
  };

  const showChip = settings.showUrgencyChip && projectUrgency.level !== "none";

  return (
    <div
      className={`bg-white rounded-md mb-1 border border-gray-200 overflow-hidden ${
        isOnHold ? "border-l-4 border-l-amber-3bm" : ""
      }`}
    >
      <div
        className="grid items-center px-4 py-2.5 gap-3 cursor-pointer hover:bg-gray-50 select-none"
        style={{
          gridTemplateColumns:
            "16px 40px 30px minmax(0, 1fr) 90px 1fr 60px 40px 100px",
        }}
        onClick={toggleRow}
      >
        <span
          className={`text-[10px] text-gray-400 text-center transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        <span className="text-xs text-purple-3bm font-semibold">
          {view.project.name}
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold text-center ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-xs font-semibold text-gray-900 truncate">
          {view.project.project_name}
        </span>
        {showChip && projectUrgency.daysLeft !== null ? (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap text-center ${chipClass(projectUrgency.level)}`}
            title={projectUrgency.deadline
              ? `Eerstvolgende deadline: ${projectUrgency.deadline.toISOString().slice(0, 10)}`
              : ""}
          >
            ⏱ {formatDaysLeft(projectUrgency.daysLeft)}
          </span>
        ) : (
          <span />
        )}

        <div className="overflow-visible" onClick={(e) => e.stopPropagation()}>
          <PhaseTimeline
            items={items}
            activeIndex={expanded ? activeIndex : firstOpenPhaseIndex(items)}
            onNavigate={openCarousel}
            compact
          />
        </div>

        {isOnHold ? (
          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded whitespace-nowrap text-center">
            {view.classification.daysSinceActivity}d
          </span>
        ) : (
          <span />
        )}

        <span className="text-[11px] text-gray-400 text-right">
          {view.totalHours > 0 ? `${view.totalHours}u` : "—"}
        </span>
        <span className="text-[11px] text-gray-400 text-right truncate">
          {view.project.customer ?? ""}
        </span>
      </div>

      {/* Urgente taken strip (onder header, nog in compacte stand) */}
      {settings.showUrgencyChip && !expanded && urgentTasks.length > 0 && (
        <div className="px-4 pb-2 pl-11 flex flex-wrap gap-2">
          {urgentTasks.map((t) => (
            <button
              key={t.taskName}
              type="button"
              onClick={(e) => { e.stopPropagation(); jumpToPhaseTask(t.taskName); }}
              className={`text-[10px] rounded px-1.5 py-0.5 hover:brightness-95 ${chipClass(t.urgency.level)}`}
              title={t.subject}
            >
              <span className="font-bold mr-1">{t.phaseLabel}</span>
              <span>{formatDaysLeft(t.urgency.daysLeft)}</span>
              {t.assignees.length > 0 && (
                <span className="ml-1 opacity-80">
                  · {t.assignees.map((e) => shortName(e, userNames.get(e))).join(", ")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 pl-11 border-t border-gray-100">
          {activeIndex !== null && (
            <PhaseCarousel
              items={items}
              activeIndex={activeIndex}
              onNavigate={setActiveIndex}
              erpnextUrl={erpnextUrl}
              settings={settings}
              rawStatusByTaskName={rawStatusByTaskName}
              onToggleChecklist={onToggleChecklist}
              onToggleSubtask={onToggleSubtask}
              onEditSubtask={onEditSubtask}
              onStartPhase={(phase) => onStartPhase?.(phase, view.project.name)}
              onSetPhaseStatus={onSetPhaseStatus}
            />
          )}
          <div className="mt-3 flex items-start gap-2 text-[11px] text-gray-500">
            <div className="flex-1">
              {view.adhocTasks.length > 0 && (
                <>
                  <span className="font-semibold">{view.adhocTasks.length} ad-hoc taken</span>{" "}
                  (buiten fase-structuur):{" "}
                  {view.adhocTasks.slice(0, 3).map((t) => t.subject.trim()).join(" · ")}
                  {view.adhocTasks.length > 3 ? " …" : ""}
                </>
              )}
              {view.adhocTasks.length === 0 && (
                <span className="italic text-gray-400">Geen ad-hoc taken</span>
              )}
            </div>
            {onAddAdhocTask && !adhocOpen && (
              <button
                type="button"
                onClick={() => setAdhocOpen(true)}
                className="text-[11px] px-2 py-0.5 border border-purple-3bm text-purple-3bm rounded hover:bg-purple-3bm hover:text-white transition"
                title="Voeg een ad-hoc taak toe aan dit project"
              >
                + Ad-hoc taak
              </button>
            )}
          </div>
          {adhocOpen && onAddAdhocTask && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={adhocDraft}
                onChange={(e) => setAdhocDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitAdhoc(); }
                  if (e.key === "Escape") { e.preventDefault(); setAdhocOpen(false); setAdhocDraft(""); }
                }}
                placeholder="Onderwerp ad-hoc taak…"
                disabled={adhocSaving}
                className="flex-1 text-xs border border-purple-3bm/40 rounded px-2 py-1 focus:outline-none focus:border-purple-3bm"
              />
              <button
                type="button"
                onClick={submitAdhoc}
                disabled={adhocSaving || !adhocDraft.trim()}
                className="text-[11px] px-2 py-1 bg-purple-3bm text-white rounded hover:opacity-90 disabled:opacity-40"
              >
                {adhocSaving ? "…" : "Toevoegen"}
              </button>
              <button
                type="button"
                onClick={() => { setAdhocOpen(false); setAdhocDraft(""); }}
                disabled={adhocSaving}
                className="text-[11px] text-gray-500 hover:text-gray-800"
              >
                Annuleren
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

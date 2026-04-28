/**
 * FaseTracker — status-driven phase tracker per project.
 *
 * Vervangt de oude ProjectRow + PhaseTimeline. Spec: neutrale rail (loading
 * bar) met één status-gekleurde bubble (current phase). Klik op een willekeurige
 * bubble (done/current/future) om de carousel-detail eronder te openen; status-
 * pill in de balk eronder reflecteert altijd de huidige fase, niet de geselec-
 * teerde.
 */

import { useMemo, useState } from "react";
import type { ChecklistItem, Phase, ProjectView, SubtaskItem } from "../types";
import type { ProjectplanningSettings } from "../lib/settings";
import { computeProjectUrgency } from "../lib/urgency";
import {
  buildCarouselItems,
  buildRailItems,
  carouselIndexForPhase,
  railGeometry,
  type RailItem,
} from "../lib/faseTimeline";
import {
  currentPhaseIndex,
  type FaseTrackerStatus,
  phasePosition,
  phaseProgress01,
  trackerStatus,
} from "../lib/faseStatus";
import PhaseCarousel from "./PhaseCarousel";
import { openProject } from "../lib/yappBridge";

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

const STATUS_LABEL: Record<FaseTrackerStatus, string> = {
  actief: "Actief",
  wachten: "Wacht op input",
  controle: "In controle",
  ingepland: "Ingepland",
  hold: "On-hold",
};

function StatusIcon({ status }: { status: FaseTrackerStatus }) {
  switch (status) {
    case "actief":
      return (
        <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <path d="M3.5 2.2v7.6L9.8 6 3.5 2.2z" />
        </svg>
      );
    case "wachten":
      return (
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor"
             strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 3h8v5H6.5l-2 2v-2H2V3z" fill="currentColor" fillOpacity="0.15" />
          <path d="M2 3h8v5H6.5l-2 2v-2H2V3z" />
          <path d="M4.5 5.5h3M4.5 6.8h2" />
        </svg>
      );
    case "controle":
      return (
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor"
             strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
          <path d="M1 6c1.5-2.5 3-3.8 5-3.8S9.5 3.5 11 6c-1.5 2.5-3 3.8-5 3.8S2.5 8.5 1 6z" />
          <circle cx="6" cy="6" r="1.5" fill="currentColor" />
        </svg>
      );
    case "ingepland":
      return (
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor"
             strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
          <rect x="2" y="3" width="8" height="7" rx="1" />
          <path d="M4 2v2M8 2v2M2 5.5h8" />
        </svg>
      );
    case "hold":
      return (
        <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="3.5" y="3" width="1.8" height="6" rx="0.3" />
          <rect x="6.7" y="3" width="1.8" height="6" rx="0.3" />
        </svg>
      );
  }
}

function templateBadgeLabel(template: ProjectView["template"]): string {
  if (template === "CLT") return "CLT";
  if (template === "VL") return "VL";
  return "—";
}

function formatDeadline(daysLeft: number | null, deadline: Date | null): string {
  if (daysLeft === null || !deadline) return "geen deadline";
  const iso = deadline.toISOString().slice(0, 10);
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d te laat (${iso})`;
  if (daysLeft === 0) return `vandaag (${iso})`;
  return `nog ${daysLeft}d (${iso})`;
}

function statusDetail(
  status: FaseTrackerStatus,
  current: Phase | undefined,
  view: ProjectView,
): { lead: string; who?: string } {
  if (!current) return { lead: "geen fase" };
  switch (status) {
    case "actief":
      return { lead: "Werken aan", who: current.subject.replace(/^[\d_\s]+/, "").trim() };
    case "wachten":
      return { lead: "Wacht op input voor", who: current.code };
    case "controle":
      return { lead: "Controle bezig in", who: current.code };
    case "ingepland":
      return {
        lead: "Start gepland",
        who: current.dates.start ?? view.project.expected_start_date ?? "—",
      };
    case "hold":
      return {
        lead: `On-hold sinds ${view.classification.daysSinceActivity}d, fase`,
        who: current.code,
      };
  }
}

function PhaseBubble({
  item,
  currentIndex,
  selectedPhaseIndex,
  status,
  onClick,
}: {
  item: RailItem;
  currentIndex: number;
  selectedPhaseIndex: number | null;
  status: FaseTrackerStatus;
  onClick: () => void;
}) {
  const position = phasePosition(item.phaseIndex, currentIndex, item.phase);
  const isSelected = selectedPhaseIndex === item.phaseIndex;

  const classes = ["phase", position];
  if (position === "current") classes.push(status);
  if (isSelected) classes.push("selected");

  const showIcon = position === "current";

  return (
    <button
      type="button"
      className={classes.join(" ")}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={`Fase ${item.phase.code}`}
    >
      <span className="bubble">
        {position === "done" ? null : item.phase.code}
        {showIcon && (
          <span className="state-icon"><StatusIcon status={status} /></span>
        )}
        {item.openCount > 0 && position !== "current" && (
          <span className="notif">{item.openCount}</span>
        )}
      </span>
      <span className="label">{item.phase.code}</span>
      {isSelected && <span className="drop" />}
    </button>
  );
}

export default function FaseTracker({
  view, erpnextUrl, settings, rawStatusByTaskName,
  onToggleChecklist, onToggleSubtask, onEditSubtask,
  onStartPhase, onSetPhaseStatus, onAddAdhocTask,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState<number | null>(null);
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocDraft, setAdhocDraft] = useState("");
  const [adhocSaving, setAdhocSaving] = useState(false);

  const railItems = useMemo(() => buildRailItems(view.phases), [view.phases]);
  const carouselItems = useMemo(
    () => buildCarouselItems(view.phases, view.transitions),
    [view.phases, view.transitions],
  );
  const curIdx = useMemo(() => currentPhaseIndex(view), [view]);
  const status = useMemo(
    () => trackerStatus(view, curIdx, rawStatusByTaskName),
    [view, curIdx, rawStatusByTaskName],
  );

  const currentPhase = view.phases[curIdx];
  const progress01 = currentPhase ? phaseProgress01(currentPhase) : 0;
  const geom = railGeometry(view.phases.length || 1, curIdx, progress01);

  const projectUrgency = useMemo(
    () => computeProjectUrgency(view, settings),
    [view, settings],
  );

  const totalChecklistItems = currentPhase
    ? currentPhase.werk.length + currentPhase.startVereiste.length + currentPhase.controle.length + currentPhase.subtasks.length
    : 0;
  const doneChecklistItems = currentPhase
    ? currentPhase.werk.filter((i) => i.done).length
      + currentPhase.startVereiste.filter((i) => i.done).length
      + currentPhase.controle.filter((i) => i.done).length
      + currentPhase.subtasks.filter((s) => s.done).length
    : 0;

  const onSchedule = projectUrgency.daysLeft !== null && projectUrgency.daysLeft >= 0;

  const detail = statusDetail(status, currentPhase, view);

  const toggleRow = () => {
    if (expanded) {
      setExpanded(false);
      setSelectedPhaseIndex(null);
    } else {
      setExpanded(true);
      setSelectedPhaseIndex(curIdx);
    }
  };

  const selectPhase = (phaseIndex: number) => {
    // Klik op de geselecteerde + huidige fase terwijl row open is → sluiten.
    if (expanded && selectedPhaseIndex === phaseIndex && phaseIndex === curIdx) {
      setExpanded(false);
      setSelectedPhaseIndex(null);
      return;
    }
    setExpanded(true);
    setSelectedPhaseIndex(phaseIndex);
  };

  const carouselActiveIndex =
    selectedPhaseIndex !== null
      ? carouselIndexForPhase(carouselItems, selectedPhaseIndex)
      : 0;

  const isPureRight = curIdx >= view.phases.length - 1 && progress01 >= 0.95;
  const activeRoundClass = isPureRight ? "round-both" : "round-right";

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

  return (
    <div className={`row-card${expanded ? " expanded" : ""}`} data-state={status}>
      <div className="row-head">
        <div className="meta" onClick={toggleRow}>
          <span className="chev">{expanded ? "▾" : "▸"}</span>
          <button
            type="button"
            className="num"
            onClick={(e) => {
              e.stopPropagation();
              openProject(view.project.name).catch((err) =>
                console.error("openProject failed:", err));
            }}
            title="Open project in Y-app"
            style={{
              background: "transparent", border: "none", padding: 0,
              cursor: "pointer", textDecoration: "none",
            }}
          >
            {view.project.name}
          </button>
          <button
            type="button"
            className="title"
            onClick={(e) => {
              e.stopPropagation();
              openProject(view.project.name).catch((err) =>
                console.error("openProject failed:", err));
            }}
            title={view.project.project_name}
            style={{
              background: "transparent", border: "none", padding: 0,
              cursor: "pointer", textAlign: "left", font: "inherit",
            }}
          >
            {view.project.project_name}
          </button>
          <span className="badge">{templateBadgeLabel(view.template)}</span>
          {view.project.customer && (
            <span className="client-inline">· {view.project.customer}</span>
          )}
        </div>

        <div className="tracker">
          <div className="bar">
            {geom.doneWidth > 0 && (
              <div className="bar-done" style={{ width: `${geom.doneWidth}%` }} />
            )}
            {geom.activeWidth > 0 && (
              <div
                className={`bar-active ${activeRoundClass}`}
                style={{ left: `${geom.activeLeft}%`, width: `${geom.activeWidth}%` }}
              />
            )}
          </div>
          <div className="phases">
            {railItems.map((item) => (
              <PhaseBubble
                key={item.phase.code}
                item={item}
                currentIndex={curIdx}
                selectedPhaseIndex={selectedPhaseIndex}
                status={status}
                onClick={() => selectPhase(item.phaseIndex)}
              />
            ))}
          </div>
          <div className="status-line">
            <span className={`status-pill ${status}`}>
              <StatusIcon status={status} />
              {STATUS_LABEL[status]}
            </span>
            <span className="status-detail">
              {detail.lead}{" "}
              {detail.who && <span className="who">{detail.who}</span>}
            </span>
            <span className="status-meta">
              {totalChecklistItems > 0 && (
                <span className="progress-count">
                  {doneChecklistItems}/{totalChecklistItems} taken
                </span>
              )}
              {projectUrgency.daysLeft !== null && (
                <span className={onSchedule ? "ontime" : "late"}>
                  {onSchedule ? "op schema" : `${Math.abs(projectUrgency.daysLeft)}d te laat`}
                </span>
              )}
              {currentPhase && (
                <span>
                  {currentPhase.code} · {formatDeadline(projectUrgency.daysLeft, projectUrgency.deadline)}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {expanded && carouselItems.length > 0 && (
        <div className="expanded-body">
          <PhaseCarousel
            items={carouselItems}
            activeIndex={carouselActiveIndex}
            onNavigate={(idx) => {
              const it = carouselItems[idx];
              if (!it) return;
              if (it.kind === "phase") {
                setSelectedPhaseIndex(it.phaseIndex);
              }
            }}
            erpnextUrl={erpnextUrl}
            settings={settings}
            rawStatusByTaskName={rawStatusByTaskName}
            onToggleChecklist={onToggleChecklist}
            onToggleSubtask={onToggleSubtask}
            onEditSubtask={onEditSubtask}
            onStartPhase={(phase) => onStartPhase?.(phase, view.project.name)}
            onSetPhaseStatus={onSetPhaseStatus}
          />
          <div style={{ padding: "10px 26px 18px", display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--ink-mute)" }}>
            <div style={{ flex: 1 }}>
              {view.adhocTasks.length > 0 ? (
                <>
                  <strong>{view.adhocTasks.length} ad-hoc taken</strong>{" "}
                  (buiten fase-structuur):{" "}
                  {view.adhocTasks.slice(0, 3).map((t) => t.subject.trim()).join(" · ")}
                  {view.adhocTasks.length > 3 ? " …" : ""}
                </>
              ) : (
                <span style={{ fontStyle: "italic" }}>Geen ad-hoc taken</span>
              )}
            </div>
            {onAddAdhocTask && !adhocOpen && (
              <button
                type="button"
                onClick={() => setAdhocOpen(true)}
                style={{
                  fontSize: 11, padding: "2px 10px",
                  border: "1px solid var(--select)",
                  background: "transparent", color: "var(--select)",
                  borderRadius: 4, cursor: "pointer",
                }}
              >
                + Ad-hoc taak
              </button>
            )}
          </div>
          {adhocOpen && onAddAdhocTask && (
            <div style={{ padding: "0 26px 14px", display: "flex", gap: 8, alignItems: "center" }}>
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
                style={{
                  flex: 1, fontSize: 12,
                  border: "1px solid var(--line)",
                  borderRadius: 4, padding: "4px 8px",
                }}
              />
              <button
                type="button"
                onClick={submitAdhoc}
                disabled={adhocSaving || !adhocDraft.trim()}
                style={{
                  fontSize: 11, padding: "4px 10px",
                  background: "var(--select)", color: "#fff",
                  border: "none", borderRadius: 4,
                  cursor: adhocSaving ? "default" : "pointer",
                  opacity: adhocSaving || !adhocDraft.trim() ? 0.4 : 1,
                }}
              >
                {adhocSaving ? "…" : "Toevoegen"}
              </button>
              <button
                type="button"
                onClick={() => { setAdhocOpen(false); setAdhocDraft(""); }}
                disabled={adhocSaving}
                style={{
                  fontSize: 11, color: "var(--ink-mute)",
                  background: "transparent", border: "none", cursor: "pointer",
                }}
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

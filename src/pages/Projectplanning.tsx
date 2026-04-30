/**
 * Hoofdpagina: haalt Projects + Tasks + Timesheets op via yappBridge,
 * bouwt ProjectViews via phaseDetection, classificeert via classification,
 * en rendert als filterbare lijst van FaseTracker-componenten.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAll, getErpNextAppUrl, createDocument } from "../lib/yappBridge";
import { buildProjectView } from "../lib/phaseDetection";
import { classifyProject } from "../lib/classification";
import { useSettings } from "../lib/settings";
import { useTaskMutations } from "../lib/taskMutations";
import { buildAssigneeMap, fetchUserNames } from "../lib/assignees";
import type {
  ProjectRecord,
  ProjectView,
  TaskRecord,
  TimesheetRecord,
} from "../types";
import FaseTracker from "../components/FaseTracker";
import SettingsPanel from "../components/SettingsPanel";
import { currentPhaseIndex } from "../lib/faseStatus";

type Bucket = "actueel" | "on-hold" | "archief" | "alles";

const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "actueel",  label: "Actueel" },
  { id: "on-hold",  label: "On-Hold" },
  { id: "archief",  label: "Archief" },
  { id: "alles",    label: "Alles" },
];

/** ERPNext Task-statussen die op een fase-task kunnen voorkomen. */
const TASK_STATUSES = [
  "Open",
  "Working",
  "Pending Review",
  "Completed",
  "Cancelled",
  "Overdue",
  "Template",
] as const;
type TaskStatusFilter = (typeof TASK_STATUSES)[number] | "alles";

interface TaskRecordWithAssign extends TaskRecord {
  _assign: string | null;
}

export default function Projectplanning() {
  const { settings, updateSettings, ready: settingsReady } = useSettings();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [assigneesByTask, setAssigneesByTask] = useState<Map<string, string[]>>(new Map());
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [timesheets, setTimesheets] = useState<TimesheetRecord[]>([]);
  const [erpnextUrl, setErpnextUrl] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>("actueel");
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>("alles");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const mutations = useTaskMutations(() => setReloadToken((t) => t + 1));

  const loadData = useCallback(async (
    signal: { cancelled: boolean },
    opts: { silent?: boolean } = {},
  ) => {
    try {
      if (!opts.silent) setLoading(true);
      setError(null);

      const projectFilters: unknown[][] = [];
      if (settings.company) projectFilters.push(["company", "=", settings.company]);
      if (settings.projectStatuses.length > 0) {
        projectFilters.push(["status", "in", settings.projectStatuses]);
      }

      const [projectsData, tasksData, timesheetsData, url] = await Promise.all([
        fetchAll<ProjectRecord>(
          "Project",
          [
            "name", "project_name", "status", "customer",
            "expected_start_date", "expected_end_date",
            "percent_complete", "custom_project_manager", "company",
          ],
          projectFilters,
          "modified desc",
        ),
        fetchAll<TaskRecordWithAssign>(
          "Task",
          [
            "name", "subject", "project", "parent_task", "is_group",
            "status", "priority", "exp_start_date", "exp_end_date",
            "progress", "description", "modified", "_assign",
          ],
          [["project", "!=", ""]],
          "modified desc",
        ),
        fetchAll<TimesheetRecord>(
          "Timesheet",
          ["name", "employee", "start_date", "end_date", "total_hours", "parent_project"],
          [["parent_project", "!=", ""]],
          "modified desc",
        ),
        getErpNextAppUrl().catch(() => null),
      ]);
      if (signal.cancelled) return;

      setProjects(projectsData);
      // Strip _assign from TaskRecord — keep it separate.
      setTasks(tasksData.map(({ _assign: _omit, ...rest }) => rest as TaskRecord));
      const assignMap = buildAssigneeMap(tasksData);
      setAssigneesByTask(assignMap);
      setTimesheets(timesheetsData);
      setErpnextUrl(url);

      // Resolve user names for displayed assignees.
      const allEmails = new Set<string>();
      for (const list of assignMap.values()) for (const e of list) allEmails.add(e);
      if (allEmails.size > 0) {
        fetchUserNames(Array.from(allEmails))
          .then((m) => { if (!signal.cancelled) setUserNames(m); })
          .catch(() => { /* silent */ });
      }
    } catch (e) {
      if (!signal.cancelled) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!signal.cancelled && !opts.silent) setLoading(false);
    }
  }, [settings.company, settings.projectStatuses]);

  useEffect(() => {
    if (!settingsReady) return;
    const signal = { cancelled: false };
    // Eerste load toont de "Laden…" spinner; reloads (getriggerd door een
    // mutation) gebeuren stil — de optimistic overlay bewaart de UI-state
    // en we willen de carousel/expanded-state niet kwijt.
    loadData(signal, { silent: reloadToken > 0 });
    return () => { signal.cancelled = true; };
  }, [settingsReady, loadData, reloadToken]);

  const views: ProjectView[] = useMemo(() => {
    const tasksByProject = new Map<string, TaskRecord[]>();
    for (const t of tasks) {
      const arr = tasksByProject.get(t.project) ?? [];
      arr.push(t);
      tasksByProject.set(t.project, arr);
    }
    return projects.map((p) => {
      const pTasks = tasksByProject.get(p.name) ?? [];
      const base = buildProjectView(p, pTasks, {
        transitionSource: settings.transitionSource,
        overlay: mutations.overlay,
      });
      return classifyProject(base, pTasks, timesheets);
    });
  }, [projects, tasks, timesheets, settings.transitionSource, mutations.overlay]);

  const counts = useMemo(() => {
    const c = { actueel: 0, "on-hold": 0, archief: 0 };
    for (const v of views) c[v.classification.bucket]++;
    return c;
  }, [views]);

  /** Snelle lookup van raw Task.status (respecteert optimistic overlay). */
  const rawStatusByTaskName = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) {
      const override = mutations.overlay.get(t.name)?.status;
      m.set(t.name, override ?? t.status);
    }
    return m;
  }, [tasks, mutations.overlay]);

  /** Status van de huidige fase-task per view (raw ERPNext Task.status). */
  const currentTaskStatusByView = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of views) {
      const idx = currentPhaseIndex(v);
      const phase = v.phases[idx];
      const status = phase ? rawStatusByTaskName.get(phase.taskName) : undefined;
      m.set(v.project.name, status ?? "");
    }
    return m;
  }, [views, rawStatusByTaskName]);

  const taskStatusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const status of TASK_STATUSES) c[status] = 0;
    for (const v of views) {
      const s = currentTaskStatusByView.get(v.project.name);
      if (s && c[s] !== undefined) c[s]++;
    }
    return c;
  }, [views, currentTaskStatusByView]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views
      .filter((v) => bucket === "alles" ? true : v.classification.bucket === bucket)
      .filter((v) => {
        if (taskStatusFilter === "alles") return true;
        return currentTaskStatusByView.get(v.project.name) === taskStatusFilter;
      })
      .filter((v) => {
        if (!q) return true;
        return (
          v.project.name.toLowerCase().includes(q) ||
          v.project.project_name.toLowerCase().includes(q) ||
          (v.project.customer ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        b.project.name.localeCompare(a.project.name, undefined, { numeric: true, sensitivity: "base" })
      );
  }, [views, bucket, taskStatusFilter, currentTaskStatusByView, search]);

  return (
    <div className="min-h-full bg-[#f0f0f0] relative">
      <header className="bg-purple-3bm px-8 pt-5 pb-4 text-white flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Projectplanning Dashboard</h1>
          <div className="text-teal-3bm text-sm mt-0.5">3BM Engineering</div>
          <div className="text-white/50 text-xs mt-2">
            Fase-timeline met overgangen · compact overzicht + carousel-detail
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            console.log("[projectplanning] settings button clicked");
            setSettingsOpen(true);
          }}
          className="relative z-10 shrink-0 flex items-center justify-center w-9 h-9 rounded border border-white/30 bg-white/10 text-white hover:bg-white/20 hover:border-white/50 cursor-pointer"
          title="Instellingen"
          aria-label="Instellingen"
        >
          <span className="text-lg leading-none">⚙</span>
        </button>
      </header>
      <div className="h-[3px] bg-teal-3bm" />

      <div className="flex gap-6 px-8 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-[28px] font-bold text-teal-3bm leading-none">{counts.actueel}</span>
          <span className="text-[13px] text-gray-500">Actueel</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[28px] font-bold text-amber-3bm leading-none">{counts["on-hold"]}</span>
          <span className="text-[13px] text-gray-500">On-Hold</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[28px] font-bold text-gray-400 leading-none">{counts.archief}</span>
          <span className="text-[13px] text-gray-500">Archief</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-8 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="flex gap-1">
            {BUCKETS.map((b) => {
              const active = bucket === b.id;
              const count = b.id === "alles" ? views.length : counts[b.id];
              return (
                <button
                  type="button"
                  key={b.id}
                  onClick={() => setBucket(b.id)}
                  className={`px-4 py-1.5 rounded-full text-[13px] border transition ${
                    active
                      ? "bg-purple-3bm text-white border-purple-3bm"
                      : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {b.label}
                  <span
                    className={`ml-1.5 inline-block rounded-full px-1.5 text-[11px] ${
                      active ? "bg-white/30" : "bg-gray-200"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <input
            type="text"
            placeholder="Zoek project of klant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto border border-gray-300 rounded px-3 py-1.5 text-[13px] w-[240px] focus:outline-none focus:border-teal-3bm"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-gray-400 uppercase tracking-wide mr-1">Taakstatus:</span>
          <button
            type="button"
            onClick={() => setTaskStatusFilter("alles")}
            className={`px-2.5 py-0.5 rounded-full text-[11px] border transition ${
              taskStatusFilter === "alles"
                ? "bg-gray-700 text-white border-gray-700"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            Alle
            <span className={`ml-1 inline-block rounded-full px-1 text-[10px] ${
              taskStatusFilter === "alles" ? "bg-white/30" : "bg-gray-200"
            }`}>
              {views.length}
            </span>
          </button>
          {TASK_STATUSES.map((s) => {
            const active = taskStatusFilter === s;
            const count = taskStatusCounts[s] ?? 0;
            return (
              <button
                type="button"
                key={s}
                onClick={() => setTaskStatusFilter(s)}
                disabled={count === 0 && !active}
                className={`px-2.5 py-0.5 rounded-full text-[11px] border transition ${
                  active
                    ? "bg-gray-700 text-white border-gray-700"
                    : count === 0
                      ? "bg-white text-gray-300 border-gray-200 cursor-not-allowed"
                      : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
              >
                {s}
                <span className={`ml-1 inline-block rounded-full px-1 text-[10px] ${
                  active ? "bg-white/30" : "bg-gray-200"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <main className="px-8 py-4">
        {loading && <div className="text-sm text-gray-500">Laden…</div>}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
            Fout bij laden: {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-sm text-gray-500 italic">Geen projecten in deze categorie.</div>
        )}
        {!loading && !error && filtered.map((view) => (
          <FaseTracker
            key={view.project.name}
            view={view}
            erpnextUrl={erpnextUrl}
            settings={settings}
            assigneesByTask={assigneesByTask}
            userNames={userNames}
            onToggleChecklist={(item, next) => {
              const taskName = item.source.taskName;
              const task = tasks.find((t) => t.name === taskName);
              if (task) mutations.toggleChecklistItem(task, item, next);
            }}
            onEditChecklistText={(item, newText) => {
              const taskName = item.source.taskName;
              const task = tasks.find((t) => t.name === taskName);
              if (task) mutations.updateChecklistItemText(task, item, newText);
            }}
            onToggleSubtask={(subtask, next) => {
              const task = tasks.find((t) => t.name === subtask.taskName);
              if (task) mutations.toggleDone(task, next);
            }}
            onEditSubtask={(subtask, newSubject) => {
              const task = tasks.find((t) => t.name === subtask.taskName);
              if (task) mutations.updateSubject(task, newSubject);
            }}
            rawStatusByTaskName={rawStatusByTaskName}
            onStartPhase={(phase, projectName) => {
              const target = tasks.find((t) => t.name === phase.taskName);
              if (!target) return;
              const otherWorking = tasks.filter(
                (t) =>
                  t.project === projectName &&
                  t.name !== phase.taskName &&
                  !t.parent_task &&
                  (rawStatusByTaskName.get(t.name) ?? t.status).toLowerCase() === "working",
              );
              if (otherWorking.length > 0) {
                const names = otherWorking.map((o) => o.subject.trim()).join(", ");
                const ok = window.confirm(
                  `Er staat nog een fase op 'Working':\n  ${names}\n\nDeze naar 'Completed' zetten en ${phase.code} starten?`,
                );
                if (!ok) return;
              }
              mutations.startPhase(target, otherWorking);
            }}
            onSetPhaseStatus={(phase, status) => {
              const target = tasks.find((t) => t.name === phase.taskName);
              if (target) mutations.setStatus(target, status);
            }}
            onSetPhaseDates={(phase, expStart, expEnd) => {
              const target = tasks.find((t) => t.name === phase.taskName);
              if (target) mutations.setDates(target, expStart, expEnd);
            }}
            onAddAdhocTask={async (projectName, subject) => {
              await createDocument("Task", {
                subject,
                project: projectName,
                status: "Open",
              });
              setReloadToken((t) => t + 1);
            }}
          />
        ))}
      </main>

      <footer className="px-8 py-4 bg-gray-3bm border-t border-gray-200 flex justify-between items-center mt-5">
        <button
          type="button"
          onClick={() =>
            window.open(
              "https://github.com/piyton/Y_App-extension-projectplanning/issues/new",
              "_blank",
            )
          }
          className="px-3.5 py-1.5 border border-purple-3bm rounded text-purple-3bm text-xs bg-white hover:bg-purple-3bm hover:text-white"
        >
          Feedback
        </button>
        <span className="text-[11px] text-gray-400">
          yapp-ext-projectplanning · pilot · 3BM huisstijl
        </span>
      </footer>

      {mutations.error && (
        <div className="fixed bottom-5 right-5 max-w-[480px] bg-red-600 text-white px-4 py-3 rounded shadow-lg text-[12px] flex items-start gap-3">
          <div className="flex-1 leading-snug">
            <div className="font-semibold mb-0.5">Opslaan mislukt</div>
            <div className="text-white/90 break-words">{mutations.error}</div>
          </div>
          <button
            type="button"
            onClick={mutations.clearError}
            className="text-white/80 hover:text-white text-base leading-none"
            aria-label="Sluit"
          >
            ×
          </button>
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={(next) => updateSettings(next)}
      />
    </div>
  );
}

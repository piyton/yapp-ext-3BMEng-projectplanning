/**
 * Task mutations met optimistic UI-updates.
 *
 * `applyOverlay()` geeft per task een gewijzigde snapshot terug voor de
 * lokale UI, zodat een toggle direct zichtbaar is terwijl de ERPNext-call
 * nog onderweg is. Bij een fout wordt de overlay teruggedraaid en de
 * originele status hersteld.
 */

import { useCallback, useRef, useState } from "react";
import { updateDocument } from "./yappBridge";
import { toggleChecklistItemInHtml, checkAllInHtml, setChecklistItemTextInHtml } from "./descriptionToggle";
import { humanizeFrappeError } from "./errorFormat";
import type { ChecklistItem, TaskRecord } from "../types";

export type TaskOverlay = Map<string, Partial<TaskRecord>>;

export function applyOverlay(task: TaskRecord, overlay: TaskOverlay): TaskRecord {
  const patch = overlay.get(task.name);
  if (!patch) return task;
  return { ...task, ...patch };
}

export function applyOverlayAll(tasks: TaskRecord[], overlay: TaskOverlay): TaskRecord[] {
  if (overlay.size === 0) return tasks;
  return tasks.map((t) => applyOverlay(t, overlay));
}

export interface TaskMutations {
  overlay: TaskOverlay;
  toggleDone: (task: TaskRecord, nextDone: boolean) => Promise<void>;
  toggleChecklistItem: (task: TaskRecord, item: ChecklistItem, nextDone: boolean) => Promise<void>;
  updateChecklistItemText: (task: TaskRecord, item: ChecklistItem, newText: string) => Promise<void>;
  updateSubject: (task: TaskRecord, newSubject: string) => Promise<void>;
  setStatus: (task: TaskRecord, status: string) => Promise<void>;
  startPhase: (task: TaskRecord, otherWorking: TaskRecord[]) => Promise<void>;
  setDates: (task: TaskRecord, expStart: string | null, expEnd: string | null) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

export function useTaskMutations(onServerChange?: () => void): TaskMutations {
  const [overlay, setOverlay] = useState<TaskOverlay>(new Map());
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  const apply = useCallback((name: string, patch: Partial<TaskRecord>) => {
    setOverlay((prev) => {
      const next = new Map(prev);
      const existing = next.get(name) ?? {};
      next.set(name, { ...existing, ...patch });
      return next;
    });
  }, []);

  const clear = useCallback((name: string) => {
    setOverlay((prev) => {
      if (!prev.has(name)) return prev;
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
  }, []);

  const toggleDone = useCallback(async (task: TaskRecord, nextDone: boolean) => {
    if (inFlight.current.has(task.name)) return;
    inFlight.current.add(task.name);
    const nextWorkflow = nextDone ? "Completed" : "Open";
    const nextStatus = nextDone ? "Completed" : "Open";
    const patch: Partial<TaskRecord> = {
      workflow_state: nextWorkflow,
      status: nextStatus,
    };
    if (nextDone) {
      // Pak de meest recente description uit de overlay (eerdere item-
      // toggles kunnen nog niet zijn teruggekomen via fetch).
      const currentDesc = overlay.get(task.name)?.description ?? task.description;
      if (currentDesc) patch.description = checkAllInHtml(currentDesc);
    }
    apply(task.name, patch);
    try {
      await updateDocument("Task", task.name, {
        workflow_state: nextWorkflow,
        ...(patch.description !== undefined ? { description: patch.description } : {}),
      });
      onServerChange?.();
    } catch (e) {
      clear(task.name);
      setError(humanizeFrappeError(e instanceof Error ? e.message : e));
    } finally {
      inFlight.current.delete(task.name);
    }
  }, [apply, clear, onServerChange, overlay]);

  /**
   * Flip één checklist-item (sub-todo) in de description van een task,
   * zonder de Task-status te wijzigen.
   */
  const toggleChecklistItem = useCallback(async (
    task: TaskRecord,
    item: ChecklistItem,
    nextDone: boolean,
  ) => {
    const key = `${task.name}::${item.id}`;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      const currentDesc = overlay.get(task.name)?.description ?? task.description ?? "";
      const nextDesc = toggleChecklistItemInHtml(
        currentDesc,
        item.source.section,
        item.source.itemIndex,
        nextDone,
      );
      apply(task.name, { description: nextDesc });
      await updateDocument("Task", task.name, { description: nextDesc });
      onServerChange?.();
    } catch (e) {
      clear(task.name);
      setError(humanizeFrappeError(e instanceof Error ? e.message : e));
    } finally {
      inFlight.current.delete(key);
    }
  }, [apply, clear, onServerChange, overlay]);

  /**
   * Vervang de tekst van één checklist-item (sub-todo) in een task-description.
   * Status van de Task blijft ongewijzigd.
   */
  const updateChecklistItemText = useCallback(async (
    task: TaskRecord,
    item: ChecklistItem,
    newText: string,
  ) => {
    const trimmed = newText.trim();
    if (!trimmed || trimmed === item.label) return;
    const key = `${task.name}::${item.id}::text`;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      const currentDesc = overlay.get(task.name)?.description ?? task.description ?? "";
      const nextDesc = setChecklistItemTextInHtml(
        currentDesc,
        item.source.section,
        item.source.itemIndex,
        trimmed,
      );
      apply(task.name, { description: nextDesc });
      await updateDocument("Task", task.name, { description: nextDesc });
      onServerChange?.();
    } catch (e) {
      clear(task.name);
      setError(humanizeFrappeError(e instanceof Error ? e.message : e));
    } finally {
      inFlight.current.delete(key);
    }
  }, [apply, clear, onServerChange, overlay]);

  const updateSubject = useCallback(async (task: TaskRecord, newSubject: string) => {
    const trimmed = newSubject.trim();
    if (!trimmed || trimmed === task.subject) return;
    if (inFlight.current.has(task.name)) return;
    inFlight.current.add(task.name);
    apply(task.name, { subject: trimmed });
    try {
      await updateDocument("Task", task.name, { subject: trimmed });
      onServerChange?.();
    } catch (e) {
      clear(task.name);
      setError(humanizeFrappeError(e instanceof Error ? e.message : e));
    } finally {
      inFlight.current.delete(task.name);
    }
  }, [apply, clear, onServerChange]);

  /**
   * Zet de workflow_state van een Task. Het `status`-veld zelf is read-only
   * en wordt door ERPNext afgeleid uit workflow_state. We schrijven dus naar
   * `workflow_state`, en spiegelen lokaal het derived `status` in de overlay
   * voor optimistic UI.
   */
  const setStatus = useCallback(async (task: TaskRecord, workflowState: string) => {
    if (task.workflow_state === workflowState) return;
    if (inFlight.current.has(task.name)) return;
    inFlight.current.add(task.name);
    // Map workflow_state → derived status (alleen Completed/Cancelled wijken
    // af; alle andere states mappen naar "Open").
    const derivedStatus =
      workflowState === "Completed" ? "Completed"
        : workflowState === "Cancelled" ? "Cancelled"
        : "Open";
    const patch: Partial<TaskRecord> = {
      workflow_state: workflowState,
      status: derivedStatus,
    };
    if (workflowState === "Completed") {
      const currentDesc = overlay.get(task.name)?.description ?? task.description;
      if (currentDesc) patch.description = checkAllInHtml(currentDesc);
    }
    apply(task.name, patch);
    try {
      await updateDocument("Task", task.name, {
        workflow_state: workflowState,
        ...(patch.description !== undefined ? { description: patch.description } : {}),
      });
      onServerChange?.();
    } catch (e) {
      clear(task.name);
      setError(humanizeFrappeError(e instanceof Error ? e.message : e));
    } finally {
      inFlight.current.delete(task.name);
    }
  }, [apply, clear, onServerChange, overlay]);

  /** Zet één fase op Working, verschuift alle andere Working-fases in hetzelfde project naar Completed. */
  const startPhase = useCallback(async (task: TaskRecord, otherWorking: TaskRecord[]) => {
    apply(task.name, { workflow_state: "Working", status: "Open" });
    for (const other of otherWorking) {
      apply(other.name, { workflow_state: "Completed", status: "Completed" });
    }
    try {
      await Promise.all([
        updateDocument("Task", task.name, { workflow_state: "Working" }),
        ...otherWorking.map((o) => updateDocument("Task", o.name, { workflow_state: "Completed" })),
      ]);
      onServerChange?.();
    } catch (e) {
      clear(task.name);
      for (const other of otherWorking) clear(other.name);
      setError(humanizeFrappeError(e instanceof Error ? e.message : e));
    }
  }, [apply, clear, onServerChange]);

  /**
   * Update verwacht-start en/of verwacht-eind van een Task. `null` betekent
   * leeg laten (ERPNext accepteert lege string voor het wissen).
   */
  const setDates = useCallback(async (
    task: TaskRecord,
    expStart: string | null,
    expEnd: string | null,
  ) => {
    if (expStart === task.exp_start_date && expEnd === task.exp_end_date) return;
    const key = `${task.name}::dates`;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    const patch: Partial<TaskRecord> = {
      exp_start_date: expStart,
      exp_end_date: expEnd,
    };
    apply(task.name, patch);
    try {
      await updateDocument("Task", task.name, {
        exp_start_date: expStart ?? "",
        exp_end_date: expEnd ?? "",
      });
      onServerChange?.();
    } catch (e) {
      clear(task.name);
      setError(humanizeFrappeError(e instanceof Error ? e.message : e));
    } finally {
      inFlight.current.delete(key);
    }
  }, [apply, clear, onServerChange]);

  const clearError = useCallback(() => setError(null), []);

  return {
    overlay,
    toggleDone,
    toggleChecklistItem,
    updateChecklistItemText,
    updateSubject,
    setStatus,
    startPhase,
    setDates,
    error,
    clearError,
  };
}

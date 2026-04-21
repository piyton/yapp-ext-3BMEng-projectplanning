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
import type { TaskRecord } from "../types";

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
  updateSubject: (task: TaskRecord, newSubject: string) => Promise<void>;
  setStatus: (task: TaskRecord, status: string) => Promise<void>;
  startPhase: (task: TaskRecord, otherWorking: TaskRecord[]) => Promise<void>;
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
    const nextStatus = nextDone ? "Completed" : "Open";
    apply(task.name, { status: nextStatus });
    try {
      await updateDocument("Task", task.name, { status: nextStatus });
      onServerChange?.();
      // Laat overlay nog even staan; de volgende fetch brengt de echte status
      // binnen en we kunnen dan opschonen. Simpele aanpak: overlay clear zodra
      // de volgende fetch is verwerkt — wordt gedaan door aanroeper via
      // `clearOverlay()` (geen auto-clear hier).
    } catch (e) {
      clear(task.name);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current.delete(task.name);
    }
  }, [apply, clear, onServerChange]);

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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current.delete(task.name);
    }
  }, [apply, clear, onServerChange]);

  const setStatus = useCallback(async (task: TaskRecord, status: string) => {
    if (task.status === status) return;
    if (inFlight.current.has(task.name)) return;
    inFlight.current.add(task.name);
    apply(task.name, { status });
    try {
      await updateDocument("Task", task.name, { status });
      onServerChange?.();
    } catch (e) {
      clear(task.name);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current.delete(task.name);
    }
  }, [apply, clear, onServerChange]);

  /** Zet één fase op Working, verschuift alle andere Working-fases in hetzelfde project naar Completed. */
  const startPhase = useCallback(async (task: TaskRecord, otherWorking: TaskRecord[]) => {
    apply(task.name, { status: "Working" });
    for (const other of otherWorking) apply(other.name, { status: "Completed" });
    try {
      await Promise.all([
        updateDocument("Task", task.name, { status: "Working" }),
        ...otherWorking.map((o) => updateDocument("Task", o.name, { status: "Completed" })),
      ]);
      onServerChange?.();
    } catch (e) {
      clear(task.name);
      for (const other of otherWorking) clear(other.name);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [apply, clear, onServerChange]);

  const clearError = useCallback(() => setError(null), []);

  return { overlay, toggleDone, updateSubject, setStatus, startPhase, error, clearError };
}

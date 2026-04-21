/**
 * Extension-instellingen (per Y-app instance).
 *
 * Opslag: localStorage onder `projectplanning_settings_${instanceId}`.
 * Eerste keer leeg — gebruiker kiest zelf company + statussen. Geen hardcoded
 * defaults voor company/status (bewuste keuze: extensie is herbruikbaar voor
 * andere bedrijven dan 3BM).
 */

import { useEffect, useState, useCallback } from "react";
import { getActiveInstanceId } from "./yappBridge";

export type TransitionSource = "merged" | "dedicated";

export interface ProjectplanningSettings {
  /** ERPNext Company naam — `null` = alle companies. */
  company: string | null;
  /** ERPNext Project statussen die zichtbaar zijn. Leeg = alle. */
  projectStatuses: string[];
  /** Drempels in dagen voor urgentie-kleuring. */
  urgencyThresholds: { red: number; amber: number };
  /** Bron van overgang-vinkjes: eigen overgangs-task (dedicated) of merge met fase-tasks. */
  transitionSource: TransitionSource;
  /** Toon deadline-chip + urgente taken in projectlijst. */
  showUrgencyChip: boolean;
}

export const DEFAULT_SETTINGS: ProjectplanningSettings = {
  company: null,
  projectStatuses: [],
  urgencyThresholds: { red: 7, amber: 14 },
  transitionSource: "dedicated",
  showUrgencyChip: true,
};

const KEY_PREFIX = "projectplanning_settings_";

function storageKey(instanceId: string): string {
  return `${KEY_PREFIX}${instanceId}`;
}

function readRaw(instanceId: string): ProjectplanningSettings {
  try {
    const raw = localStorage.getItem(storageKey(instanceId));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ProjectplanningSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed,
      urgencyThresholds: { ...DEFAULT_SETTINGS.urgencyThresholds, ...(parsed.urgencyThresholds ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeRaw(instanceId: string, value: ProjectplanningSettings): void {
  try {
    localStorage.setItem(storageKey(instanceId), JSON.stringify(value));
  } catch {
    // quota / security error — settings become ephemeral for this session
  }
}

/**
 * Hook voor settings-lezen + schrijven. Re-rendert automatisch na update.
 * Zolang instance-id nog niet opgehaald is, retourneert DEFAULT_SETTINGS.
 */
export function useSettings(): {
  settings: ProjectplanningSettings;
  updateSettings: (next: ProjectplanningSettings) => void;
  instanceId: string | null;
  ready: boolean;
} {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProjectplanningSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getActiveInstanceId()
      .then((id) => {
        if (cancelled) return;
        setInstanceId(id);
        setSettings(readRaw(id));
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  const updateSettings = useCallback((next: ProjectplanningSettings) => {
    setSettings(next);
    if (instanceId) writeRaw(instanceId, next);
  }, [instanceId]);

  return { settings, updateSettings, instanceId, ready };
}

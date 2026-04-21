/**
 * Slide-in settings panel. Sluit via Escape, de sluit-knop, of de overlay.
 * Inline styles waar kritisch (positie, kleuren) zodat layout robuust is
 * tegen Tailwind-JIT edge cases en cascading stijlen in de iframe.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { fetchList } from "../lib/yappBridge";
import type { ProjectplanningSettings, TransitionSource } from "../lib/settings";

interface CompanyRecord { name: string }

interface Props {
  open: boolean;
  onClose: () => void;
  settings: ProjectplanningSettings;
  onSave: (next: ProjectplanningSettings) => void;
}

const STATUS_OPTIONS = ["Open", "Completed", "Cancelled"];

const PURPLE = "#350E35";
const TEAL = "#45B6A8";

const styles = {
  root: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    display: "flex",
    justifyContent: "flex-end",
  } as CSSProperties,
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
  } as CSSProperties,
  panel: {
    position: "relative",
    width: 380,
    maxWidth: "100%",
    height: "100%",
    background: "#ffffff",
    boxShadow: "-8px 0 20px rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  } as CSSProperties,
  header: {
    background: PURPLE,
    color: "#ffffff",
    padding: "16px 20px",
  } as CSSProperties,
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } as CSSProperties,
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.8)",
    fontSize: 22,
    lineHeight: 1,
    cursor: "pointer",
    padding: 4,
  } as CSSProperties,
  subtitle: { color: TEAL, fontSize: 12, marginTop: 2 } as CSSProperties,
  accent: { height: 3, background: TEAL } as CSSProperties,
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 20px",
  } as CSSProperties,
  section: { marginBottom: 20 } as CSSProperties,
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: PURPLE,
    marginBottom: 6,
  } as CSSProperties,
  help: { fontSize: 10, color: "#6b7280", marginTop: 4 } as CSSProperties,
  select: {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: 4,
    padding: "6px 8px",
    fontSize: 13,
  } as CSSProperties,
  input: {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 13,
  } as CSSProperties,
  row: { display: "flex", gap: 12 } as CSSProperties,
  col: { flex: 1 } as CSSProperties,
  checkLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
    marginBottom: 4,
    cursor: "pointer",
  } as CSSProperties,
  headerActions: { display: "flex", gap: 6, alignItems: "center" } as CSSProperties,
  btnCancel: {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.3)",
    padding: "4px 10px",
    fontSize: 12,
    color: "#ffffff",
    borderRadius: 4,
    cursor: "pointer",
  } as CSSProperties,
  btnSave: {
    background: TEAL,
    color: "#ffffff",
    border: "none",
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 4,
    cursor: "pointer",
  } as CSSProperties,
};

export default function SettingsPanel({ open, onClose, settings, onSave }: Props) {
  const [draft, setDraft] = useState<ProjectplanningSettings>(settings);
  const [companies, setCompanies] = useState<string[]>([]);

  useEffect(() => { setDraft(settings); }, [settings, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchList<CompanyRecord>("Company", { fields: ["name"], limit_page_length: 100 })
      .then((list) => { if (!cancelled) setCompanies(list.map((c) => c.name)); })
      .catch(() => { /* leave empty */ });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggleStatus = (s: string) => {
    setDraft((d) => {
      const has = d.projectStatuses.includes(s);
      return {
        ...d,
        projectStatuses: has ? d.projectStatuses.filter((x) => x !== s) : [...d.projectStatuses, s],
      };
    });
  };

  const handleSave = () => { onSave(draft); onClose(); };

  return (
    <div style={styles.root} role="dialog" aria-modal="true">
      <div style={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div style={styles.panel}>
        <div style={styles.header}>
          <div style={styles.headerRow}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Instellingen</h2>
            <div style={styles.headerActions}>
              <button type="button" onClick={onClose} style={styles.btnCancel}>Annuleren</button>
              <button type="button" onClick={handleSave} style={styles.btnSave}>Opslaan</button>
              <button type="button" onClick={onClose} style={styles.closeBtn} aria-label="Sluit">×</button>
            </div>
          </div>
          <div style={styles.subtitle}>Projectplanning extensie</div>
        </div>
        <div style={styles.accent} />

        <div style={styles.body}>
          {/* Company */}
          <section style={styles.section}>
            <label style={styles.label}>Company</label>
            <select
              value={draft.company ?? ""}
              onChange={(e) => setDraft({ ...draft, company: e.target.value || null })}
              style={styles.select}
            >
              <option value="">Alle companies</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={styles.help}>Filter projecten op ERPNext Company.</div>
          </section>

          {/* Project statuses */}
          <section style={styles.section}>
            <label style={styles.label}>Project statussen</label>
            {STATUS_OPTIONS.map((s) => (
              <label key={s} style={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={draft.projectStatuses.includes(s)}
                  onChange={() => toggleStatus(s)}
                />
                <span>{s}</span>
              </label>
            ))}
            <div style={styles.help}>Leeg = alle statussen.</div>
          </section>

          {/* Urgency thresholds */}
          <section style={styles.section}>
            <label style={styles.label}>Urgentie-drempels (dagen)</label>
            <div style={styles.row}>
              <div style={styles.col}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>Rood &lt;</div>
                <input
                  type="number"
                  min={0}
                  value={draft.urgencyThresholds.red}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      urgencyThresholds: {
                        ...draft.urgencyThresholds,
                        red: Number(e.target.value) || 0,
                      },
                    })
                  }
                  style={styles.input}
                />
              </div>
              <div style={styles.col}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>Oranje &lt;</div>
                <input
                  type="number"
                  min={0}
                  value={draft.urgencyThresholds.amber}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      urgencyThresholds: {
                        ...draft.urgencyThresholds,
                        amber: Number(e.target.value) || 0,
                      },
                    })
                  }
                  style={styles.input}
                />
              </div>
            </div>
          </section>

          {/* Transition source */}
          <section style={styles.section}>
            <label style={styles.label}>Overgang-vinkjes</label>
            {(["dedicated", "merged"] as TransitionSource[]).map((mode) => (
              <label key={mode} style={{ ...styles.checkLabel, alignItems: "flex-start" }}>
                <input
                  type="radio"
                  name="transitionSource"
                  checked={draft.transitionSource === mode}
                  onChange={() => setDraft({ ...draft, transitionSource: mode })}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {mode === "dedicated" ? "Eigen overgangs-task" : "Samengevoegd"}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>
                    {mode === "dedicated"
                      ? "Alleen items en subtasks uit de overgangs-task zelf."
                      : "Controle vorige fase + startvereiste volgende fase worden mee-getoond."}
                  </div>
                </div>
              </label>
            ))}
          </section>

          {/* Show urgency chip */}
          <section style={styles.section}>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={draft.showUrgencyChip}
                onChange={(e) => setDraft({ ...draft, showUrgencyChip: e.target.checked })}
              />
              <div>
                <div style={{ fontWeight: 500 }}>Deadline-chip in projectlijst</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>
                  Toon dichtstbijzijnde deadline + urgente taken onder elke projectrij.
                </div>
              </div>
            </label>
          </section>
        </div>

      </div>
    </div>
  );
}

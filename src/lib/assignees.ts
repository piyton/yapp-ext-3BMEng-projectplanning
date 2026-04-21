/**
 * Assignee-parsing voor Task-records.
 *
 * ERPNext bewaart assignees als JSON-string in `_assign`, bv `'["user@x.nl"]'`.
 * Parse + cache per user → full_name via een fetchList-aanroep bij load.
 */

import { fetchList } from "./yappBridge";

export interface TaskWithAssign {
  name: string;
  _assign?: string | null;
}

export function parseAssign(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

/** Maak een map taskName → emails op basis van een Task-list. */
export function buildAssigneeMap(tasks: TaskWithAssign[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const t of tasks) {
    const emails = parseAssign(t._assign ?? null);
    if (emails.length > 0) m.set(t.name, emails);
  }
  return m;
}

/**
 * Haal full names op voor een set emails. Result: email → full_name.
 * Onbekende emails krijgen geen entry — UI kan dan de email zelf tonen.
 */
export async function fetchUserNames(emails: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (emails.length === 0) return out;
  const unique = Array.from(new Set(emails));
  try {
    const users = await fetchList<{ name: string; full_name: string }>("User", {
      fields: ["name", "full_name"],
      filters: [["name", "in", unique]],
      limit_page_length: unique.length,
    });
    for (const u of users) {
      if (u.full_name) out.set(u.name, u.full_name);
    }
  } catch {
    // Silent — UI valt terug op email.
  }
  return out;
}

/** Formatter: pak voornaam uit full_name, of eerste stukje voor '@' bij email. */
export function shortName(email: string, fullName?: string): string {
  if (fullName) {
    const first = fullName.split(/\s+/)[0];
    if (first) return first;
  }
  const local = email.split("@")[0];
  return local || email;
}

/**
 * Frappe/ERPNext-fouten leesbaar maken.
 *
 * Frappe stuurt vaak een complete Python-traceback als JSON-array van strings
 * mee via `_server_messages` of als `error.message`. We willen alleen de
 * laatste regel (de echte ValidationError) in mensentaal tonen.
 */

const FRAPPE_EXCEPTION_RE =
  /frappe\.exceptions\.[A-Za-z]+Error:\s*([\s\S]*?)(?:\n\s*$|\n\s+File\s|$)/m;

/**
 * Pak de meest informatieve regel uit een Frappe-fout. Werkt op:
 *   - JSON-array string `["Traceback ..."]`
 *   - kale traceback string
 *   - korte ValidationError zonder traceback
 *
 * Output is platte tekst zonder HTML tags. Lengte gecapped op ~280 chars.
 */
export function humanizeFrappeError(raw: unknown): string {
  if (raw == null) return "Onbekende fout";
  let text = typeof raw === "string" ? raw : (raw as Error).message ?? String(raw);

  // Strip omhullende JSON-array indien aanwezig.
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr) && arr.length > 0) {
        text = arr.join("\n");
      }
    } catch {
      // negeer, gebruik raw
    }
  }

  // Probeer de echte exception-regel te isoleren.
  const m = text.match(FRAPPE_EXCEPTION_RE);
  let msg = m ? m[1] : text;

  // Strip HTML-tags (Frappe gooit vaak <strong>X</strong> in z'n meldingen).
  msg = msg.replace(/<[^>]+>/g, "");
  // Newlines / dubbele spaties opruimen.
  msg = msg.replace(/\s+/g, " ").trim();

  // Lange traceback fallback: als er geen exception-regex matcht, val terug
  // op de laatste niet-lege regel die geen "File ..." traceback-frame is.
  if (!m) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.startsWith("File ") || line.startsWith("^^^")) continue;
      msg = line.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      break;
    }
  }

  if (!msg) return "Onbekende fout";
  if (msg.length > 280) msg = msg.slice(0, 277) + "…";
  return msg;
}

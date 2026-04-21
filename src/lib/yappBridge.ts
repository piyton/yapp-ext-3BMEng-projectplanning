/**
 * yappBridge — postMessage RPC client naar de Y-app parent.
 *
 * Protocol (zie Y-app: packages/frontend/src/components/ExtensionHost.tsx):
 *   iframe → parent   { id, type: "yapp-ext.rpc",       method, args }
 *   parent → iframe   { id, type: "yapp-ext.rpc.reply", ok, result | error }
 *
 * De iframe heeft geen ERPNext-sessie; alle ERPNext-calls gaan door dit
 * kanaal. De parent-broker voegt de juiste per-instance session-cookies toe.
 */

type RpcReply =
  | { id: number; type: "yapp-ext.rpc.reply"; ok: true; result: unknown }
  | { id: number; type: "yapp-ext.rpc.reply"; ok: false; error: string };

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

const pending = new Map<number, Pending>();
let nextId = 1;

const hostOrigin = new URLSearchParams(window.location.search).get("host") ?? "*";

window.addEventListener("message", (event: MessageEvent<RpcReply>) => {
  if (hostOrigin !== "*" && event.origin !== hostOrigin) return;
  const data = event.data;
  if (!data || data.type !== "yapp-ext.rpc.reply") return;
  const p = pending.get(data.id);
  if (!p) return;
  pending.delete(data.id);
  if (data.ok) p.resolve(data.result);
  else p.reject(new Error(data.error));
});

function call<T>(method: string, args: unknown[] = []): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    window.parent.postMessage({ id, type: "yapp-ext.rpc", method, args }, hostOrigin);
    // Safety timeout — if the parent never replies the promise hangs forever.
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`yappBridge timeout: ${method}`));
      }
    }, 30_000);
  });
}

/** ERPNext list query — matches parent's fetchList signature. */
export interface ListParams {
  fields?: string[];
  filters?: unknown[][];
  limit_page_length?: number;
  limit_start?: number;
  order_by?: string;
}

export function fetchList<T>(doctype: string, params?: ListParams): Promise<T[]> {
  return call<T[]>("fetchList", [doctype, params]);
}

export function fetchDocument<T>(doctype: string, name: string): Promise<T> {
  return call<T>("fetchDocument", [doctype, name]);
}

export function updateDocument<T>(
  doctype: string,
  name: string,
  data: Record<string, unknown>,
): Promise<T> {
  return call<T>("updateDocument", [doctype, name, data]);
}

export function callMethod<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return call<T>("callMethod", [method, args]);
}

export function getActiveInstanceId(): Promise<string> {
  return call<string>("getActiveInstanceId");
}

export function getErpNextAppUrl(): Promise<string> {
  return call<string>("getErpNextAppUrl");
}

/**
 * fetchAll — paginated wrapper around fetchList for when we need every
 * matching record. The Y-app parent doesn't expose this directly, so we
 * page here.
 */
export async function fetchAll<T>(
  doctype: string,
  fields: string[],
  filters: unknown[][] = [],
  orderBy = "modified desc",
  pageSize = 500,
): Promise<T[]> {
  const all: T[] = [];
  let start = 0;
  while (true) {
    const batch = await fetchList<T>(doctype, {
      fields,
      filters,
      order_by: orderBy,
      limit_page_length: pageSize,
      limit_start: start,
    });
    all.push(...batch);
    if (batch.length < pageSize) break;
    start += pageSize;
  }
  return all;
}

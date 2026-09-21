export function normalizePluginEvent(eventName, payload) {
  const raw = typeof payload === "string" ? safeParse(payload) : payload;
  const data = raw?.data ?? raw?.event?.data ?? raw ?? {};
  const name = eventName || (typeof raw?.event === "string" ? raw.event : null) || data.type || null;
  const paneId = findFirst(data, ["pane_id", "paneId"]);
  const status = findFirst(data, ["agent_status", "status"]);
  const previousStatus = findFirst(data, ["previous_agent_status", "previous_status"]);
  return {
    event_name: name,
    pane_id: paneId,
    status: status || (name === "pane.exited" ? "exited" : "unknown"),
    previous_status: previousStatus || null,
    raw,
  };
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function findFirst(value, keys, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key]) return value[key];
  }
  for (const nested of Object.values(value)) {
    const found = findFirst(nested, keys, seen);
    if (found) return found;
  }
  return null;
}

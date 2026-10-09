// Talking to the local viewer service: data, live changes, and the heartbeat that keeps it alive.

let online = true;
const statusListeners = new Set();
const setOnline = (value) => {
  if (online === value) return;
  online = value;
  statusListeners.forEach((l) => l(online));
};
export const onStatus = (l) => (statusListeners.add(l), () => statusListeners.delete(l));

export class NotFound extends Error {}

async function get(path, init = {}) {
  let res;
  try {
    res = await fetch(path, { cache: "no-store", ...init });
  } catch (err) {
    setOnline(false);
    throw err;
  }
  setOnline(true);
  if (!res.ok) {
    const message = (await res.json().catch(() => ({}))).error ?? res.statusText;
    throw res.status === 404 ? new NotFound(message) : new Error(message);
  }
  return res.json();
}

const enc = encodeURIComponent;
export const fetchMaps = () => get("/api/maps");
export const fetchMap = (slug, batch = null) => get(`/api/maps/${enc(slug)}${batch === null ? "" : `?batch=${batch}`}`);
// The one write the viewer can do. The custom header is what the server checks for.
export const deleteMap = (slug) => get(`/api/maps/${enc(slug)}`, { method: "DELETE", headers: { "x-diffusion-map": "delete" } });
export const fetchConversation = (slug, agent, id, node) => get(`/api/maps/${enc(slug)}/sessions/${agent}/${enc(id)}?node=${enc(node)}`);

// The server exits after a stretch without API calls; a visible page keeps it alive.
export function startHeartbeat() {
  const beat = () => document.visibilityState === "visible" && get("/api/heartbeat").catch(() => {});
  setInterval(beat, 60_000);
  document.addEventListener("visibilitychange", beat);
}

const changeListeners = new Set();
let source = null;
export function onMapChange(listener) {
  changeListeners.add(listener);
  if (!source) {
    source = new EventSource("/api/stream");
    source.addEventListener("change", (e) => {
      const { slug } = JSON.parse(e.data);
      changeListeners.forEach((l) => l(slug));
    });
    source.onopen = () => setOnline(true);
    // EventSource retries on its own; confirm with a real request before declaring the service gone.
    source.onerror = () => get("/api/health").catch(() => {});
  }
  return () => changeListeners.delete(listener);
}

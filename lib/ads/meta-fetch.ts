/**
 * Lecture de plusieurs objets Meta par ID.
 * "?ids=a,b,c" est supprimé en API v26+ (apps Meta récentes) → on lit alors
 * chaque objet séparément (5 en parallèle). Les anciennes apps gardent le lot.
 */
const META = "https://graph.facebook.com/v21.0";

export async function fetchMetaByIds(ids: string[], fields: string, token: string): Promise<{ ok: true; data: Record<string, Record<string, unknown>> } | { ok: false; error: string }> {
  const out: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = new URL(`${META}/`);
    url.searchParams.set("ids", chunk.join(","));
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = await res.json();
    if (res.ok && !json.error) { Object.assign(out, json); continue; }
    const msg = String(json?.error?.message ?? "");
    if (!/ids query parameter is deprecated/i.test(msg)) return { ok: false, error: msg || `HTTP ${res.status}` };
    // API v26+ : un appel par objet
    for (let j = 0; j < chunk.length; j += 5) {
      await Promise.all(chunk.slice(j, j + 5).map(async (id) => {
        const u = new URL(`${META}/${id}`);
        u.searchParams.set("fields", fields);
        u.searchParams.set("access_token", token);
        const r = await fetch(u.toString(), { cache: "no-store" });
        const jj = await r.json();
        if (r.ok && !jj.error) out[id] = jj;
      }));
    }
  }
  return { ok: true, data: out };
}

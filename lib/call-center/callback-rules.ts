/**
 * Rappels automatiques des « pas de réponse » (réglables : app_settings « cc_callback_rules »).
 * Après chaque appel sans réponse, la commande est reprogrammée selon la tentative :
 * délais en minutes (1er, 2e, 3e…), dans les heures d'appel (heure Maroc), jusqu'au max de tentatives.
 * Utilisable client + serveur.
 */
export type CallbackRules = { enabled: boolean; delays: number[]; maxAttempts: number; hourStart: number; hourEnd: number;
  /** À l'heure du rappel, la commande « pas de réponse » redevient « Nouvelle » chez la confirmatrice */
  requeueAsNew: boolean;
  /** … seulement si la commande a moins de N jours */
  requeueDays: number };

export const CALLBACK_DEFAULTS: CallbackRules = { enabled: true, delays: [30, 120, 240, 1080, 1440], maxAttempts: 6, hourStart: 9, hourEnd: 21, requeueAsNew: true, requeueDays: 15 };

export function normalizeCallbackRules(v: unknown): CallbackRules {
  let o = v;
  while (typeof o === "string") { try { o = JSON.parse(o); } catch { o = null; } }
  const r = (o && typeof o === "object" ? o : {}) as Partial<CallbackRules>;
  const delays = Array.isArray(r.delays) ? r.delays.map(Number).filter((n) => n > 0 && n < 100000) : [];
  const n = (x: unknown, d: number, lo: number, hi: number) => { const v = Number(x); return Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : d; };
  return {
    enabled: r.enabled !== false,
    delays: delays.length ? delays : CALLBACK_DEFAULTS.delays,
    maxAttempts: n(r.maxAttempts, CALLBACK_DEFAULTS.maxAttempts, 1, 20),
    hourStart: n(r.hourStart, CALLBACK_DEFAULTS.hourStart, 0, 23),
    hourEnd: n(r.hourEnd, CALLBACK_DEFAULTS.hourEnd, 1, 24),
    requeueAsNew: r.requeueAsNew !== false,
    requeueDays: n(r.requeueDays, CALLBACK_DEFAULTS.requeueDays, 1, 60),
  };
}

/** Heure Maroc (0–23) d'une date. */
export function maHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Casablanca", hour: "2-digit", hourCycle: "h23" }).format(d));
}

/** Prochain rappel après la tentative n° `attempts` (1 = 1er appel sans réponse) ; null = plus de rappel. */
export function nextCallbackAt(attempts: number, rules: CallbackRules, now = new Date()): Date | null {
  if (!rules.enabled || attempts >= rules.maxAttempts) return null;
  const delay = rules.delays[Math.min(attempts - 1, rules.delays.length - 1)] ?? 60;
  const t = new Date(now.getTime() + delay * 60_000);
  // ramener dans les heures d'appel (heure Maroc), au quart d'heure près
  for (let i = 0; i < 24 * 4; i++) {
    const h = maHour(t);
    if (h >= rules.hourStart && h < rules.hourEnd) return t;
    t.setTime(t.getTime() + 15 * 60_000);
  }
  return t;
}

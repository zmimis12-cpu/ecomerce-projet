/**
 * lib/creatives/portal-shared.ts — types + calculs de l'espace éditeur (utilisable côté client et serveur).
 * Réglages par éditeur : produits autorisés, mode de rémunération, masquer les montants pub.
 */

export type PayMode = "commission" | "salary" | "per_product";
export type PerUnit = "product" | "video" | "pack";

export type EditorPortalCfg = {
  productIds: string[];       // produits autorisés (l'éditeur ne voit que nom + photo)
  payMode: PayMode;
  salary: number;             // MAD / mois (mode salaire)
  salaryStart: string;        // "YYYY-MM-DD" début du salaire
  perAmount: number;          // MAD par produit / par vidéo validée (mode par produit)
  perUnit: PerUnit;           // "product" = 1 fois par produit · "video" = chaque lien validé · "pack" = par lot de N vidéos
  packSize: number;           // mode "pack" : nombre de vidéos validées par lot (ex : 9 vidéos = 120 MAD)
  plusCommission: boolean;    // salaire / par produit + commission sur livrées en plus
  hideAdMoney: boolean;       // ne voit pas dépense, budget, campagnes — seulement le coût
};

export const DEFAULT_PORTAL_CFG: EditorPortalCfg = {
  productIds: [], payMode: "commission", salary: 0, salaryStart: "", perAmount: 0,
  perUnit: "product", packSize: 9, plusCommission: false, hideAdMoney: false,
};

export type DeliveryStatus = "pending" | "accepted" | "rejected";

export type VideoDelivery = {
  id: string;
  editorId: string;
  productId: string;
  url: string;
  note: string;
  status: DeliveryStatus;
  createdAt: string;
  reviewedAt: string | null;
  adminNote: string;
};

/** Fiche produit pour les éditeurs (même fiche pour tous) : détails + liens utiles. */
export type ProductBrief = { text: string; links: string; updatedAt: string | null };
export const EMPTY_BRIEF: ProductBrief = { text: "", links: "", updatedAt: null };

export function normalizePortalCfg(v: Partial<EditorPortalCfg> | undefined | null): EditorPortalCfg {
  const d = { ...DEFAULT_PORTAL_CFG, ...(v ?? {}) };
  return {
    productIds: Array.isArray(d.productIds) ? d.productIds.filter((x) => typeof x === "string") : [],
    payMode: (["commission", "salary", "per_product"] as const).includes(d.payMode) ? d.payMode : "commission",
    salary: Math.max(0, Number(d.salary) || 0),
    salaryStart: /^\d{4}-\d{2}-\d{2}$/.test(d.salaryStart) ? d.salaryStart : "",
    perAmount: Math.max(0, Number(d.perAmount) || 0),
    perUnit: d.perUnit === "video" || d.perUnit === "pack" ? d.perUnit : "product",
    packSize: Math.max(1, Math.round(Number(d.packSize) || 9)),
    plusCommission: !!d.plusCommission,
    hideAdMoney: !!d.hideAdMoney,
  };
}

const fmt = (n: number) => n.toLocaleString("fr-MA", { maximumFractionDigits: 2 }) + " MAD";

export function payLabel(cfg: EditorPortalCfg, commissionLabel: string): string {
  const plus = cfg.plusCommission ? ` + ${commissionLabel}` : "";
  if (cfg.payMode === "salary") return `Salaire ${fmt(cfg.salary)} / mois${plus}`;
  if (cfg.payMode === "per_product")
    return cfg.perUnit === "pack"
      ? `${fmt(cfg.perAmount)} par lot de ${cfg.packSize} vidéos validées${plus}`
      : `${fmt(cfg.perAmount)} par ${cfg.perUnit === "video" ? "vidéo validée" : "produit validé"}${plus}`;
  return commissionLabel;
}

const DAY = 86_400_000;
const daysInMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();

/** Salaire acquis jour par jour entre [from, to) (borné au début du salaire et à aujourd'hui). */
function salaryAccrued(cfg: EditorPortalCfg, from: Date | null, to: Date | null): number {
  if (!cfg.salary || !cfg.salaryStart) return 0;
  const start = new Date(cfg.salaryStart + "T00:00:00Z");
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const end = new Date(today.getTime() + DAY); // aujourd'hui inclus
  let a = from && from > start ? new Date(from) : new Date(start);
  const b = to && to < end ? to : end;
  let total = 0;
  while (a < b) {
    total += cfg.salary / daysInMonth(a);
    a = new Date(a.getTime() + DAY);
  }
  return Math.round(total * 100) / 100;
}

function inRange(iso: string | null, from: Date | null, to: Date | null) {
  if (!iso) return false;
  if (!from || !to) return true;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
}

/** Gains « par produit / par vidéo » : comptés à la date de validation. */
function perProductEarned(cfg: EditorPortalCfg, deliveries: VideoDelivery[], from: Date | null, to: Date | null) {
  const ok = deliveries.filter((d) => d.status === "accepted" && d.reviewedAt)
    .sort((a, b) => a.reviewedAt!.localeCompare(b.reviewedAt!));
  if (cfg.perUnit === "video") return ok.filter((d) => inRange(d.reviewedAt, from, to)).length * cfg.perAmount;
  if (cfg.perUnit === "pack") {
    // Chaque N-ième vidéo validée complète un lot → payé à la date de cette validation
    return ok.filter((d, i) => (i + 1) % cfg.packSize === 0 && inRange(d.reviewedAt, from, to)).length * cfg.perAmount;
  }
  // 1 fois par produit : on compte la 1re vidéo validée de chaque produit
  const first = new Map<string, string>();
  for (const d of ok) if (!first.has(d.productId)) first.set(d.productId, d.reviewedAt!);
  return [...first.values()].filter((t) => inRange(t, from, to)).length * cfg.perAmount;
}

/** Gain total de l'éditeur sur la période selon son mode de rémunération. */
export function portalEarned(
  cfg: EditorPortalCfg, commission: number, deliveries: VideoDelivery[], from: Date | null, to: Date | null,
): number {
  if (cfg.payMode === "commission") return commission;
  const base = cfg.payMode === "salary" ? salaryAccrued(cfg, from, to) : perProductEarned(cfg, deliveries, from, to);
  return Math.round((base + (cfg.plusCommission ? commission : 0)) * 100) / 100;
}

/** La commission (commandes livrées) compte-t-elle pour cet éditeur ? */
export function usesCommission(cfg: EditorPortalCfg) {
  return cfg.payMode === "commission" || cfg.plusCommission;
}

/** Mode « lot de N vidéos » : progression vers le prochain lot. */
export function packProgress(cfg: EditorPortalCfg, deliveries: VideoDelivery[]) {
  const validated = deliveries.filter((d) => d.status === "accepted").length;
  const n = Math.max(1, cfg.packSize);
  return { validated, packs: Math.floor(validated / n), inPack: validated % n, packSize: n };
}

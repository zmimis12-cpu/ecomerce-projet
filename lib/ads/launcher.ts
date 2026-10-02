/**
 * lib/ads/launcher.ts — Lanceur de campagne Meta (server-only).
 * Construit la structure qui marche le mieux en COD Maroc :
 *   Campagne "Prospects" → 1 ensemble large (Maroc, Advantage+ audience,
 *   placements auto, optimisé sur l'événement Lead du pixel) → 3-5 pubs
 *   (vidéos / images) avec lien LP + code vidéo ?cr=V00X.
 * Tout est créé EN PAUSE ; "Activer" lance la diffusion.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readSettings } from "./sync-core";
import { getUsdToMad } from "./fx";
import { normalizeOffers, defaultLabel, type Offer } from "@/lib/landing-pages/offers";

const META = "https://graph.facebook.com/v21.0";
const BUCKET = "ad-media";

async function tokenAndAccount() {
  const s = await readSettings("meta");
  if (!s?.access_token || !s.account_id) throw new Error("Meta non configuré (Paramètres → Publicité)");
  return { token: s.access_token, acc: s.account_id.startsWith("act_") ? s.account_id : `act_${s.account_id}` };
}

async function metaPost(path: string, params: Record<string, unknown>, token: string) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  body.set("access_token", token);
  const res = await fetch(`${META}/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const json = await res.json();
  if (!res.ok || json.error) {
    const e = json?.error ?? {};
    throw new Error([e.error_user_title, e.error_user_msg || e.message].filter(Boolean).join(" — ") || `HTTP ${res.status}`);
  }
  return json;
}

async function metaGet(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${META}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

async function setting(key: string) {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data as { value: string } | null)?.value ?? null;
}
async function saveSetting(key: string, value: string, label: string) {
  await supabaseAdmin.from("app_settings").upsert({ key, value, category: "ads", label } as never, { onConflict: "key" });
}

/** Page Facebook, compte Instagram et pixel — détectés depuis tes pubs existantes. */
export async function getMetaIdentity() {
  let [pageId, igUserId, pixelId] = await Promise.all([setting("meta_page_id"), setting("meta_ig_user_id"), setting("meta_pixel_id")]);
  // Multi-comptes : Page / pixel détectés sur le compte principal
  const { primaryMetaAccount } = await import("./meta-accounts");
  const p = await primaryMetaAccount();
  if (p?.pageId) pageId = p.pageId;
  if (p?.pixelId) pixelId = p.pixelId;
  if (p?.igUserId) igUserId = p.igUserId;
  if (pageId && pixelId) return { pageId, igUserId, pixelId };
  const { token, acc } = await tokenAndAccount();
  const ads = await metaGet(`${acc}/ads`, { fields: "creative{object_story_spec,instagram_user_id}", limit: "25" }, token);
  for (const a of ads.data ?? []) {
    const oss = a.creative?.object_story_spec ?? {};
    if (!pageId && oss.page_id) pageId = String(oss.page_id);
    if (!igUserId && (oss.instagram_user_id || a.creative?.instagram_user_id)) igUserId = String(oss.instagram_user_id || a.creative.instagram_user_id);
  }
  if (!pixelId) {
    const sets = await metaGet(`${acc}/adsets`, { fields: "promoted_object", limit: "25" }, token);
    for (const x of sets.data ?? []) if (!pixelId && x.promoted_object?.pixel_id) pixelId = String(x.promoted_object.pixel_id);
  }
  if (pageId) await saveSetting("meta_page_id", pageId, "Page Facebook des pubs");
  if (igUserId) await saveSetting("meta_ig_user_id", igUserId, "Compte Instagram des pubs");
  if (pixelId) await saveSetting("meta_pixel_id", pixelId, "Pixel Meta");
  return { pageId, igUserId, pixelId };
}

export type Economics = {
  offer: { qty: number; price: number; label: string; slug: string | null } ;
  price: number; goodsCost: number; deliveryFee: number; marginPerDelivered: number;
  confirmRate: number; deliveryRate: number; ordersToDelivered: number;
  breakEvenCpoMad: number; targetCpoMad: number; suggestedBudgetUsd: number; fxRate: number; history: number;
};

/** Économie du produit, calculée sur TES vraies données → budget et limites conseillés. */
export async function productEconomics(productId: string): Promise<Economics> {
  const [{ data: p }, { data: items }, fx] = await Promise.all([
    supabaseAdmin.from("products").select("sale_price_mad, total_cost_mad, ads_cost_mad, confirmation_cost_mad, shipping_cost_mad").eq("id", productId).single(),
    supabaseAdmin.from("order_items").select("order_id").eq("product_id", productId).limit(5000),
    getUsdToMad(),
  ]);
  const prod = p as unknown as { sale_price_mad: number; total_cost_mad: number; ads_cost_mad: number | null; confirmation_cost_mad: number | null; shipping_cost_mad: number | null };
  const offer = await mainOffer(productId, Number(prod.sale_price_mad ?? 0));
  const goodsCost = (prod.total_cost_mad ?? 0) - (prod.ads_cost_mad ?? 0) - (prod.confirmation_cost_mad ?? 0) - (prod.shipping_cost_mad ?? 0);
  const ids = ((items ?? []) as { order_id: string }[]).map((i) => i.order_id);
  let all = 0, shipped = 0, delivered = 0, closed = 0, fees = 0, feeN = 0;
  for (let i = 0; i < ids.length; i += 150) {
    const { data: o } = await supabaseAdmin.from("orders")
      .select("status, is_duplicate, actual_delivery_cost").in("id", ids.slice(i, i + 150));
    for (const r of (o ?? []) as { status: string; is_duplicate: boolean; actual_delivery_cost: number | null }[]) {
      if (r.is_duplicate || ["new", "no_answer"].includes(r.status)) continue;
      all++;
      if (["sent_to_delivery", "in_transit", "delivered", "paid", "returned", "refused_delivery"].includes(r.status)) shipped++;
      if (["delivered", "paid"].includes(r.status)) delivered++;
      if (["delivered", "paid", "returned", "refused_delivery"].includes(r.status)) closed++;
      if (r.actual_delivery_cost) { fees += Number(r.actual_delivery_cost); feeN++; }
    }
  }
  const confirmRate = all >= 10 ? shipped / all : 0.6;
  const deliveryRate = closed >= 10 ? delivered / closed : 0.8;
  const deliveryFee = feeN ? fees / feeN : 35;
  // L'économie se calcule sur l'OFFRE principale de la landing page
  // (ex : 4 pièces à 299), pas sur le prix d'une pièce.
  const price = offer.price;
  const marginPerDelivered = price - goodsCost * offer.qty - deliveryFee;
  const ordersToDelivered = confirmRate * deliveryRate;
  const breakEvenCpoMad = Math.max(0, marginPerDelivered * ordersToDelivered);
  const targetCpoMad = Math.round(breakEvenCpoMad * 0.8);
  // Budget de test : ~3 commandes/jour au coût cible, minimum 10 $
  const suggestedBudgetUsd = Math.max(10, Math.round((targetCpoMad * 3) / fx.rate));
  return {
    offer, price, goodsCost: Math.round(goodsCost * offer.qty), deliveryFee: Math.round(deliveryFee), marginPerDelivered: Math.round(marginPerDelivered),
    confirmRate, deliveryRate, ordersToDelivered, breakEvenCpoMad: Math.round(breakEvenCpoMad), targetCpoMad,
    suggestedBudgetUsd, fxRate: fx.rate, history: all,
  };
}

/** Offre principale de la LP du produit (celle présélectionnée, sinon la 1re). */
export async function mainOffer(productId: string, unitPrice: number) {
  const { data } = await supabaseAdmin.from("landing_pages" as never)
    .select("slug, offers, bundle_1_price, bundle_2_price, bundle_3_price, is_active")
    .eq("product_id", productId).order("is_active", { ascending: false }).limit(1).maybeSingle();
  const lp = data as { slug: string; offers: unknown; bundle_1_price: number | null; bundle_2_price: number | null; bundle_3_price: number | null } | null;
  const offers: Offer[] = normalizeOffers(lp?.offers, { price: unitPrice, b1: lp?.bundle_1_price, b2: lp?.bundle_2_price, b3: lp?.bundle_3_price });
  const o = offers.find((x) => x.isDefault) ?? offers[0];
  return { qty: o.qty, price: o.price, label: o.label || defaultLabel(o.qty), slug: lp?.slug ?? null };
}

/** Textes de départ (arabe / darija) basés sur l'OFFRE, à modifier librement. */
export function textSuggestions(name: string, price: number, offer?: { qty: number; label: string }) {
  const p = Math.round(price);
  if (offer && offer.qty > 1) {
    return [
      { headline: `${offer.label} — ${p} درهم`, primary: `🔥 عرض خاص على ${name}!\n🎁 ${offer.label} بـ ${p} درهم فقط\n✅ الدفع عند الاستلام\n🚚 توصيل سريع لجميع مدن المغرب\n⏳ العرض محدود — اطلب دابا 👇` },
      { headline: `${offer.qty} قطع بـ ${p} درهم فقط`, primary: `واش بغيتي ${name} ليك ولعائلتك؟ 😍\n👉 ${offer.label} غير بـ ${p} درهم\n📦 خلّص ملي توصلك السلعة\n🇲🇦 التوصيل لجميع المدن\nالكمية محدودة 👇` },
      { headline: `عرض محدود: ${offer.label}`, primary: `⭐ ${name} — أحسن هدية\n🔥 ${offer.label} بـ ${p} درهم\n✔️ الدفع عند الاستلام\n✔️ التوصيل فـ 24-72 ساعة\n🎁 كليكي على "اطلب الآن" قبل ما يسالي العرض` },
    ];
  }
  return [
    { headline: `${name} — ${p} درهم فقط`, primary: `🔥 ${name} وصل!\n✅ الدفع عند الاستلام\n🚚 توصيل سريع لجميع مدن المغرب\n💰 الثمن: ${p} درهم فقط\n👇 اطلب دابا قبل ما يسالي الستوك` },
    { headline: `اطلب دابا — الدفع عند الاستلام`, primary: `واش كتقلب على ${name} بثمن مناسب؟ 🤔\nجودة عالية وضمان 💯\n📦 خلّص غير ملي توصلك السلعة\n🇲🇦 التوصيل لجميع المدن\nالكمية محدودة — اطلب دابا 👇` },
    { headline: `عرض خاص: ${p} درهم`, primary: `⭐ آلاف الزبناء فرحانين بـ ${name}\n✔️ الدفع عند الاستلام\n✔️ التوصيل فـ 24-72 ساعة\n✔️ خدمة الزبناء على واتساب\n🎁 العرض محدود — كليكي على "اطلب الآن"` },
  ];
}

async function landingLink(productId: string | null, code: string | null) {
  const domain = process.env.NEXT_PUBLIC_LP_DOMAIN || "hajtek.ma";
  if (!productId) return `https://${domain}`;
  const { data } = await supabaseAdmin.from("landing_pages" as never).select("slug").eq("product_id", productId).limit(1).maybeSingle();
  const slug = (data as { slug: string } | null)?.slug;
  const base = slug ? `https://${domain}/lp/${slug}` : `https://${domain}`;
  return code ? `${base}?cr=${code}` : base;
}

type Launch = {
  id: string; name: string; product_id: string | null; daily_budget_usd: number; age_min: number; age_max: number;
  cost_cap_usd: number | null;
  status: string; meta_campaign_id: string | null; meta_adset_id: string | null;
};
type Item = {
  id: string; creative_id: string | null; media_type: "video" | "image"; media_path: string; primary_text: string;
  headline: string; cta: string; status: string; meta_video_id: string | null; meta_image_hash: string | null;
  meta_creative_id: string | null; meta_ad_id: string | null;
};

/** Crée (ou reprend) la campagne dans Meta, étape par étape. Rejouable sans doublon. */
export async function processLaunch(launchId: string) {
  const { token, acc } = await tokenAndAccount();
  const { data: l } = await supabaseAdmin.from("campaign_launches" as never).select("*").eq("id", launchId).single();
  const launch = l as unknown as Launch;
  const upd = (patch: Record<string, unknown>) =>
    supabaseAdmin.from("campaign_launches" as never).update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", launchId);

  try {
    await upd({ status: "creating", error: null });
    const id = await getMetaIdentity();
    if (!id.pageId) throw new Error("Page Facebook introuvable : assigne ta Page à l'utilisateur système (Business → Utilisateurs système → Assigner des ressources → Pages).");
    if (!id.pixelId) throw new Error("Pixel Meta introuvable.");

    // 1. Campagne
    let campaignId = launch.meta_campaign_id;
    if (!campaignId) {
      const c = await metaPost(`${acc}/campaigns`, {
        name: launch.name, objective: "OUTCOME_LEADS", status: "PAUSED",
        special_ad_categories: [], buying_type: "AUCTION", is_adset_budget_sharing_enabled: false,
      }, token);
      campaignId = String(c.id);
      await upd({ meta_campaign_id: campaignId });
      if (launch.product_id) {
        await supabaseAdmin.from("campaign_product_assignments").delete().eq("platform", "meta").eq("campaign_id", campaignId);
        await supabaseAdmin.from("campaign_product_assignments").insert({
          platform: "meta", campaign_id: campaignId, campaign_name: launch.name, product_id: launch.product_id,
        } as never);
      }
    }

    // 2. Ensemble de pubs : large Maroc, Advantage+ audience, optimisé Lead pixel
    let adsetId = launch.meta_adset_id;
    if (!adsetId) {
      const a = await metaPost(`${acc}/adsets`, {
        name: `${launch.name} — Large Maroc`,
        campaign_id: campaignId,
        daily_budget: String(Math.round(Number(launch.daily_budget_usd) * 100)),
        billing_event: "IMPRESSIONS",
        optimization_goal: "OFFSITE_CONVERSIONS",
        // Coût max par livraison demandé → plafond de coût par lead (Cost Cap)
        ...(launch.cost_cap_usd
          ? { bid_strategy: "COST_CAP", bid_amount: String(Math.round(Number(launch.cost_cap_usd) * 100)) }
          : { bid_strategy: "LOWEST_COST_WITHOUT_CAP" }),
        promoted_object: { pixel_id: id.pixelId, custom_event_type: "LEAD" },
        targeting: {
          geo_locations: { countries: ["MA"], location_types: ["home", "recent"] },
          age_min: launch.age_min, age_max: launch.age_max,
          targeting_automation: { advantage_audience: 1 },
        },
        attribution_spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }, { event_type: "VIEW_THROUGH", window_days: 1 }],
        status: "PAUSED",
      }, token);
      adsetId = String(a.id);
      await upd({ meta_adset_id: adsetId });
    }

    // 3. Pubs
    const { data: its } = await supabaseAdmin.from("campaign_launch_items" as never).select("*").eq("launch_id", launchId).order("created_at");
    const items = (its ?? []) as unknown as Item[];
    const { data: cr } = await supabaseAdmin.from("creatives" as never).select("id, code");
    const codeOf = new Map(((cr ?? []) as { id: string; code: string }[]).map((c) => [c.id, c.code]));
    let waiting = 0, errors = 0;

    for (const it of items) {
      if (it.status === "created") continue;
      const updItem = (patch: Record<string, unknown>) =>
        supabaseAdmin.from("campaign_launch_items" as never).update(patch as never).eq("id", it.id);
      try {
        const fileUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl(it.media_path).data.publicUrl;
        const code = it.creative_id ? codeOf.get(it.creative_id) ?? null : null;
        const link = await landingLink(launch.product_id, code);
        let storySpec: Record<string, unknown>;

        if (it.media_type === "video") {
          let videoId = it.meta_video_id;
          if (!videoId) {
            const v = await metaPost(`${acc}/advideos`, { file_url: fileUrl, name: `${code ?? ""} ${it.headline}`.trim() }, token);
            videoId = String(v.id);
            await updItem({ meta_video_id: videoId, status: "processing" });
          }
          const st = await metaGet(videoId, { fields: "status" }, token);
          const vs = st.status?.video_status;
          if (vs === "error") throw new Error("Meta n'a pas pu traiter la vidéo (format ?)");
          if (vs !== "ready") { waiting++; await updItem({ status: "processing" }); continue; }
          const th = await metaGet(`${videoId}/thumbnails`, { fields: "uri,is_preferred" }, token);
          const thumbs = (th.data ?? []) as { uri: string; is_preferred: boolean }[];
          const thumb = (thumbs.find((t) => t.is_preferred) ?? thumbs[0])?.uri;
          storySpec = {
            page_id: id.pageId, ...(id.igUserId ? { instagram_user_id: id.igUserId } : {}),
            video_data: {
              video_id: videoId, ...(thumb ? { image_url: thumb } : {}),
              message: it.primary_text, title: it.headline,
              call_to_action: { type: it.cta, value: { link } },
            },
          };
        } else {
          let hash = it.meta_image_hash;
          if (!hash) {
            const bytes = Buffer.from(await (await fetch(fileUrl)).arrayBuffer()).toString("base64");
            const img = await metaPost(`${acc}/adimages`, { bytes }, token);
            const first = Object.values(img.images ?? {})[0] as { hash: string } | undefined;
            if (!first?.hash) throw new Error("Image refusée par Meta");
            hash = first.hash;
            await updItem({ meta_image_hash: hash });
          }
          storySpec = {
            page_id: id.pageId, ...(id.igUserId ? { instagram_user_id: id.igUserId } : {}),
            link_data: {
              image_hash: hash, link, message: it.primary_text, name: it.headline,
              call_to_action: { type: it.cta, value: { link } },
            },
          };
        }

        let creativeId = it.meta_creative_id;
        if (!creativeId) {
          const c = await metaPost(`${acc}/adcreatives`, { name: `${code ?? "pub"} — ${it.headline}`.slice(0, 100), object_story_spec: storySpec }, token);
          creativeId = String(c.id);
          await updItem({ meta_creative_id: creativeId });
        }
        const ad = await metaPost(`${acc}/ads`, {
          name: `${code ? code + " - " : ""}${it.headline}`.slice(0, 100),
          adset_id: adsetId, creative: { creative_id: creativeId }, status: "PAUSED",
        }, token);
        await updItem({ meta_ad_id: String(ad.id), status: "created", error: null });
        if (it.creative_id) {
          await supabaseAdmin.from("creative_ads" as never).upsert({
            platform: "meta", ad_id: String(ad.id), creative_id: it.creative_id, linked_by: "manual",
          } as never, { onConflict: "platform,ad_id" });
        }
      } catch (e) {
        errors++;
        await updItem({ status: "error", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
      }
    }

    const status = waiting ? "waiting_media" : errors === items.length && items.length ? "error" : "ready";
    await upd({ status, error: errors ? `${errors} pub(s) en erreur — voir le détail` : null });
    return { ok: true, status, waiting, errors };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await upd({ status: "error", error: msg.slice(0, 500) });
    return { ok: false, error: msg };
  }
}

/** Passe campagne + ensemble + pubs créées en ACTIF. */
export async function activateLaunch(launchId: string) {
  const { token } = await tokenAndAccount();
  const { data: l } = await supabaseAdmin.from("campaign_launches" as never).select("*").eq("id", launchId).single();
  const launch = l as unknown as Launch;
  if (!launch.meta_campaign_id || !launch.meta_adset_id) throw new Error("Campagne pas encore créée.");
  const { data: its } = await supabaseAdmin.from("campaign_launch_items" as never).select("meta_ad_id").eq("launch_id", launchId).eq("status", "created");
  for (const it of (its ?? []) as { meta_ad_id: string }[]) await metaPost(it.meta_ad_id, { status: "ACTIVE" }, token);
  await metaPost(launch.meta_adset_id, { status: "ACTIVE" }, token);
  await metaPost(launch.meta_campaign_id, { status: "ACTIVE" }, token);
  await supabaseAdmin.from("campaign_launches" as never).update({ status: "active", updated_at: new Date().toISOString() } as never).eq("id", launchId);
}

/** Cron : reprend les lancements qui attendent que Meta finisse de traiter les vidéos. */
export async function continuePendingLaunches() {
  const { data } = await supabaseAdmin.from("campaign_launches" as never).select("id").in("status", ["waiting_media", "creating"]).limit(5);
  let n = 0;
  for (const l of (data ?? []) as { id: string }[]) { await processLaunch(l.id); n++; }
  return { ok: true, resumed: n };
}

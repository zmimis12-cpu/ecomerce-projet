# HajtekZone / GestionPro — mémoire de travail pour Claude

Lis ce fichier en entier au début de chaque conversation. Zack (propriétaire) ne veut pas tout réexpliquer.

## Zack — façon de travailler
- Répondre en **français / darija**, **court**. Économiser son usage Claude (pas d'exploration inutile, pas de longs tableaux).
- « ne fait rien » / « juste question » = répondre seulement, ne rien modifier.
- Toujours appliquer les changements **en live sur les vraies pages** (pas de variante de test), tout doit être **réglable depuis l'admin**.
- Ne jamais supprimer une fonction existante. Garder les landing pages **rapides** et surveiller la conso **Supabase / Vercel**.
- Git : Claude a l'accès push → `git push origin HEAD:main` (Vercel déploie). Commits en français.
- Pas de faux avis, pas de fausses infos.

## Stack
Next.js 15 (app router) · Supabase · Vercel. Landing pages : `app/(public)/lp/[slug]/page.tsx` (design réglable : `lib/store/lp-design-shared.ts`, app_settings `lp_design` global + perSlug, cache ~5 min). Formulaire : `components/landing/order-form-public.tsx` → `app/api/public/orders/route.ts`.
Accès : clé Supabase service dans `env.env` (SUPABASE_SERVICE_ROLE_KEY), REST `https://nccufqvnxoftzovfsako.supabase.co/rest/v1`. Tokens pubs dans `app_settings` : `meta_accounts` (liste, champ `token` — sert au sync/dashboard, PAS d'accès à la page), `tiktok_accounts`.
**Pour créer / modifier des pubs Meta : utiliser `app_settings` key `meta_launch_token` → champ `token`** (system user « deals » 122109782439502904, n'expire jamais, accès page Hajtek Zone 1165019800018717 + Instagram 17841475526156405 + compte act_1765551261341640). Ne rien demander à Zack côté Business Manager : ce token marche déjà.
Pour lancer du code serveur hors Next : `SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_URL=https://nccufqvnxoftzovfsako.supabase.co npx tsx script.ts`.

## Business
COD Maroc. Livraison Digylog (webhook → payé auto) + Speedaf (pas d'auto-payé : marquer payé à la main au virement) + livreurs propres. 1 $ ≈ 9,82 DH.
Taux admin : confirmation = commandes ayant atteint « confirmé » / toutes ; livraison = livrées (delivered/paid/exchanged) / expédiées.
Projecteur HY300 549 DH : livrée/commande ≈ 0,49 ; marge ≈ 91,5 DH/livrée ; CPL d'équilibre ≈ 45 DH. Objectif : récupérer la perte cumulée (~ −17 000 DH au 26/10) puis profit chaque jour.
Taxe Meta : seulement compte Hajtek Ads, 20 % depuis 2026-10-02 (≈ 10 $) ; Hajtekzone et Dealsdt 0 %.

## Meta Ads (compte actif Dealsdt act_1765551261341640, fuseau US/Eastern → jour Meta commence 04:00 Maroc)
Pixel 2140645139813157 · Page 1165019800018717 · Instagram 17841475526156405. Upload vidéo : graph-video.facebook.com (noms de fichiers sans virgule). `start_time` toujours en `--data-urlencode`.
Règles Zack :
- Texte pub : **jamais de prix/offre** ; structure problème → solution → CTA (darija).
- Nouvelles pubs live à **20:00 Maroc**.
- Placements **uniquement** : Facebook feed/story/reels + Instagram stream/story/reels (pas Audience Network/apps/Messenger…).
- Scaling = augmenter la campagne gagnante (~+20/30 %/nuit), **pas de nouvelle grosse campagne**. Nouvelles vidéos → campagne **test ABO 5 $/vidéo**, gagnante copiée dans la CBO.
Campagnes (28/10 20:00) : Projecteur CBO 120251697189060189 à 25 $ → ad set Large 120251697189430189 (V030 seule active) + ad set « Large V046+V048 » 120251772147840189 (min 6 $) · Test projecteur 120251741211160189 : seule V044 active (V041–V043, V045–V048 en pause) · Split CBO 120251697187250189 à 45 $ (Large V010 + Lookalike 0-3 % 120251701422530189 V009/V010) · Test Split 120251754661160189 (V049–V051, couper à 5 $ sans commande) · Scale 120251727174590189 en PAUSE (ne pas réactiver).
Économie (28/10) : Split marge ≈ 142 DH/livrée, CPL max ≈ 85 DH → produit rentable à scaler. Projecteur marge ≈ 78 DH/livrée, CPL max ≈ 38–45 DH. Zack valide chaque action pub par lettre (A, B…) avant exécution.
Codes vidéo V0xx : table `creatives` (+ `creative_ads` ad_id ↔ creative), lien LP `?cr=V0xx` (titre/hero par avatar via `angles` du lp_design).
Analyse automatique chaque nuit 00:05 (tâche planifiée séparée) ; journal dans app_settings `night_ads_log`.

## TikTok
Compte odtdeals_adv 7688685995371773958 (USD) connecté en OAuth. Pixel DAPRTBJC77UFPT8022K0 sur toutes les LP ; SubmitForm + PlaceAnOrder envoyés côté serveur (`lib/tiktok/events-api.ts`). Budget minimum TikTok 20 $/ad group. Scopes Ads + Creative Management OK depuis 28/10 (upload vidéo + identité TT_USER dealsodt f89a0ae3-0fc7-5696-aaed-2743b5ea27f5). Campagne SPLIT – TikTok V010 (ad group 1880315828854114, 20 $, ON_WEB_ORDER, Maroc 2542007). Dépense synchronisée auto (cron 15 min).

## Pages admin utiles
Dashboard (profit net réel, pub réelle prélevée) · Sources pub `/admin/sources` (rentabilité Meta/TikTok/Google, Instagram vs Facebook) · Après livraison `/admin/products/livraison` · Paniers abandonnés (message WhatsApp modifiable) · Éditeurs vidéos (taux par vidéo).

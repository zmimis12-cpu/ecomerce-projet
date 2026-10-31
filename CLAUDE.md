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
Campagnes (29/10 00:35) : Projecteur CBO 120251697189060189 à 25 $ → ad set Large 120251697189430189 (V030) + ad set « Large V046+V048 » 120251772147840189 (min 6 $, V044 V048 ; V046 en pause 29/10) · V031 réactivée par Zack dans le Large · Test projecteur 120251741211160189 : seule V044 active · Split CBO 120251697187250189 à 20 $ depuis 29/10 21h (Large V010 ; Lookalike 120251701422530189 en PAUSE, 0 cmd) · Test Split 120251754661160189 : tout coupé (V049–V051) · Scale 120251727174590189 en PAUSE (ne pas réactiver).
MAJ 30/10 10h : Projecteur CBO 40 $ · Test projecteur 120251741211160189 EN PAUSE · Split CBO 25 $ (Large : V010 + V050 ajoutée 30/10) · Compte Hajtek Zone 2 act_980815675083081 (fuseau Casablanca, pixel dealodst 2461844207638312) : campagne HZ2 120261162170960537 (Split 15 $ V010, Projecteur 10 $ V030+V031, hommes, FB feed + IG) — 0 diffusion au 30/10 matin (compte neuf). HZ2 : campagne EXTRACTEUR 599 120261171913570537 (4×5 $) ; Projecteur HZ2 passé hommes+femmes le 30/10.
30/10 lancés à 20:00 sur Dealsdt : RETARGETING 120251799621110189 (Split V010 + Projecteur V030, 2×5 $, visiteurs LP 14j, exclut Leads 30j + clients) · EXTRACTEUR 599 Dealsdt 120251799628480189 (4×5 $, V021–V028 sans prix). Extracteur 599 DH (offres 1=599, 2=1099, 3=1549).
LP par avatar (31/10) : angle avec « page » → le middleware réécrit /lp/split?cr=V010 vers /lp/split-karate (lien pub inchangé, carte via /api/public/lp-variants). Split : split-femme (V007/V008 + défaut hero), split-karate (V009/V010/V049/V050), split-danse (V011/V012), split-fitness (V013/V014/V051). Les commandes portent landing_page_slug = page avatar. Avis Split (200 avis/4.8) non vérifiés → désactivés sur les pages avatar. Bloc avant/après « نتائج حقيقية » désactivé (Split, Projecteur, Twist). Stats « 98 % / +2000 » remplacées (faux).
Données 30j : Projecteur femmes 25–34 = meilleur CPL (7,7 $) ; Split = hommes 25–34 et 45–54 (femmes ~31 $) ; FB Reels CPL ×2 vs IG Reels.
Twist Stepper (379 DH, marge ≈ 113 DH/livrée, CPL break-even ≈ 62 DH) : campagne test ABO 120251787374420189 lancée 29/10 20:00, 4 ad sets avatars femmes (5 $ chacun), V052–V059 (éditrice Meryem), LP /lp/twist-stepper-fitness?cr=V0xx. Couper une vidéo à 6,5 $ sans commande.
Économie (28/10) : Split marge ≈ 142 DH/livrée, CPL max ≈ 85 DH → produit rentable à scaler. Projecteur marge ≈ 78 DH/livrée, CPL max ≈ 38–45 DH. Zack valide chaque action pub par lettre (A, B…) avant exécution.
Codes vidéo V0xx : table `creatives` (+ `creative_ads` ad_id ↔ creative), lien LP `?cr=V0xx` (titre/hero par avatar via `angles` du lp_design).
Analyse automatique chaque nuit 00:05 (tâche planifiée séparée) ; journal dans app_settings `night_ads_log`.

## TikTok
Compte odtdeals_adv 7688685995371773958 (USD) connecté en OAuth. Pixel DAPRTBJC77UFPT8022K0 sur toutes les LP ; SubmitForm + PlaceAnOrder envoyés côté serveur (`lib/tiktok/events-api.ts`). Budget minimum TikTok 20 $/ad group. Scopes Ads + Creative Management OK depuis 28/10 (upload vidéo + identité TT_USER dealsodt f89a0ae3-0fc7-5696-aaed-2743b5ea27f5). Campagne SPLIT – TikTok V010 (ad group 1880315828854114, 20 $, ON_WEB_ORDER, Maroc 2542007) EN PAUSE depuis 29/10 (12,7 $, 0 commande). Dépense synchronisée auto (cron 15 min).

## Pages admin utiles
Dashboard (profit net réel, pub réelle prélevée) · Sources pub `/admin/sources` (rentabilité Meta/TikTok/Google, Instagram vs Facebook) · Après livraison `/admin/products/livraison` · Paniers abandonnés (message WhatsApp modifiable) · Éditeurs vidéos (taux par vidéo).

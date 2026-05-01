-- ============================================================
-- E-COMMERCE SCHEMA v2 — STEP 2: ALL MIGRATIONS
-- Run AFTER ecommerce_schema_v2_step1_enums.sql is committed.
-- ============================================================


-- =============================================================================
-- SECTION 2 — SHOPS TABLE (MULTI-LOCATION FOUNDATION)
-- A "shop" is a logical business unit (storefront, warehouse, or branch).
-- In single-shop mode: one row exists, all foreign keys NULL (optional join).
-- In multi-shop mode: each record isolated per shop via RLS on shop_id.
-- stock_locations models the physical layer (shelves/bins).
-- shops models the logical/business layer above stock_locations.
-- =============================================================================

-- [NEW] shops — logical business units
CREATE TABLE shops (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    code            TEXT UNIQUE NOT NULL,               -- e.g. 'CASA-01', 'RABAT-02'
    city            TEXT,
    address         TEXT,
    phone           TEXT,
    email           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    is_default      BOOLEAN NOT NULL DEFAULT false,     -- single-shop mode: set true
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one shop can be the default at a time
CREATE UNIQUE INDEX idx_shops_single_default
    ON shops (is_default) WHERE is_default = true;

-- [MOD] stock_locations — link to shop (a warehouse belongs to a shop)
ALTER TABLE stock_locations
    ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_locations_shop ON stock_locations(shop_id);


-- =============================================================================
-- SECTION 3 — ADD shop_id TO CORE TRANSACTIONAL TABLES
-- All columns are NULL by default → backward compatible (single-shop mode).
-- When multi-shop activates: populate, add NOT NULL, apply RLS per shop_id.
-- =============================================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id);

ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_shop ON stock_movements(shop_id);

ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_returns_shop ON returns(shop_id);

ALTER TABLE shipments
    ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_shop ON shipments(shop_id);

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_shop ON expenses(shop_id);


-- =============================================================================
-- SECTION 4 — SEPARATE ESTIMATED vs REAL COSTS IN ORDERS
-- v1 had: cogs_total, shipping_cost_actual, estimated_profit, real_profit
-- v2 adds: full cost breakdown (estimated + real) for ads, shipping, confirmation.
-- All new columns nullable — existing rows unaffected.
-- estimated_profit and real_profit remain plain NUMERIC (not generated) so the
-- application can write them explicitly after all cost components are known.
--
-- Formula reference:
--   estimated_profit = (subtotal - discount_amount)
--                      - est_cogs_total
--                      - estimated_shipping_cost
--                      - estimated_ads_cost
--                      - estimated_confirmation_cost
--
--   real_profit      = amount_collected
--                      - real_cogs_total
--                      - real_shipping_cost
--                      - real_ads_cost
--                      - real_confirmation_cost
--                      - real_return_cost
-- =============================================================================

ALTER TABLE orders
    -- COGS breakdown
    ADD COLUMN IF NOT EXISTS est_cogs_total               NUMERIC(12,2),  -- estimated COGS at order creation
    ADD COLUMN IF NOT EXISTS real_cogs_total              NUMERIC(12,2),  -- actual COGS (may differ per batch)

    -- Shipping
    ADD COLUMN IF NOT EXISTS estimated_shipping_cost      NUMERIC(12,2),  -- expected carrier cost
    ADD COLUMN IF NOT EXISTS real_shipping_cost           NUMERIC(12,2),  -- actual invoice from carrier

    -- Ads attribution
    ADD COLUMN IF NOT EXISTS estimated_ads_cost           NUMERIC(12,2),  -- CPL or budget share at creation
    ADD COLUMN IF NOT EXISTS real_ads_cost                NUMERIC(12,2),  -- reconciled after campaign closes

    -- Confirmation cost (call center cost per confirmed order)
    ADD COLUMN IF NOT EXISTS estimated_confirmation_cost  NUMERIC(12,2),  -- agent cost / confirmed orders/day
    ADD COLUMN IF NOT EXISTS real_confirmation_cost       NUMERIC(12,2),  -- actual agent cost portion

    -- Return cost (only known after return is resolved)
    ADD COLUMN IF NOT EXISTS real_return_cost             NUMERIC(12,2) NOT NULL DEFAULT 0;

-- MIGRATION NOTE: v1's shipping_cost_actual = real_shipping_cost conceptually.
-- Backfill with:
--   UPDATE orders SET real_shipping_cost = shipping_cost_actual
--   WHERE shipping_cost_actual IS NOT NULL AND real_shipping_cost IS NULL;


-- =============================================================================
-- SECTION 5 — IMPROVE order_profit_detail
-- v1: selling_price_total, cogs_total, shipping_cost_paid, ad_spend_attributed,
--     return_cost, other_cost → gross_profit, net_profit, net_margin_pct (generated)
-- v2: add estimated vs real split, confirmation cost, finalization tracking.
-- Existing generated columns gross_profit / net_profit / net_margin_pct remain
-- as the "legacy estimated" view. New code reads estimated_net_profit / real_net_profit.
-- =============================================================================

ALTER TABLE order_profit_detail
    -- Estimated side (populated at order confirmation)
    ADD COLUMN IF NOT EXISTS estimated_cogs              NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS estimated_shipping          NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS estimated_ads               NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS estimated_confirmation      NUMERIC(12,2),

    -- Real side (populated after delivery + payment reconciliation)
    ADD COLUMN IF NOT EXISTS real_cogs                   NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS real_shipping               NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS real_ads                    NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS real_confirmation           NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS real_return_cost            NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Recomputed profit fields (plain NUMERIC — updated by app/trigger)
    ADD COLUMN IF NOT EXISTS estimated_net_profit        NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS real_net_profit             NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS real_margin_pct             NUMERIC(6,2),

    -- Lifecycle tracking
    ADD COLUMN IF NOT EXISTS finalized_at                TIMESTAMPTZ;    -- when real_* costs confirmed


-- =============================================================================
-- SECTION 6 — IMPROVE return_items (granular quantity breakdown)
-- v1: quantity (total returned), condition, restocked (bool), restocked_to
-- v2: splits quantity into 4 counters + computed write-off value.
-- Constraint: restocked_qty <= good_qty (can't restock damaged goods).
-- Only restocked_qty generates a stock_movement of type 'return_in'.
-- damaged_qty generates a stock_movement of type 'damage'.
-- missing_qty stays as loss; no stock movement until resolved.
-- =============================================================================

ALTER TABLE return_items
    ADD COLUMN IF NOT EXISTS returned_qty    INT NOT NULL DEFAULT 0,    -- total physically received
    ADD COLUMN IF NOT EXISTS good_qty        INT NOT NULL DEFAULT 0,    -- sellable condition
    ADD COLUMN IF NOT EXISTS damaged_qty     INT NOT NULL DEFAULT 0,    -- damaged, write off
    ADD COLUMN IF NOT EXISTS missing_qty     INT NOT NULL DEFAULT 0,    -- not received / dispute
    ADD COLUMN IF NOT EXISTS restocked_qty   INT NOT NULL DEFAULT 0,    -- put back in stock
    ADD COLUMN IF NOT EXISTS unit_cost_mad   NUMERIC(12,2),             -- snapshot cost at sale time
    ADD COLUMN IF NOT EXISTS write_off_value NUMERIC(12,2);             -- damaged_qty * unit_cost_mad

-- ADD CONSTRAINT does not support IF NOT EXISTS in PostgreSQL.
-- Use a DO block to check pg_constraint before adding each constraint.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_restocked_lte_good' AND conrelid = 'return_items'::regclass
    ) THEN
        ALTER TABLE return_items
            ADD CONSTRAINT chk_restocked_lte_good
                CHECK (restocked_qty <= good_qty);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_return_qty_positive' AND conrelid = 'return_items'::regclass
    ) THEN
        ALTER TABLE return_items
            ADD CONSTRAINT chk_return_qty_positive
                CHECK (good_qty >= 0 AND damaged_qty >= 0 AND missing_qty >= 0 AND restocked_qty >= 0);
    END IF;
END;
$$;

-- Partial indexes: fast lookup of lines with specific issues
CREATE INDEX IF NOT EXISTS idx_return_items_restocked ON return_items(restocked_qty) WHERE restocked_qty > 0;
CREATE INDEX IF NOT EXISTS idx_return_items_damaged   ON return_items(damaged_qty)   WHERE damaged_qty   > 0;
CREATE INDEX IF NOT EXISTS idx_return_items_missing   ON return_items(missing_qty)   WHERE missing_qty   > 0;

-- WORKFLOW NOTE:
--   1. Receive return → set returned_qty
--   2. Inspect → set good_qty / damaged_qty / missing_qty
--   3. Restock → set restocked_qty (≤ good_qty), trigger stock_movement 'return_in'
--   4. Write off → set write_off_value = damaged_qty * unit_cost_mad, trigger 'damage'


-- =============================================================================
-- SECTION 7 — SCANNER LOGS WITH DUPLICATE PROTECTION
-- New table: scanner_logs tracks every scan from warehouse scanners / DIGYLOG.
-- Duplicate detection: partial UNIQUE index on (tracking_number, scan_type)
-- WHERE is_duplicate = false — allows storing duplicate scan attempts as audit
-- rows while preventing them from producing duplicate stock effects.
-- =============================================================================

CREATE TABLE scanner_logs (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracking_number  TEXT NOT NULL,
    scan_type        scan_type NOT NULL,                -- 'entry', 'exit', 'return'
    is_duplicate     BOOLEAN NOT NULL DEFAULT false,

    -- Context
    shipment_id      UUID REFERENCES shipments(id)  ON DELETE SET NULL,
    order_id         UUID REFERENCES orders(id)     ON DELETE SET NULL,
    shop_id          UUID REFERENCES shops(id)      ON DELETE SET NULL,
    scanned_by       UUID REFERENCES users(id)      ON DELETE SET NULL,
    device_id        TEXT,
    scan_location    TEXT,

    raw_payload      JSONB DEFAULT '{}',
    scanned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PARTIAL UNIQUE INDEX: only one effective (non-duplicate) scan per tracking + type
CREATE UNIQUE INDEX uq_scanner_effective_non_dup
    ON scanner_logs (tracking_number, scan_type)
    WHERE is_duplicate = false;

-- Supporting indexes
CREATE INDEX idx_scanner_logs_tracking     ON scanner_logs(tracking_number);
CREATE INDEX idx_scanner_logs_scanned_at   ON scanner_logs(scanned_at DESC);
CREATE INDEX idx_scanner_logs_order        ON scanner_logs(order_id);
CREATE INDEX idx_scanner_logs_shop         ON scanner_logs(shop_id);
CREATE INDEX idx_scanner_logs_duplicates   ON scanner_logs(is_duplicate) WHERE is_duplicate = true;
CREATE INDEX idx_scanner_tracking_type     ON scanner_logs(tracking_number, scan_type);

-- RLS for scanner role isolation
ALTER TABLE scanner_logs ENABLE ROW LEVEL SECURITY;

-- DUPLICATE DETECTION TRIGGER
-- Before insert: if a non-duplicate row already exists for this (tracking, scan_type),
-- mark the new row as is_duplicate = true. The partial unique index then allows the insert.
CREATE OR REPLACE FUNCTION trg_scanner_duplicate_check()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM scanner_logs
        WHERE tracking_number = NEW.tracking_number
          AND scan_type = NEW.scan_type
          AND is_duplicate = false
    ) THEN
        NEW.is_duplicate := true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_before_scanner_insert
    BEFORE INSERT ON scanner_logs
    FOR EACH ROW EXECUTE FUNCTION trg_scanner_duplicate_check();


-- =============================================================================
-- SECTION 8 — GOOGLE SHEETS FLEXIBLE COLUMN MAPPING
-- v1 had: sync_configs.field_mapping JSONB (opaque blob)
-- v2 adds: google_sync_map — relational column mapping table per config.
-- Both coexist. google_sync_map is the preferred path for new integrations.
-- The JSONB blob in sync_configs can be deprecated gradually.
-- =============================================================================

CREATE TABLE google_sync_map (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id       UUID NOT NULL REFERENCES sync_configs(id) ON DELETE CASCADE,

    -- DB side
    table_name      TEXT NOT NULL,          -- 'orders', 'products', 'expenses', etc.
    column_name     TEXT NOT NULL,          -- exact PostgreSQL column name

    -- Sheet side
    sheet_column    TEXT NOT NULL,          -- exact column header in the Google Sheet
    sheet_col_index INT,                    -- 0-based column index (optional, for perf)

    -- Transformation rules
    data_type       TEXT NOT NULL DEFAULT 'text',   -- 'text', 'numeric', 'boolean', 'date', 'uuid'
    transform_fn    TEXT,                           -- 'uppercase', 'trim', 'date_ma', etc.
    is_key          BOOLEAN NOT NULL DEFAULT false, -- match key for upsert (e.g. order_number)
    is_readonly     BOOLEAN NOT NULL DEFAULT false, -- DB → Sheet only, never written back

    -- Validation
    required        BOOLEAN NOT NULL DEFAULT false,
    default_value   TEXT,                           -- applied when sheet cell is empty on import

    display_order   INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (config_id, table_name, column_name),
    UNIQUE (config_id, sheet_column)
);

CREATE INDEX idx_google_sync_map_config ON google_sync_map(config_id);
CREATE INDEX idx_google_sync_map_table  ON google_sync_map(table_name);
CREATE INDEX idx_google_sync_map_col    ON google_sync_map(config_id, column_name);

CREATE TRIGGER trg_google_sync_map_updated_at
    BEFORE UPDATE ON google_sync_map
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- SECTION 9 — ADS HIERARCHY: CAMPAIGN → ADSET → AD
-- v1: orders.ad_campaign_id only.
-- v2: adds ad_adsets and ad_ads, links orders to all 3 levels.
-- Enables per-adset and per-ad ROAS, CPO, attribution analysis.
-- =============================================================================

-- [NEW] ad_adsets — ad sets within a campaign
CREATE TABLE ad_adsets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id     UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    external_id     TEXT,                              -- platform adset ID
    targeting       JSONB DEFAULT '{}',               -- audience targeting snapshot
    budget_daily    NUMERIC(10,2),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_adsets_campaign ON ad_adsets(campaign_id);
CREATE INDEX idx_ad_adsets_external ON ad_adsets(external_id);

-- [NEW] ad_ads — individual ads within an adset
CREATE TABLE ad_ads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    adset_id        UUID NOT NULL REFERENCES ad_adsets(id)    ON DELETE CASCADE,
    campaign_id     UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,  -- denorm for fast join
    name            TEXT NOT NULL,
    external_id     TEXT,
    format          TEXT,                             -- 'image', 'video', 'carousel', 'story'
    creative_url    TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_ads_adset    ON ad_ads(adset_id);
CREATE INDEX idx_ad_ads_campaign ON ad_ads(campaign_id);
CREATE INDEX idx_ad_ads_external ON ad_ads(external_id);

-- [MOD] orders — add adset_id and ad_id for full attribution chain
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS ad_adset_id UUID REFERENCES ad_adsets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ad_id       UUID REFERENCES ad_ads(id)    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_adset ON orders(ad_adset_id);
CREATE INDEX IF NOT EXISTS idx_orders_ad    ON orders(ad_id);

-- [MOD] ad_spend — add adset/ad granularity + level discriminator
ALTER TABLE ad_spend
    ADD COLUMN IF NOT EXISTS adset_id UUID REFERENCES ad_adsets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ad_id    UUID REFERENCES ad_ads(id)    ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS level    ad_level NOT NULL DEFAULT 'campaign';

-- Drop v1 unique constraint (campaign_id, spend_date) — too coarse for multi-level
ALTER TABLE ad_spend DROP CONSTRAINT IF EXISTS ad_spend_campaign_id_spend_date_key;

-- Replace with granular unique: one row per (campaign, adset, ad, date, level)
CREATE UNIQUE INDEX uq_ad_spend_granular
    ON ad_spend (
        campaign_id,
        COALESCE(adset_id, '00000000-0000-0000-0000-000000000000'::UUID),
        COALESCE(ad_id,    '00000000-0000-0000-0000-000000000000'::UUID),
        spend_date,
        level
    );

CREATE INDEX IF NOT EXISTS idx_ad_spend_adset ON ad_spend(adset_id);
CREATE INDEX IF NOT EXISTS idx_ad_spend_ad    ON ad_spend(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_spend_level ON ad_spend(level);

-- ROAS view — campaign level
CREATE OR REPLACE VIEW v_roas_by_campaign AS
SELECT
    c.id                            AS campaign_id,
    c.name                          AS campaign_name,
    c.platform,
    SUM(s.amount_mad)               AS total_spend_mad,
    COUNT(o.id)                     AS orders_attributed,
    SUM(o.total_amount)             AS revenue_attributed,
    CASE WHEN SUM(s.amount_mad) = 0 THEN NULL
         ELSE ROUND(SUM(o.total_amount) / SUM(s.amount_mad), 4)
    END                             AS roas,
    CASE WHEN COUNT(o.id) = 0 THEN NULL
         ELSE ROUND(SUM(s.amount_mad) / COUNT(o.id), 2)
    END                             AS cost_per_order
FROM ad_campaigns c
LEFT JOIN ad_spend  s ON s.campaign_id = c.id AND s.level = 'campaign'
LEFT JOIN orders    o ON o.ad_campaign_id = c.id
GROUP BY c.id, c.name, c.platform;

-- ROAS view — adset level
CREATE OR REPLACE VIEW v_roas_by_adset AS
SELECT
    ads.id                          AS adset_id,
    ads.name                        AS adset_name,
    c.name                          AS campaign_name,
    c.platform,
    SUM(sp.amount_mad)              AS total_spend_mad,
    COUNT(o.id)                     AS orders_attributed,
    SUM(o.total_amount)             AS revenue_attributed,
    CASE WHEN SUM(sp.amount_mad) = 0 THEN NULL
         ELSE ROUND(SUM(o.total_amount) / SUM(sp.amount_mad), 4)
    END                             AS roas
FROM ad_adsets ads
JOIN ad_campaigns c    ON c.id  = ads.campaign_id
LEFT JOIN ad_spend sp  ON sp.adset_id = ads.id AND sp.level = 'adset'
LEFT JOIN orders o     ON o.ad_adset_id = ads.id
GROUP BY ads.id, ads.name, c.name, c.platform;


-- =============================================================================
-- SECTION 10 — RLS ROLE EXPANSION
-- Expand existing RLS to 7-role model.
-- New helper functions added; existing current_user_role() replaced.
-- Existing policies remain — new policies added for new roles.
-- =============================================================================

-- [MOD] Replace current_user_role with current version
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
    SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- [NEW] user_has_role — variadic role check for cleaner policy expressions
CREATE OR REPLACE FUNCTION user_has_role(VARIADIC roles user_role[])
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
          AND role = ANY(roles)
    )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- [NEW] current_user_shop_id — returns the shop the user is assigned to
-- Stored in users.metadata->>'shop_id'. Null = unrestricted (admin/super_admin).
CREATE OR REPLACE FUNCTION current_user_shop_id()
RETURNS UUID AS $$
    SELECT (metadata->>'shop_id')::UUID
    FROM users
    WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- SCANNER AGENT policies
CREATE POLICY "scanner_insert_scans" ON scanner_logs
    FOR INSERT WITH CHECK (
        user_has_role('scanner_agent', 'admin', 'super_admin')
    );

CREATE POLICY "scanner_select_scans" ON scanner_logs
    FOR SELECT USING (
        user_has_role('scanner_agent', 'admin', 'super_admin', 'manager')
    );

CREATE POLICY "scanner_select_shipments" ON shipments
    FOR SELECT USING (
        user_has_role('scanner_agent', 'admin', 'super_admin', 'manager', 'call_center_agent')
    );

-- CALL CENTER AGENT policies
CREATE POLICY "cca_select_assigned_orders" ON orders
    FOR SELECT USING (
        user_has_role('call_center_agent') AND assigned_to = auth.uid()
    );

CREATE POLICY "cca_update_assigned_orders" ON orders
    FOR UPDATE USING (
        user_has_role('call_center_agent') AND assigned_to = auth.uid()
    );

CREATE POLICY "cca_own_call_logs" ON call_logs
    FOR ALL USING (
        user_has_role('call_center_agent') AND agent_id = auth.uid()
    );

CREATE POLICY "cca_select_customers" ON customers
    FOR SELECT USING (
        user_has_role('call_center_agent', 'admin', 'super_admin', 'manager')
    );

-- FINANCE policies
CREATE POLICY "finance_select_profit" ON daily_profit_snapshots
    FOR SELECT USING (
        user_has_role('finance', 'admin', 'super_admin', 'manager')
    );

CREATE POLICY "finance_select_expenses" ON expenses
    FOR SELECT USING (
        user_has_role('finance', 'admin', 'super_admin', 'manager')
    );

CREATE POLICY "finance_insert_expenses" ON expenses
    FOR INSERT WITH CHECK (
        user_has_role('finance', 'admin', 'super_admin')
    );

CREATE POLICY "finance_update_expenses" ON expenses
    FOR UPDATE USING (
        user_has_role('finance', 'admin', 'super_admin')
    );

-- VIEWER policies (read-only)
CREATE POLICY "viewer_select_orders" ON orders
    FOR SELECT USING (
        user_has_role('viewer', 'admin', 'super_admin', 'manager')
    );

CREATE POLICY "viewer_select_products" ON products
    FOR SELECT USING (
        user_has_role('viewer', 'call_center_agent', 'scanner_agent', 'admin', 'super_admin', 'manager')
    );

-- SUPER ADMIN — full access to all tables
CREATE POLICY "super_admin_orders"    ON orders    FOR ALL USING (user_has_role('super_admin'));
CREATE POLICY "super_admin_customers" ON customers FOR ALL USING (user_has_role('super_admin'));
CREATE POLICY "super_admin_expenses"  ON expenses  FOR ALL USING (user_has_role('super_admin'));
CREATE POLICY "super_admin_products"  ON products  FOR ALL USING (user_has_role('super_admin'));

-- MULTI-SHOP RLS TEMPLATE (activate when shop_id is populated)
-- Add to each policy:
--   AND (shop_id IS NULL OR shop_id = current_user_shop_id())
-- Example future policy for orders:
-- CREATE POLICY "shop_isolation_orders" ON orders
--     FOR ALL USING (
--         shop_id IS NULL OR shop_id = current_user_shop_id()
--         OR user_has_role('super_admin', 'admin')
--     );


-- =============================================================================
-- SECTION 11 — UPDATED_AT TRIGGERS FOR NEW TABLES
-- =============================================================================

CREATE TRIGGER trg_shops_updated_at
    BEFORE UPDATE ON shops
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ad_adsets_updated_at
    BEFORE UPDATE ON ad_adsets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ad_ads_updated_at
    BEFORE UPDATE ON ad_ads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- SECTION 12 — UPDATED AND NEW VIEWS
-- =============================================================================

-- [MOD] v_order_summary — DROP first because CREATE OR REPLACE cannot reorder
-- or insert columns before existing ones (PostgreSQL locks column positions).
-- Safe to drop: no other DB objects depend on this view.
DROP VIEW IF EXISTS v_order_summary;
CREATE VIEW v_order_summary AS
SELECT
    o.id,
    o.order_number,
    o.shop_id,
    sh.name                         AS shop_name,
    o.customer_name,
    o.customer_phone,
    o.customer_city,
    o.total_amount,
    o.amount_collected,
    o.status,
    o.payment_status,
    o.payment_method,

    -- Cost breakdown (estimated vs real)
    o.est_cogs_total,
    o.real_cogs_total,
    o.estimated_shipping_cost,
    o.real_shipping_cost,
    o.estimated_ads_cost,
    o.real_ads_cost,
    o.estimated_confirmation_cost,
    o.real_confirmation_cost,
    o.real_return_cost,

    -- Profit
    o.estimated_profit,
    o.real_profit,

    -- Delivery
    s.status                        AS shipment_status,
    s.tracking_number,
    c.name                          AS carrier_name,
    s.delivered_at,

    -- Ad attribution (full hierarchy)
    o.ad_campaign_id,
    ac.name                         AS campaign_name,
    ac.platform                     AS ad_platform,
    o.ad_adset_id,
    oas.name                        AS adset_name,
    o.ad_id,
    oa.name                         AS ad_name,

    o.source,
    o.created_at,
    o.confirmed_at
FROM orders       o
LEFT JOIN shops        sh  ON sh.id  = o.shop_id
LEFT JOIN shipments    s   ON s.order_id  = o.id
LEFT JOIN carriers     c   ON c.id   = s.carrier_id
LEFT JOIN ad_campaigns ac  ON ac.id  = o.ad_campaign_id
LEFT JOIN ad_adsets    oas ON oas.id = o.ad_adset_id
LEFT JOIN ad_ads       oa  ON oa.id  = o.ad_id;


-- [NEW] v_return_loss_summary — financial loss per return
CREATE OR REPLACE VIEW v_return_loss_summary AS
SELECT
    r.id                                AS return_id,
    r.return_number,
    r.order_id,
    r.shop_id,
    r.status,
    r.condition,
    SUM(ri.returned_qty)                AS total_returned,
    SUM(ri.good_qty)                    AS total_good,
    SUM(ri.damaged_qty)                 AS total_damaged,
    SUM(ri.missing_qty)                 AS total_missing,
    SUM(ri.restocked_qty)               AS total_restocked,
    SUM(ri.write_off_value)             AS total_write_off_mad,
    r.refund_amount,
    r.carrier_cost,
    r.restocking_fee,
    (r.refund_amount
        + r.carrier_cost
        + COALESCE(SUM(ri.write_off_value), 0)) AS total_loss_mad,
    r.created_at
FROM returns r
LEFT JOIN return_items ri ON ri.return_id = r.id
GROUP BY r.id, r.return_number, r.order_id, r.shop_id, r.status, r.condition,
         r.refund_amount, r.carrier_cost, r.restocking_fee, r.created_at;


-- [NEW] v_agent_performance — call center performance with confirmation rate
CREATE OR REPLACE VIEW v_agent_performance AS
SELECT
    u.id                            AS agent_id,
    u.full_name,
    u.role,
    s.stat_date,
    s.calls_made,
    s.calls_confirmed,
    s.calls_refused,
    s.calls_no_answer,
    s.orders_confirmed,
    s.revenue_confirmed,
    CASE WHEN s.calls_made = 0 THEN 0
         ELSE ROUND((s.calls_confirmed::NUMERIC / s.calls_made) * 100, 2)
    END                             AS confirmation_rate_pct,
    CASE WHEN s.orders_confirmed = 0 THEN NULL
         ELSE ROUND(s.revenue_confirmed / s.orders_confirmed, 2)
    END                             AS avg_order_value
FROM agent_daily_stats s
JOIN users u ON u.id = s.agent_id;


-- =============================================================================
-- SECTION 13 — HELPER FUNCTIONS
-- =============================================================================

-- Validate return_item quantities before stock movement
CREATE OR REPLACE FUNCTION validate_return_item_restock(p_return_item_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_ri return_items%ROWTYPE;
BEGIN
    SELECT * INTO v_ri FROM return_items WHERE id = p_return_item_id;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    RETURN (v_ri.restocked_qty <= v_ri.good_qty)
       AND (v_ri.restocked_qty + v_ri.damaged_qty + v_ri.missing_qty <= v_ri.returned_qty);
END;
$$ LANGUAGE plpgsql STABLE;


-- Compute estimated_profit for an order (call at order confirmation)
CREATE OR REPLACE FUNCTION compute_order_estimated_profit(p_order_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_order orders%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    RETURN (v_order.subtotal - v_order.discount_amount)
        - COALESCE(v_order.est_cogs_total,             0)
        - COALESCE(v_order.estimated_shipping_cost,    0)
        - COALESCE(v_order.estimated_ads_cost,         0)
        - COALESCE(v_order.estimated_confirmation_cost,0);
END;
$$ LANGUAGE plpgsql STABLE;


-- Compute real_profit for an order (call after delivery + payment confirmed)
CREATE OR REPLACE FUNCTION compute_order_real_profit(p_order_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_order orders%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    RETURN v_order.amount_collected
        - COALESCE(v_order.real_cogs_total,           0)
        - COALESCE(v_order.real_shipping_cost,         0)
        - COALESCE(v_order.real_ads_cost,              0)
        - COALESCE(v_order.real_confirmation_cost,     0)
        - COALESCE(v_order.real_return_cost,           0);
END;
$$ LANGUAGE plpgsql STABLE;


-- =============================================================================
-- END OF v2 MIGRATIONS
-- =============================================================================
-- Tables added   : shops, ad_adsets, ad_ads, scanner_logs, google_sync_map
-- Tables modified: orders, stock_locations, stock_movements, shipments,
--                  returns, expenses, return_items, order_profit_detail, ad_spend
-- Enums added    : scan_type, ad_level; user_role extended (+5 values)
-- Views added    : v_roas_by_campaign, v_roas_by_adset,
--                  v_return_loss_summary, v_agent_performance
-- Views modified : v_order_summary
-- Functions added: user_has_role, current_user_shop_id,
--                  validate_return_item_restock,
--                  compute_order_estimated_profit, compute_order_real_profit
-- RLS policies   : 16 new policies for 5 new role types
-- Indexes added  : 22 new indexes
-- Triggers added : scanner duplicate detection, updated_at for 3 new tables
-- =============================================================================

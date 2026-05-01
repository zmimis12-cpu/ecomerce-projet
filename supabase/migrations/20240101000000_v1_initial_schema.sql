-- =============================================================================
-- E-COMMERCE OPERATIONS SYSTEM — FULL DATABASE SCHEMA
-- Engine: PostgreSQL (Supabase-compatible, RLS-ready)
-- Author: Senior Backend Architect
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 0. ENUMERATIONS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'agent', 'warehouse', 'accountant', 'readonly');
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'partially_returned');
CREATE TYPE payment_status AS ENUM ('unpaid', 'paid', 'partial', 'refunded', 'chargeback');
CREATE TYPE payment_method AS ENUM ('cod', 'bank_transfer', 'credit_card', 'wallet', 'other');
CREATE TYPE shipment_status AS ENUM ('pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned_to_sender', 'lost');
CREATE TYPE return_condition AS ENUM ('good', 'damaged', 'missing_items', 'wrong_item', 'lost', 'refused_by_customer');
CREATE TYPE return_status AS ENUM ('requested', 'in_transit', 'received', 'inspected', 'restocked', 'written_off', 'refunded');
CREATE TYPE stock_movement_type AS ENUM ('purchase', 'sale', 'return_in', 'return_out', 'adjustment', 'transfer', 'damage', 'loss');
CREATE TYPE expense_category AS ENUM ('shipping', 'packaging', 'advertising', 'salaries', 'rent', 'utilities', 'software', 'returns_cost', 'customs', 'other');
CREATE TYPE ad_platform AS ENUM ('facebook', 'instagram', 'tiktok', 'google', 'snapchat', 'youtube', 'other');
CREATE TYPE call_disposition AS ENUM ('confirmed', 'no_answer', 'refused', 'callback', 'cancelled', 'wrong_number', 'duplicate', 'invalid');
CREATE TYPE sync_status AS ENUM ('success', 'partial', 'failed', 'pending');
CREATE TYPE location_type AS ENUM ('warehouse', 'shelf', 'bin', 'transit', 'external');


-- =============================================================================
-- 1. USERS & ACCESS CONTROL
-- =============================================================================

-- Internal system users (call center agents, managers, admins)
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE NOT NULL,
    full_name       TEXT NOT NULL,
    phone           TEXT,
    role            user_role NOT NULL DEFAULT 'agent',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    avatar_url      TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Teams / departments
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    description     TEXT,
    manager_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_members (
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);


-- =============================================================================
-- 2. SUPPLIERS & BRANDS
-- =============================================================================

CREATE TABLE suppliers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    country         TEXT,
    contact_name    TEXT,
    contact_email   TEXT,
    contact_phone   TEXT,
    website         TEXT,
    notes           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE brands (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    logo_url        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    parent_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
    slug            TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 3. PRODUCTS & COST STRUCTURE
-- =============================================================================

CREATE TABLE products (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku                     TEXT UNIQUE NOT NULL,
    reference               TEXT,                          -- internal/supplier ref
    name                    TEXT NOT NULL,
    description             TEXT,
    brand_id                UUID REFERENCES brands(id) ON DELETE SET NULL,
    category_id             UUID REFERENCES categories(id) ON DELETE SET NULL,
    supplier_id             UUID REFERENCES suppliers(id) ON DELETE SET NULL,

    -- Pricing
    purchase_price_usd      NUMERIC(12,4) NOT NULL DEFAULT 0,  -- FOB price
    freight_cost_usd        NUMERIC(12,4) NOT NULL DEFAULT 0,  -- per unit share of shipping
    customs_cost_usd        NUMERIC(12,4) NOT NULL DEFAULT 0,  -- per unit share of customs
    landing_cost_usd        NUMERIC(12,4) GENERATED ALWAYS AS (
                                purchase_price_usd + freight_cost_usd + customs_cost_usd
                            ) STORED,
    exchange_rate           NUMERIC(10,4) NOT NULL DEFAULT 1,  -- to MAD
    landing_cost_mad        NUMERIC(12,2) GENERATED ALWAYS AS (
                                (purchase_price_usd + freight_cost_usd + customs_cost_usd) * exchange_rate
                            ) STORED,
    selling_price           NUMERIC(12,2) NOT NULL DEFAULT 0,  -- final selling price MAD
    min_selling_price       NUMERIC(12,2),                     -- floor price
    
    -- Estimated margins
    estimated_gross_margin  NUMERIC(12,2) GENERATED ALWAYS AS (
                                selling_price - (purchase_price_usd + freight_cost_usd + customs_cost_usd) * exchange_rate
                            ) STORED,
    estimated_margin_pct    NUMERIC(6,2) GENERATED ALWAYS AS (
                                CASE WHEN selling_price = 0 THEN 0
                                ELSE ROUND(((selling_price - (purchase_price_usd + freight_cost_usd + customs_cost_usd) * exchange_rate) / selling_price) * 100, 2)
                                END
                            ) STORED,

    -- Physical attributes
    weight_kg               NUMERIC(8,3),
    dimensions_cm           JSONB,                         -- {l, w, h}
    image_urls              TEXT[] DEFAULT '{}',
    barcode                 TEXT,

    -- Flags
    is_active               BOOLEAN NOT NULL DEFAULT true,
    is_bundle               BOOLEAN NOT NULL DEFAULT false,
    track_stock             BOOLEAN NOT NULL DEFAULT true,

    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bundle composition (which products form a bundle)
CREATE TABLE product_bundles (
    bundle_id               UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_id            UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity                INT NOT NULL DEFAULT 1,
    PRIMARY KEY (bundle_id, component_id)
);

-- Product cost history (each purchase batch may have different cost)
CREATE TABLE product_cost_history (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id              UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    purchase_price_usd      NUMERIC(12,4) NOT NULL,
    freight_cost_usd        NUMERIC(12,4) NOT NULL DEFAULT 0,
    customs_cost_usd        NUMERIC(12,4) NOT NULL DEFAULT 0,
    exchange_rate           NUMERIC(10,4) NOT NULL,
    effective_date          DATE NOT NULL,
    batch_reference         TEXT,
    created_by              UUID REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 4. STOCK MANAGEMENT
-- =============================================================================

-- Physical locations (warehouses, shelves, bins)
CREATE TABLE stock_locations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    code            TEXT UNIQUE NOT NULL,
    type            location_type NOT NULL DEFAULT 'warehouse',
    parent_id       UUID REFERENCES stock_locations(id) ON DELETE SET NULL,
    address         TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Current stock levels per product per location
CREATE TABLE stock_levels (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id     UUID NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
    quantity        INT NOT NULL DEFAULT 0,
    reserved        INT NOT NULL DEFAULT 0,           -- reserved for open orders
    available       INT GENERATED ALWAYS AS (quantity - reserved) STORED,
    low_stock_alert INT DEFAULT 5,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, location_id),
    CONSTRAINT qty_non_negative CHECK (quantity >= 0),
    CONSTRAINT reserved_non_negative CHECK (reserved >= 0)
);

-- Every stock movement (full audit trail)
CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    from_location   UUID REFERENCES stock_locations(id),
    to_location     UUID REFERENCES stock_locations(id),
    movement_type   stock_movement_type NOT NULL,
    quantity        INT NOT NULL,
    unit_cost_mad   NUMERIC(12,2),                    -- cost at time of movement
    reference_type  TEXT,                             -- 'order', 'return', 'purchase', etc.
    reference_id    UUID,                             -- FK to the related record
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT qty_non_zero CHECK (quantity != 0)
);


-- =============================================================================
-- 5. CUSTOMERS
-- =============================================================================

CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name       TEXT NOT NULL,
    phone           TEXT,
    phone_alt       TEXT,
    email           TEXT,
    city            TEXT,
    region          TEXT,
    address         TEXT,
    zip_code        TEXT,
    country         TEXT NOT NULL DEFAULT 'MA',
    notes           TEXT,

    -- Computed stats (updated via triggers or materialized view)
    total_orders    INT NOT NULL DEFAULT 0,
    total_spent_mad NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_returns   INT NOT NULL DEFAULT 0,
    blacklisted     BOOLEAN NOT NULL DEFAULT false,
    blacklist_reason TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 6. ORDERS & ORDER ITEMS
-- =============================================================================

CREATE TABLE orders (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number            TEXT UNIQUE NOT NULL,          -- human-readable e.g. ORD-2024-00001
    customer_id             UUID REFERENCES customers(id) ON DELETE SET NULL,

    -- Captured snapshot of customer info at order time
    customer_name           TEXT NOT NULL,
    customer_phone          TEXT NOT NULL,
    customer_address        TEXT NOT NULL,
    customer_city           TEXT NOT NULL,
    customer_region         TEXT,
    customer_country        TEXT NOT NULL DEFAULT 'MA',

    -- Financials
    subtotal                NUMERIC(12,2) NOT NULL DEFAULT 0,  -- sum of items
    discount_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
    shipping_charge         NUMERIC(12,2) NOT NULL DEFAULT 0,  -- charged to customer
    total_amount            NUMERIC(12,2) GENERATED ALWAYS AS (
                                subtotal - discount_amount + shipping_charge
                            ) STORED,
    amount_collected        NUMERIC(12,2) NOT NULL DEFAULT 0,  -- actual cash collected (COD)
    
    -- Status
    status                  order_status NOT NULL DEFAULT 'pending',
    payment_status          payment_status NOT NULL DEFAULT 'unpaid',
    payment_method          payment_method NOT NULL DEFAULT 'cod',
    
    -- Source tracking
    source                  TEXT,                          -- 'facebook', 'tiktok', 'website', 'phone', etc.
    ad_campaign_id          UUID,                          -- FK set after table creation
    
    -- Internal
    assigned_to             UUID REFERENCES users(id),    -- call center agent
    confirmed_by            UUID REFERENCES users(id),
    confirmed_at            TIMESTAMPTZ,
    notes                   TEXT,
    internal_notes          TEXT,
    tags                    TEXT[] DEFAULT '{}',

    -- Profit tracking (computed when order is finalized)
    cogs_total              NUMERIC(12,2),                 -- total cost of goods sold
    shipping_cost_actual    NUMERIC(12,2),                 -- actual shipping cost paid
    estimated_profit        NUMERIC(12,2),
    real_profit             NUMERIC(12,2),                 -- updated after delivery + collection

    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id              UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

    -- Snapshot at time of order
    product_name            TEXT NOT NULL,
    product_sku             TEXT NOT NULL,
    unit_price              NUMERIC(12,2) NOT NULL,
    unit_cost_mad           NUMERIC(12,2) NOT NULL,        -- landing cost at time of order
    quantity                INT NOT NULL DEFAULT 1,
    discount_pct            NUMERIC(5,2) NOT NULL DEFAULT 0,
    
    line_total              NUMERIC(12,2) GENERATED ALWAYS AS (
                                unit_price * quantity * (1 - discount_pct / 100)
                            ) STORED,
    line_cogs               NUMERIC(12,2) GENERATED ALWAYS AS (
                                unit_cost_mad * quantity
                            ) STORED,
    line_gross_profit       NUMERIC(12,2) GENERATED ALWAYS AS (
                                (unit_price * quantity * (1 - discount_pct / 100)) - (unit_cost_mad * quantity)
                            ) STORED,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT qty_positive CHECK (quantity > 0)
);

-- Order status history for full audit trail
CREATE TABLE order_status_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status     order_status,
    to_status       order_status NOT NULL,
    changed_by      UUID REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 7. CALL CENTER
-- =============================================================================

CREATE TABLE call_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID REFERENCES orders(id) ON DELETE SET NULL,
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
    agent_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    phone_dialed        TEXT NOT NULL,
    call_direction      TEXT NOT NULL DEFAULT 'outbound',  -- 'inbound' | 'outbound'
    duration_seconds    INT,
    disposition         call_disposition NOT NULL,
    notes               TEXT,
    callback_at         TIMESTAMPTZ,                        -- if disposition = callback
    recording_url       TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent performance metrics (denormalized, updated daily via job)
CREATE TABLE agent_daily_stats (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stat_date       DATE NOT NULL,
    calls_made      INT NOT NULL DEFAULT 0,
    calls_confirmed INT NOT NULL DEFAULT 0,
    calls_refused   INT NOT NULL DEFAULT 0,
    calls_no_answer INT NOT NULL DEFAULT 0,
    avg_call_duration_sec INT,
    orders_confirmed INT NOT NULL DEFAULT 0,
    revenue_confirmed NUMERIC(12,2) NOT NULL DEFAULT 0,
    UNIQUE (agent_id, stat_date)
);


-- =============================================================================
-- 8. DELIVERY / SHIPMENTS
-- =============================================================================

CREATE TABLE carriers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,                         -- 'DIGYLOG', 'Amana', etc.
    code            TEXT UNIQUE NOT NULL,
    tracking_url    TEXT,                                  -- URL with {tracking_number} placeholder
    contact_email   TEXT,
    contact_phone   TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shipments (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    carrier_id              UUID NOT NULL REFERENCES carriers(id) ON DELETE RESTRICT,
    tracking_number         TEXT NOT NULL,
    status                  shipment_status NOT NULL DEFAULT 'pending',

    -- Cost
    shipping_cost_mad       NUMERIC(10,2) NOT NULL DEFAULT 0,  -- what we pay carrier
    cod_amount              NUMERIC(12,2),                     -- cash to collect on delivery

    -- Dates
    dispatched_at           TIMESTAMPTZ,
    estimated_delivery      DATE,
    delivered_at            TIMESTAMPTZ,
    last_event_at           TIMESTAMPTZ,

    -- Carrier raw data
    last_carrier_update     JSONB,

    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shipment_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id     UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status          TEXT NOT NULL,
    description     TEXT,
    location        TEXT,
    event_at        TIMESTAMPTZ NOT NULL,
    raw_payload     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 9. RETURNS
-- =============================================================================

CREATE TABLE returns (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_number           TEXT UNIQUE NOT NULL,
    order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    shipment_id             UUID REFERENCES shipments(id) ON DELETE SET NULL,
    initiated_by            UUID REFERENCES users(id),
    
    reason                  TEXT NOT NULL,
    condition               return_condition NOT NULL,
    status                  return_status NOT NULL DEFAULT 'requested',

    -- Financial impact
    refund_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
    restocking_fee          NUMERIC(12,2) NOT NULL DEFAULT 0,
    carrier_cost            NUMERIC(12,2) NOT NULL DEFAULT 0,  -- return shipping cost
    write_off_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,  -- if product unrecoverable

    received_at             TIMESTAMPTZ,
    inspected_at            TIMESTAMPTZ,
    inspected_by            UUID REFERENCES users(id),
    inspection_notes        TEXT,
    photos_urls             TEXT[] DEFAULT '{}',

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE return_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id       UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    order_item_id   UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity        INT NOT NULL DEFAULT 1,
    condition       return_condition NOT NULL,
    restocked       BOOLEAN NOT NULL DEFAULT false,
    restocked_to    UUID REFERENCES stock_locations(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT qty_positive CHECK (quantity > 0)
);


-- =============================================================================
-- 10. ADVERTISING & CAMPAIGNS
-- =============================================================================

CREATE TABLE ad_campaigns (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    platform        ad_platform NOT NULL,
    external_id     TEXT,                              -- platform campaign ID
    objective       TEXT,
    start_date      DATE,
    end_date        DATE,
    budget_daily    NUMERIC(10,2),
    budget_total    NUMERIC(10,2),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link orders to campaigns
ALTER TABLE orders ADD CONSTRAINT fk_orders_campaign
    FOREIGN KEY (ad_campaign_id) REFERENCES ad_campaigns(id) ON DELETE SET NULL;

CREATE TABLE ad_spend (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id     UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    spend_date      DATE NOT NULL,
    amount_mad      NUMERIC(10,2) NOT NULL DEFAULT 0,
    impressions     BIGINT,
    clicks          INT,
    leads           INT,
    cpc             NUMERIC(8,4),                     -- cost per click
    cpl             NUMERIC(8,4),                     -- cost per lead
    roas            NUMERIC(8,4),                     -- return on ad spend
    raw_data        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, spend_date)
);


-- =============================================================================
-- 11. EXPENSES
-- =============================================================================

CREATE TABLE expenses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category        expense_category NOT NULL,
    description     TEXT NOT NULL,
    amount_mad      NUMERIC(12,2) NOT NULL,
    expense_date    DATE NOT NULL,
    paid_by         UUID REFERENCES users(id),
    invoice_url     TEXT,
    reference       TEXT,
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 12. PROFIT TRACKING (DAILY SNAPSHOTS)
-- =============================================================================

-- Daily profit snapshot (generated by a scheduled job or trigger)
CREATE TABLE daily_profit_snapshots (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_date           DATE UNIQUE NOT NULL,

    -- Revenue
    gross_revenue           NUMERIC(14,2) NOT NULL DEFAULT 0,  -- total billed
    cash_collected          NUMERIC(14,2) NOT NULL DEFAULT 0,  -- COD actually received
    refunds_issued          NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_revenue             NUMERIC(14,2) GENERATED ALWAYS AS (
                                gross_revenue - refunds_issued
                            ) STORED,

    -- Costs
    cogs                    NUMERIC(14,2) NOT NULL DEFAULT 0,
    shipping_costs          NUMERIC(14,2) NOT NULL DEFAULT 0,
    ad_spend                NUMERIC(14,2) NOT NULL DEFAULT 0,
    return_costs            NUMERIC(14,2) NOT NULL DEFAULT 0,
    other_expenses          NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_costs             NUMERIC(14,2) GENERATED ALWAYS AS (
                                cogs + shipping_costs + ad_spend + return_costs + other_expenses
                            ) STORED,

    -- Profit
    estimated_profit        NUMERIC(14,2) GENERATED ALWAYS AS (
                                gross_revenue - (cogs + shipping_costs + ad_spend + return_costs + other_expenses)
                            ) STORED,
    real_profit             NUMERIC(14,2) GENERATED ALWAYS AS (
                                cash_collected - refunds_issued - (cogs + shipping_costs + ad_spend + return_costs + other_expenses)
                            ) STORED,

    -- KPIs
    orders_count            INT NOT NULL DEFAULT 0,
    delivered_count         INT NOT NULL DEFAULT 0,
    returned_count          INT NOT NULL DEFAULT 0,
    delivery_rate           NUMERIC(5,2),              -- %
    return_rate             NUMERIC(5,2),              -- %
    avg_order_value         NUMERIC(10,2),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-order profit detail view support (actual table for finalized orders)
CREATE TABLE order_profit_detail (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id                UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    selling_price_total     NUMERIC(12,2) NOT NULL,
    cogs_total              NUMERIC(12,2) NOT NULL,
    shipping_cost_paid      NUMERIC(12,2) NOT NULL DEFAULT 0,
    ad_spend_attributed     NUMERIC(12,2) NOT NULL DEFAULT 0,  -- portion of campaign spend
    return_cost             NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_cost              NUMERIC(12,2) NOT NULL DEFAULT 0,
    
    gross_profit            NUMERIC(12,2) GENERATED ALWAYS AS (
                                selling_price_total - cogs_total
                            ) STORED,
    net_profit              NUMERIC(12,2) GENERATED ALWAYS AS (
                                selling_price_total - cogs_total - shipping_cost_paid - ad_spend_attributed - return_cost - other_cost
                            ) STORED,
    net_margin_pct          NUMERIC(6,2) GENERATED ALWAYS AS (
                                CASE WHEN selling_price_total = 0 THEN 0
                                ELSE ROUND(((selling_price_total - cogs_total - shipping_cost_paid - ad_spend_attributed - return_cost - other_cost) / selling_price_total) * 100, 2)
                                END
                            ) STORED,

    calculated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 13. GOOGLE SHEETS SYNC LOGS
-- =============================================================================

CREATE TABLE sync_configs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    sheet_id        TEXT NOT NULL,                     -- Google Spreadsheet ID
    sheet_name      TEXT NOT NULL,                     -- Tab name
    direction       TEXT NOT NULL DEFAULT 'export',   -- 'import' | 'export' | 'bidirectional'
    entity_type     TEXT NOT NULL,                     -- 'orders', 'products', 'expenses', etc.
    field_mapping   JSONB NOT NULL DEFAULT '{}',       -- {sheet_col: db_col}
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sync_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id       UUID NOT NULL REFERENCES sync_configs(id) ON DELETE CASCADE,
    status          sync_status NOT NULL DEFAULT 'pending',
    direction       TEXT NOT NULL,
    rows_processed  INT NOT NULL DEFAULT 0,
    rows_success    INT NOT NULL DEFAULT 0,
    rows_failed     INT NOT NULL DEFAULT 0,
    errors          JSONB DEFAULT '[]',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    triggered_by    UUID REFERENCES users(id),
    notes           TEXT
);

CREATE TABLE sync_conflicts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_log_id     UUID NOT NULL REFERENCES sync_logs(id) ON DELETE CASCADE,
    entity_type     TEXT NOT NULL,
    entity_id       UUID,
    sheet_row       INT,
    conflict_type   TEXT,                              -- 'duplicate', 'missing_field', 'type_mismatch'
    sheet_value     TEXT,
    db_value        TEXT,
    resolved        BOOLEAN NOT NULL DEFAULT false,
    resolved_by     UUID REFERENCES users(id),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 14. AUDIT LOG (SYSTEM-WIDE)
-- =============================================================================

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,                     -- 'INSERT', 'UPDATE', 'DELETE'
    table_name      TEXT NOT NULL,
    record_id       UUID,
    old_data        JSONB,
    new_data        JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 15. UPDATED_AT TRIGGER (applied to all relevant tables)
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users','suppliers','brands','products','stock_levels',
        'customers','orders','shipments','returns','ad_campaigns',
        'expenses','daily_profit_snapshots','sync_configs'
    ]
    LOOP
        EXECUTE format('
            CREATE TRIGGER trg_%s_updated_at
            BEFORE UPDATE ON %s
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        ', t, t);
    END LOOP;
END;
$$;


-- =============================================================================
-- 16. INDEXES
-- =============================================================================

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Products
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_products_active ON products(is_active);

-- Stock
CREATE INDEX idx_stock_levels_product ON stock_levels(product_id);
CREATE INDEX idx_stock_levels_location ON stock_levels(location_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX idx_stock_movements_created ON stock_movements(created_at DESC);
CREATE INDEX idx_stock_movements_ref ON stock_movements(reference_type, reference_id);

-- Customers
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_city ON customers(city);
CREATE INDEX idx_customers_blacklisted ON customers(blacklisted);

-- Orders
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_assigned ON orders(assigned_to);
CREATE INDEX idx_orders_campaign ON orders(ad_campaign_id);
CREATE INDEX idx_orders_source ON orders(source);

-- Order Items
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- Call Logs
CREATE INDEX idx_call_logs_agent ON call_logs(agent_id);
CREATE INDEX idx_call_logs_order ON call_logs(order_id);
CREATE INDEX idx_call_logs_created ON call_logs(created_at DESC);
CREATE INDEX idx_call_logs_disposition ON call_logs(disposition);

-- Shipments
CREATE INDEX idx_shipments_order ON shipments(order_id);
CREATE INDEX idx_shipments_tracking ON shipments(tracking_number);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_carrier ON shipments(carrier_id);

-- Returns
CREATE INDEX idx_returns_order ON returns(order_id);
CREATE INDEX idx_returns_status ON returns(status);
CREATE INDEX idx_returns_condition ON returns(condition);

-- Ad Spend
CREATE INDEX idx_ad_spend_campaign ON ad_spend(campaign_id);
CREATE INDEX idx_ad_spend_date ON ad_spend(spend_date DESC);

-- Expenses
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);

-- Profit
CREATE INDEX idx_daily_profit_date ON daily_profit_snapshots(snapshot_date DESC);

-- Sync Logs
CREATE INDEX idx_sync_logs_config ON sync_logs(config_id);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);
CREATE INDEX idx_sync_logs_started ON sync_logs(started_at DESC);

-- Audit Logs
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_record ON audit_logs(record_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- Order Status History
CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);


-- =============================================================================
-- 17. ROW LEVEL SECURITY (RLS) — SUPABASE
-- =============================================================================

-- Enable RLS on all sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_profit_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
    SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- POLICY: Admins and managers see everything
-- POLICY: Agents see only their own orders/calls
-- POLICY: Warehouse sees stock only
-- POLICY: Accountant sees financial tables only
-- (Template — expand per business rules)

CREATE POLICY "admin_full_access_orders" ON orders
    FOR ALL USING (current_user_role() IN ('admin', 'manager'));

CREATE POLICY "agent_own_orders" ON orders
    FOR SELECT USING (
        current_user_role() = 'agent' AND assigned_to = auth.uid()
    );

CREATE POLICY "admin_full_access_products" ON products
    FOR ALL USING (current_user_role() IN ('admin', 'manager', 'warehouse'));

CREATE POLICY "readonly_products" ON products
    FOR SELECT USING (current_user_role() = 'agent');

CREATE POLICY "admin_expenses" ON expenses
    FOR ALL USING (current_user_role() IN ('admin', 'manager', 'accountant'));

CREATE POLICY "admin_profit" ON daily_profit_snapshots
    FOR ALL USING (current_user_role() IN ('admin', 'manager', 'accountant'));


-- =============================================================================
-- 18. USEFUL VIEWS
-- =============================================================================

-- Active stock across all locations
CREATE VIEW v_stock_summary AS
SELECT
    p.id AS product_id,
    p.sku,
    p.name,
    p.selling_price,
    p.landing_cost_mad,
    SUM(sl.quantity)  AS total_qty,
    SUM(sl.reserved)  AS total_reserved,
    SUM(sl.available) AS total_available
FROM products p
LEFT JOIN stock_levels sl ON sl.product_id = p.id
WHERE p.is_active = true AND p.track_stock = true
GROUP BY p.id, p.sku, p.name, p.selling_price, p.landing_cost_mad;

-- Order summary with delivery and payment status
CREATE VIEW v_order_summary AS
SELECT
    o.id,
    o.order_number,
    o.customer_name,
    o.customer_phone,
    o.customer_city,
    o.total_amount,
    o.amount_collected,
    o.status,
    o.payment_status,
    o.payment_method,
    s.status AS shipment_status,
    s.tracking_number,
    c.name AS carrier_name,
    o.estimated_profit,
    o.real_profit,
    o.created_at,
    o.confirmed_at
FROM orders o
LEFT JOIN shipments s ON s.order_id = o.id
LEFT JOIN carriers c ON c.id = s.carrier_id;

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================

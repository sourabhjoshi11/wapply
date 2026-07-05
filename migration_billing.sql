-- =============================================================================
-- WhatsApp Catalog Ordering Bot — Billing System Migration
-- Pay-as-you-cross + Razorpay autopay subscriptions
-- =============================================================================

-- ── Shops table additions ──────────────────────────────────────────────────

ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'basic';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS orders_this_month INTEGER DEFAULT 0;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS extra_orders_purchased INTEGER DEFAULT 0;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS billing_cycle_start DATE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS city TEXT;

-- ── Billing ledger table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('monthly_subscription', 'extra_order_batch')),
    amount NUMERIC(10,2) NOT NULL,
    orders_covered INTEGER,
    razorpay_payment_id TEXT,
    razorpay_order_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_billing_ledger_shop_id ON billing_ledger(shop_id);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_status ON billing_ledger(status);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_type ON billing_ledger(type);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_razorpay_order_id ON billing_ledger(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_created_at ON billing_ledger(created_at);

-- ── Row-Level Security ────────────────────────────────────────────────────

ALTER TABLE billing_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_ledger_service_role_policy
    ON billing_ledger
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

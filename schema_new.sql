-- =============================================================================
-- WhatsApp Catalog Ordering Bot - New Migration
-- New tables, columns, indexes, RLS policies, and triggers.
-- =============================================================================

-- ── ALTER EXISTING TABLES ──────────────────────────────────────────────────

ALTER TABLE shops ADD COLUMN IF NOT EXISTS api_key UUID UNIQUE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS default_language TEXT DEFAULT 'hi';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'ordering';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS gst_percentage NUMERIC DEFAULT 5.0;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS total_tables INTEGER DEFAULT 0;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS appointment_mode BOOLEAN DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS slot_duration INTEGER DEFAULT 30;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_name TEXT;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS preferred_language TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS table_number INTEGER;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'delivery';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customizations JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bill_sent BOOLEAN DEFAULT false;

-- ── 1. wallets ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
    balance NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── 2. wallet_transactions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    amount NUMERIC(10,2) NOT NULL,
    description TEXT,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. tables (dine-in) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    table_name TEXT,
    qr_code_url TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(shop_id, table_number)
);

CREATE TRIGGER update_tables_updated_at
    BEFORE UPDATE ON tables
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── 4. kitchen_orders ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kitchen_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    table_number INTEGER,
    items JSONB NOT NULL,
    customizations JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_kitchen_orders_updated_at
    BEFORE UPDATE ON kitchen_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── 5. staff (for appointments) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 6. staff_availability ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    slot_duration INTEGER NOT NULL DEFAULT 30,
    break_start TEXT,
    break_end TEXT
);

-- ── 7. appointments ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    customer_number TEXT NOT NULL,
    service_name TEXT NOT NULL,
    service_price NUMERIC(10,2),
    appointment_date DATE NOT NULL,
    time_slot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'booked',
    reminder_sent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 8. bookable_assets ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookable_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT,
    type TEXT CHECK (type IN ('turf', 'room', 'hall', 'venue')),
    capacity INTEGER,
    price_per_slot NUMERIC(10,2),
    slot_duration INTEGER,
    advance_percentage INTEGER NOT NULL DEFAULT 50,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 9. asset_bookings ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asset_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES bookable_assets(id) ON DELETE CASCADE,
    customer_number TEXT,
    customer_name TEXT,
    booking_date DATE,
    start_time TEXT,
    end_time TEXT,
    total_amount NUMERIC(10,2),
    advance_paid NUMERIC(10,2),
    payment_status TEXT NOT NULL DEFAULT 'pending',
    status TEXT NOT NULL DEFAULT 'booked',
    booking_code TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INDEXES ──────────────────────────────────────────────────────────────

-- wallets
CREATE INDEX IF NOT EXISTS idx_wallets_shop_id ON wallets(shop_id);

-- wallet_transactions
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_shop_id ON wallet_transactions(shop_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_order_id ON wallet_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);

-- tables
CREATE INDEX IF NOT EXISTS idx_tables_shop_id ON tables(shop_id);

-- kitchen_orders
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_shop_id ON kitchen_orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_order_id ON kitchen_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_status ON kitchen_orders(status);

-- staff
CREATE INDEX IF NOT EXISTS idx_staff_shop_id ON staff(shop_id);

-- staff_availability
CREATE INDEX IF NOT EXISTS idx_staff_availability_staff_id ON staff_availability(staff_id);

-- appointments
CREATE INDEX IF NOT EXISTS idx_appointments_shop_id ON appointments(shop_id);
CREATE INDEX IF NOT EXISTS idx_appointments_staff_id ON appointments(staff_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- bookable_assets
CREATE INDEX IF NOT EXISTS idx_bookable_assets_shop_id ON bookable_assets(shop_id);
CREATE INDEX IF NOT EXISTS idx_bookable_assets_type ON bookable_assets(type);

-- asset_bookings
CREATE INDEX IF NOT EXISTS idx_asset_bookings_shop_id ON asset_bookings(shop_id);
CREATE INDEX IF NOT EXISTS idx_asset_bookings_asset_id ON asset_bookings(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_bookings_booking_date ON asset_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_asset_bookings_status ON asset_bookings(status);
CREATE INDEX IF NOT EXISTS idx_asset_bookings_booking_code ON asset_bookings(booking_code);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────

-- Helper: enable RLS and allow service_role full access
DO $$
DECLARE
    tbl TEXT;
    tables_list TEXT[] := ARRAY[
        'wallets',
        'wallet_transactions',
        'tables',
        'kitchen_orders',
        'staff',
        'staff_availability',
        'appointments',
        'bookable_assets',
        'asset_bookings'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables_list
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format(
            'CREATE POLICY %I ON %I
             FOR ALL
             TO service_role
             USING (true)
             WITH CHECK (true);',
            tbl || '_service_role_policy',
            tbl
        );
    END LOOP;
END;
$$;

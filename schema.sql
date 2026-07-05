-- =============================================================================
-- WhatsApp Catalog Ordering Bot - Database Schema
-- Run this in your Supabase SQL Editor to create all required tables.
-- =============================================================================

-- ── Helper function for auto-updating `updated_at` columns ─────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Shops (tenants) ─────────────────────────────────────────────────────────

CREATE TABLE shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    whatsapp_number TEXT UNIQUE NOT NULL,
    owner_whatsapp_number TEXT NOT NULL,
    google_sheet_id TEXT,
    gateway_type TEXT DEFAULT 'cloud_api',
    active BOOLEAN DEFAULT true,
    access_token TEXT,
    phone_number_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Products ────────────────────────────────────────────────────────────────

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    category TEXT,
    image_url TEXT,
    available BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(shop_id, name)
);

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── Conversations (state machine per customer per shop) ────────────────────

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    customer_number TEXT NOT NULL,
    state TEXT DEFAULT 'GREETING',
    cart JSONB DEFAULT '{}',
    context JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(shop_id, customer_number)
);

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── Orders ──────────────────────────────────────────────────────────────────

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    customer_number TEXT NOT NULL,
    items JSONB NOT NULL,
    total NUMERIC(10,2) NOT NULL,
    address TEXT,
    payment_method TEXT,
    status TEXT DEFAULT 'PENDING',
    order_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── Indexes for performance ────────────────────────────────────────────────

CREATE INDEX idx_products_shop_id ON products(shop_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_conversations_shop_customer ON conversations(shop_id, customer_number);
CREATE INDEX idx_orders_shop_id ON orders(shop_id);
CREATE INDEX idx_orders_order_code ON orders(order_code);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- ── Onboarding Leads (form submissions from landing page) ──────────────────

CREATE TABLE onboarding_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_name TEXT NOT NULL,
    category TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_whatsapp TEXT NOT NULL,
    city TEXT NOT NULL,
    google_sheet TEXT,
    status TEXT DEFAULT 'new',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Seed data (example shop - update with your values) ─────────────────────
-- Uncomment and customize:

-- INSERT INTO shops (name, whatsapp_number, owner_whatsapp_number,
--                    google_sheet_id, access_token, phone_number_id)
-- VALUES ('Sharma Kirana', '15551234567', '15559876543',
--         'your_google_sheet_id_here', 'your_access_token_here', 'your_phone_number_id');

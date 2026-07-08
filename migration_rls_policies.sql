-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES — Wapply
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- NOTE: Shops are linked to Supabase Auth users via owner_email, NOT a
-- user_id column. RLS uses auth.email() to match, not auth.uid().
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Enable RLS on ALL tables ──────────────────────────────────────────

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_leads ENABLE ROW LEVEL SECURITY;

-- ── 2. Grant full access to service_role (backend uses this key) ────────

CREATE POLICY shops_service_policy ON shops
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY products_service_policy ON products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY orders_service_policy ON orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY conversations_service_policy ON conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY onboarding_leads_service_policy ON onboarding_leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. Authenticated users: orders (for real-time subscription) ────────

CREATE POLICY orders_authenticated_select ON orders
  FOR SELECT TO authenticated
  USING (shop_id IN (
    SELECT id FROM shops WHERE owner_email = auth.email()::text
  ));

-- ── 4. Authenticated users: shops (read own) ──────────────────────────

CREATE POLICY shops_authenticated_select ON shops
  FOR SELECT TO authenticated
  USING (owner_email = auth.email()::text);

-- ── 5. Authenticated users: products (read own shop's products) ───────

CREATE POLICY products_authenticated_select ON products
  FOR SELECT TO authenticated
  USING (shop_id IN (
    SELECT id FROM shops WHERE owner_email = auth.email()::text
  ));

-- ── 6. Authenticated users: conversations (read own) ──────────────────

CREATE POLICY conversations_authenticated_select ON conversations
  FOR SELECT TO authenticated
  USING (shop_id IN (
    SELECT id FROM shops WHERE owner_email = auth.email()::text
  ));

-- =============================================================================
-- Email OTP Auth Migration
-- Adds owner_email column for Supabase Auth shop lookup.
-- Run this in your Supabase SQL Editor.
-- =============================================================================

ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_email TEXT;

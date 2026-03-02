const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration from USER
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://knvjocbnnukioitbvbkg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_JYSndxo42XYOm8xkaYGDXA_sYkLaFAB';

/**
 * Singleton Pattern for Supabase Client
 */
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * DATABASE SCHEMA REFERENCE (FOR SQL EDITOR IN SUPABASE)
 * 
 * -- 1. USERS TABLE
 * CREATE TABLE users (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   username TEXT UNIQUE NOT NULL,
 *   password TEXT NOT NULL,
 *   trust_score INTEGER DEFAULT 0,
 *   total_earnings DECIMAL DEFAULT 0.00,
 *   pending_payout DECIMAL DEFAULT 0.00,
 *   upi TEXT DEFAULT '',
 *   metadata JSONB DEFAULT '{}',
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   history JSONB DEFAULT '{"clicks": [], "actions": []}'
 * );
 * 
 * -- 2. CLAIMS TABLE
 * CREATE TABLE claims (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 *   username TEXT,
 *   platform TEXT,
 *   order_id TEXT UNIQUE NOT NULL,
 *   amount DECIMAL NOT NULL,
 *   profit_amount DECIMAL DEFAULT 0.00,
 *   purchase_date DATE,
 *   proof_image TEXT,
 *   status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
 *   submitted_at TIMESTAMPTZ DEFAULT NOW(),
 *   processed_at TIMESTAMPTZ,
 *   reject_reason TEXT
 * );
 * 
 * -- 3. PAYOUTS TABLE
 * CREATE TABLE payouts (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 *   username TEXT,
 *   amount DECIMAL NOT NULL,
 *   upi TEXT,
 *   status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
 *   requested_at TIMESTAMPTZ DEFAULT NOW(),
 *   processed_at TIMESTAMPTZ,
 *   admin_note TEXT
 * );
 * 
 * -- 4. ACTIVITIES TABLE
 * CREATE TABLE activities (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 *   action TEXT,
 *   platform TEXT,
 *   link TEXT,
 *   timestamp TIMESTAMPTZ DEFAULT NOW()
 * );
 */

module.exports = {
    supabase
};

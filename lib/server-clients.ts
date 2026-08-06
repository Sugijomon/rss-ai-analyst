import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import type { Database } from '@/lib/database.types';

let anthropicClient: Anthropic | null = null;
let resendClient: Resend | null = null;
let supabaseClient: SupabaseClient<Database> | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error('Missing required environment variable: ' + name);
  }
  return value;
}

export function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: requireEnv('ANTHROPIC_API_KEY'),
    });
  }
  return anthropicClient;
}

export function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(requireEnv('RESEND_API_KEY'));
  }
  return resendClient;
}

export function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient<Database>(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_KEY')
    );
  }
  return supabaseClient;
}

export function getRequiredEnv(name: string): string {
  return requireEnv(name);
}

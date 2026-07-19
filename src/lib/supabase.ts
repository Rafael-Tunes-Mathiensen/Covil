import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { appConfig } from './config'

export const supabase: SupabaseClient | null = appConfig.isSupabaseConfigured
  ? createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

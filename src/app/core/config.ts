/**
 * Supabase project settings (Project Settings → API). The publishable key is public by design;
 * row level security in supabase/schema.sql protects the data.
 * Never put the database password, secret key or personal access token here.
 */
export const SUPABASE_URL = 'https://yypfwoviqsaijircsyxp.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_QaurW9Ruhj3Zuo03IXtK2A_qracBJ3R';

/** Deep link Supabase redirects back to after Google/Apple sign-in. Allowed under Auth → URL Configuration. */
export const AUTH_REDIRECT = 'auge://login-callback';

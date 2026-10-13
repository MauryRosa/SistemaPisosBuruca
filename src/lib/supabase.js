import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const clavePublica = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !clavePublica) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example como .env y complétalo.');
}

export const supabase = createClient(url, clavePublica, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Publishable anon key only. RLS blocks table reads; anon may execute dashboard_live(). */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://etdgcixvrjylxpkucxsd.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0ZGdjaXh2cmp5bHhwa3VjeHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MzQ5NzAsImV4cCI6MjEwNjUxMDk3MH0.hWr40tTTVidFgMyfH_eRbi6GECPZ72nSABM8YnJeC9I";

// Misma base de datos (Supabase) que usa Venezia One y landing-page-venezia-3.
// Este proyecto es independiente (no se mezcla con esos repos), pero comparte
// el mismo backend/CRM mediante Supabase, igual que ya opera landing-page-venezia-3.
// Credenciales públicas (anon/publishable key) — mismas que ya están expuestas
// hoy en el sitio en vivo de Venezia One (supabase.js), no son secretas.
(function initBecaVeneziaSupabase(globalScope) {
  const SUPABASE_URL = "https://cvcmvvfobuelmvobsvue.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_yUaiuhQG_TQKiuqFSGDF5A_Wc5L90zR";

  function createClient() {
    if (!globalScope.supabase || typeof globalScope.supabase.createClient !== "function") {
      return null;
    }
    return globalScope.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  globalScope.BecaVeneziaSupabase = {
    client: createClient(),
  };
})(window);

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

const supabaseUrl = "https://kfxfnqryfmuxiwlswyyn.supabase.co";
const supabasePublishableKey = "sb_publishable_3E2YsCPkTKaP2IiDIqQNrQ__OCnauzd";

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});

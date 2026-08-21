import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

const supabaseUrl = "https://uihwsndveblfgmlhdngi.supabase.co";
const supabasePublishableKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpaHdzbmR2ZWJsZmdtbGhkbmdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNzQyNjcsImV4cCI6MjA5Njk1MDI2N30.iUalXFUX0ipidGg0QbYFOlZWg7aZzVTZ8hDRjmJ9L0k";

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});

// Studio Hub — Supabase connection config.
// The anon key is safe to expose client-side; access is controlled by
// Row Level Security policies on the studio_hub schema (see supabase-schema.sql).
window.STUDIO_HUB_CONFIG = {
  supabaseUrl: 'https://pukzhmhevjbfwvhjzppr.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a3pobWhldmpiZnd2aGp6cHByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NjUzNTYsImV4cCI6MjA5MzM0MTM1Nn0.-Jl1tv-xeOTwv6cd-OgF-ovooLfYyzoaA2c7Seax3Zo',
  schema: 'studio_hub'
};

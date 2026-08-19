import "@testing-library/jest-dom";

// Provide dummy env vars so env.ts doesn't throw during tests
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

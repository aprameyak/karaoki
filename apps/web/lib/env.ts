import { z } from "zod";

const serverSchema = z.object({
  API_URL: z.url(),
});

export function apiUrl(): string {
  const parsed = serverSchema.safeParse({ API_URL: process.env.API_URL });
  if (!parsed.success) {
    throw new Error("API_URL is missing or not a valid URL");
  }
  return parsed.data.API_URL.replace(/\/$/, "");
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function supabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  return { url, anonKey };
}

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

function origin(value: string | undefined): string {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

const supabaseOrigin = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const analyticsOrigin = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN
  ? origin(process.env.NEXT_PUBLIC_ANALYTICS_SRC ?? "https://plausible.io/js/script.js")
  : "";
const development = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""} ${analyticsOrigin}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `media-src 'self' blob: ${supabaseOrigin}`.trim(),
  `connect-src 'self' ${supabaseOrigin} ${analyticsOrigin}${development ? " ws:" : ""}`.trim(),
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  ...(development ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@karaoki/shared"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/demo/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default config;

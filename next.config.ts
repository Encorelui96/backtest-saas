import type { NextConfig } from "next";

/**
 * Where the browser may connect: the site itself, and Binance's public price
 * feeds for the ticker and the Live page. Everything else is refused.
 */
const CONNECT = [
  "'self'",
  "https://data-api.binance.vision",
  "https://fapi.binance.com",
  "wss://data-stream.binance.vision",
  "wss://fstream.binance.com",
  ...(process.env.NEXT_PUBLIC_BINANCE_WS_URL ? [new URL(process.env.NEXT_PUBLIC_BINANCE_WS_URL).origin.replace(/^http/, "ws")] : []),
];

// Next.js inlines its start-up scripts, hence 'unsafe-inline'; `next dev` also needs eval.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${CONNECT.join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Browsers ignore it over plain HTTP, so local development is unaffected.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

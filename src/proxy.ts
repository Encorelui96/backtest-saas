import { NextResponse, type NextRequest } from "next/server";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

const hostOf = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
};

/** The addresses the site answers on: the one the request came to, and the public ones it is configured with. */
function siteHosts(req: NextRequest) {
  const hosts = new Set<string>();
  for (const h of [req.headers.get("x-forwarded-host"), req.headers.get("host")]) if (h) hosts.add(h.split(",")[0].trim());
  for (const url of [process.env.BETTER_AUTH_URL, process.env.RENDER_EXTERNAL_URL, process.env.SITE_URL]) {
    const h = hostOf(url);
    if (h) hosts.add(h);
  }
  return hosts;
}

/**
 * A request that changes something must come from the site's own pages: another site's form or script
 * can't use the visitor's session. Browsers send Origin on these requests; a script without a browser
 * sends none and has no session cookie to borrow. better-auth checks its own routes.
 */
export function proxy(req: NextRequest) {
  if (SAFE.has(req.method) || req.nextUrl.pathname.startsWith("/api/auth/")) return NextResponse.next();
  const origin = req.headers.get("origin");
  if (origin === null) return NextResponse.next();
  const host = hostOf(origin);
  if (host && siteHosts(req).has(host)) return NextResponse.next();
  return NextResponse.json({ error: "Requête refusée : elle ne vient pas de Backtest Lab." }, { status: 403 });
}

export const config = { matcher: "/api/:path*" };

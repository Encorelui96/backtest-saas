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
function checkOrigin(req: NextRequest) {
  if (SAFE.has(req.method) || req.nextUrl.pathname.startsWith("/api/auth/")) return NextResponse.next();
  const origin = req.headers.get("origin");
  if (origin === null) return NextResponse.next();
  const host = hostOf(origin);
  if (host && siteHosts(req).has(host)) return NextResponse.next();
  return NextResponse.json({ error: "Requête refusée : elle ne vient pas de Backtest Lab." }, { status: 403 });
}

/**
 * Pages live under app/[lang]. The French site keeps its addresses (/tarifs is served from /fr/tarifs);
 * the English one is under /en. /fr/… redirects to the address without it, so each page has one URL.
 */
function routeLanguage(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/en" || pathname.startsWith("/en/")) return NextResponse.next();
  if (pathname === "/fr" || pathname.startsWith("/fr/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }
  // A French address for someone who chose English, or a first visit from an English-speaking browser: the English page.
  const chosen = req.cookies.get("lang")?.value;
  const prefersEnglish = !chosen && pathname === "/" && /^en\b/i.test(req.headers.get("accept-language") ?? "");
  if (req.method === "GET" && (chosen === "en" || prefersEnglish)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? "/en" : `/en${pathname}`;
    return NextResponse.redirect(url, 307);
  }
  const url = req.nextUrl.clone();
  url.pathname = `/fr${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export function proxy(req: NextRequest) {
  return req.nextUrl.pathname.startsWith("/api/") ? checkOrigin(req) : routeLanguage(req);
}

export const config = {
  // Everything but Next.js's own files and the site's static files (icons, manifest, robots, sitemap).
  matcher: ["/api/:path*", "/((?!_next/|favicon\\.ico|icon-|apple-icon|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|opengraph-image|.*\\.(?:png|svg|jpg|ico|webmanifest|txt|xml)$).*)"],
};

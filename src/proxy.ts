import { NextResponse, type NextRequest } from "next/server";
import { isPhoneApp } from "@/lib/app-mode";
import { translatorOf } from "@/lib/server/lang";

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
  return NextResponse.json({ error: translatorOf(req)("Requête refusée : elle ne vient pas de Backtest Lab.") }, { status: 403 });
}

/** The address Render gives every service: it stays reachable, but it isn't the site's public one. */
const RENDER_HOST = ".onrender.com";

/**
 * Sends visitors of Render's address to the public one: sign-in only works there (better-auth refuses
 * other origins), and each page keeps one URL. Pages only: Render's health check goes to /api/me.
 */
function toPublicAddress(req: NextRequest) {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))?.split(",")[0].trim();
  const publicUrl = process.env.BETTER_AUTH_URL;
  const publicHost = hostOf(publicUrl);
  if (!host?.endsWith(RENDER_HOST) || !publicHost || publicHost.endsWith(RENDER_HOST)) return null;
  return NextResponse.redirect(new URL(`${req.nextUrl.pathname}${req.nextUrl.search}`, publicUrl), 308);
}

/** Pages the phone app doesn't show: they present the offers, which can't be bought from inside it. */
const WEB_ONLY_PAGES = ["/tarifs", "/questions"];

function keepOutOfApp(req: NextRequest) {
  if (!isPhoneApp(req.headers.get("user-agent"))) return null;
  const { pathname } = req.nextUrl;
  const english = pathname === "/en" || pathname.startsWith("/en/");
  const page = english ? pathname.slice(3) : pathname;
  if (!WEB_ONLY_PAGES.some((p) => page === p || page.startsWith(`${p}/`))) return null;
  const url = req.nextUrl.clone();
  url.pathname = english ? "/en" : "/";
  url.search = "";
  return NextResponse.redirect(url, 307);
}

/**
 * Pages live under app/[lang]. The French site keeps its addresses (/tarifs is served from /fr/tarifs);
 * the English one is under /en. /fr/… redirects to the address without it, so each page has one URL.
 */
function routeLanguage(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/en" || pathname.startsWith("/en/")) return NextResponse.next();
  // The share image only exists under /fr: without its prefix there is no page to send link previews to.
  if (pathname === "/fr/opengraph-image") return NextResponse.next();
  if (pathname === "/fr" || pathname.startsWith("/fr/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }
  // ?lang=fr on a link (such as "read the French version") switches language like the FR / EN buttons.
  const asked = req.nextUrl.searchParams.get("lang");
  if (asked === "fr" || asked === "en") {
    const url = req.nextUrl.clone();
    url.searchParams.delete("lang");
    if (asked === "en") url.pathname = pathname === "/" ? "/en" : `/en${pathname}`;
    const res = NextResponse.redirect(url, 307);
    res.cookies.set("lang", asked, { maxAge: 31_536_000, path: "/", sameSite: "lax" });
    return res;
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
  if (req.nextUrl.pathname.startsWith("/api/")) return checkOrigin(req);
  return toPublicAddress(req) ?? keepOutOfApp(req) ?? routeLanguage(req);
}

export const config = {
  // Everything but Next.js's own files and the site's static files (icons, manifest, robots, sitemap).
  matcher: ["/api/:path*", "/((?!_next/|favicon\\.ico|icon-|apple-icon|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|opengraph-image|.*\\.(?:png|svg|jpg|ico|webmanifest|txt|xml)$).*)"],
};

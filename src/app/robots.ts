import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Everyone, AI assistants included, may read the public pages; the app's private pages and API are off limits. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/compte", "/connexion", "/strategies/", "/backtests/", "/live"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

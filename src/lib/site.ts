/**
 * The site's public address, for absolute links: sitemap, robots.txt and link previews.
 * Set SITE_URL when the site moves to its own domain.
 */
export const SITE_URL = (process.env.SITE_URL ?? process.env.RENDER_EXTERNAL_URL ?? "https://backtest-lab-rnt9.onrender.com").replace(/\/$/, "");

export const SITE_NAME = "Backtest Lab";
export const SITE_TAGLINE = "Teste ta stratégie de trading avant d'y mettre ton argent";

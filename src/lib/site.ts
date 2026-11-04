/**
 * The site's public address, for absolute links: sitemap, robots.txt and link previews.
 * Set SITE_URL when the site moves to its own domain.
 */
export const SITE_URL = (process.env.SITE_URL ?? process.env.RENDER_EXTERNAL_URL ?? "https://backtest-lab-rnt9.onrender.com").replace(/\/$/, "");

export const SITE_NAME = "Backtest Lab";

/** The product's accounts, linked from the footer. */
export const SOCIAL_LINKS = [
  { href: "https://x.com/backtestlab1", label: "X" },
  { href: "https://www.instagram.com/backtestlab.fr", label: "Instagram" },
  { href: "https://www.tiktok.com/@backtestlab7", label: "TikTok" },
];

export const SITE_TAGLINE = "Avant de payer ton challenge, estime tes chances sur l'historique";

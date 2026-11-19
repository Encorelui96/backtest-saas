import type { BacktestEmail } from "./backtest-email";
import { localePath, translator, type Lang } from "./i18n";
import { PLANS } from "./plans";

/** The e-mail a new account gets once, when its address is confirmed. */

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BLUE = "#2f6fed";
const GREY = "#5b6472";
const LINE = "#e3e6ea";

/** Accounts older than this never get it: the e-mail is for new sign-ups, not for the accounts made before it existed. */
export const WELCOME_WINDOW_MS = 3 * 24 * 60 * 60_000;

/** Whether this account should get the welcome e-mail now (before the one-per-account claim in the database). */
export function welcomeDue(user: { emailVerified: boolean; createdAt: Date | string | number }, now = Date.now()): boolean {
  const created = new Date(user.createdAt).getTime();
  return user.emailVerified && Number.isFinite(created) && now - created <= WELCOME_WINDOW_MS;
}

/** The first word of the name, unless the name is an address or empty. */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || first.includes("@") || first.length > 30) return "";
  return first;
}

export function welcomeEmail({ lang, name, site }: { lang: Lang; name: string | null | undefined; site: string }): BacktestEmail {
  const t = translator(lang);
  const free = PLANS.free;
  const who = firstName(name);
  const title = who ? t("Bienvenue {0} !", [who]) : t("Bienvenue !");
  const intro = t("Ici, tu testes ta stratégie sur des années de cours, frais compris, avant d'y mettre ton argent.");
  const start = t("Pour bien démarrer :");
  const steps = [
    t("Décris ton idée en français : l'IA la traduit en règles."),
    t("Choisis ton marché (crypto, forex, or ou Nasdaq) et lance le test."),
    t("Regarde le verdict : rendement, baisse maximale et contrôles de robustesse."),
  ];
  const offer = t("Ton offre {0} comprend {1} backtests et {2} traductions par l'IA chaque mois, sans carte bancaire.", [t(free.label), free.backtestsPerMonth, free.aiPerMonth]);
  const button = t("Lancer mon premier backtest");
  const url = `${site}${localePath(lang, "/strategies/new")}`;
  const warning = t("Backtest Lab est un outil de simulation : les résultats passés ne garantissent pas les résultats futurs.");
  const why = t("Tu reçois cet e-mail une seule fois, parce que tu viens de créer ton compte.");

  const text = [title, "", intro, "", start, ...steps.map((s, i) => `${i + 1}. ${s}`), "", offer, "", `${button} : ${url}`, "", warning, why].join("\n");

  const html = `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#141821;font-size:15px;line-height:1.5;max-width:480px;margin:0 auto;padding:20px 16px">
<div style="font-size:18px;font-weight:700;margin-bottom:18px">Backtest<span style="color:${BLUE}">Lab</span></div>
<div style="font-size:20px;font-weight:700;line-height:1.3;margin-bottom:10px">${escapeHtml(title)}</div>
<p style="margin:0 0 14px">${escapeHtml(intro)}</p>
<p style="margin:0 0 6px;font-weight:600">${escapeHtml(start)}</p>
<ol style="margin:0 0 14px;padding-left:20px">${steps.map((s) => `<li style="margin-bottom:4px">${escapeHtml(s)}</li>`).join("")}</ol>
<p style="margin:0 0 18px">${escapeHtml(offer)}</p>
<a href="${escapeHtml(url)}" style="display:block;background:${BLUE};color:#ffffff;text-align:center;text-decoration:none;font-weight:600;padding:12px;border-radius:8px;margin-bottom:18px">${escapeHtml(button)}</a>
<div style="font-size:12px;color:${GREY};border-top:1px solid ${LINE};padding-top:12px;line-height:1.45">${escapeHtml(warning)}<br>${escapeHtml(why)}</div>
</div>`;

  return { subject: t("Bienvenue sur Backtest Lab"), text, html };
}

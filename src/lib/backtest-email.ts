import { localePath, localeTag, translator, type Lang, type T } from "./i18n";

/** What a long test sends at its end: the person has probably left the page. */

export interface BacktestEmail {
  subject: string;
  text: string;
  html: string;
}

interface Test {
  lang: Lang;
  name: string;
  symbol: string;
  interval: string;
  startDate: string;
  endDate: string;
  /** The site's address, without a final slash. */
  site: string;
}

interface Results {
  totalReturnPercent: number;
  trades: number;
  maxDrawdownPercent: number;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BLUE = "#2f6fed";
const RED = "#d13b3b";
const GREY = "#5b6472";
const LINE = "#e3e6ea";

function percent(x: number, lang: Lang) {
  const s = x.toLocaleString(localeTag(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${x > 0 ? "+" : ""}${s}${lang === "en" ? "%" : " %"}`;
}

function period({ lang, startDate, endDate }: Test, t: T) {
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(localeTag(lang), { dateStyle: "medium", timeZone: "UTC" });
  return t("Du {0} au {1}", [day(startDate), day(endDate)]);
}

function layout(test: Test, t: T, title: string, middle: string, button: { label: string; url: string }, footer: string) {
  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#141821;font-size:15px;line-height:1.5;max-width:480px;margin:0 auto;padding:20px 16px">
<div style="font-size:18px;font-weight:700;margin-bottom:18px">Backtest<span style="color:${BLUE}">Lab</span></div>
<div style="font-size:20px;font-weight:700;line-height:1.3;margin-bottom:6px">${escapeHtml(title)}</div>
<div style="color:${GREY};font-size:13px;margin-bottom:16px">${escapeHtml(test.name)} · ${escapeHtml(test.symbol)} ${escapeHtml(test.interval)}<br>${escapeHtml(period(test, t))}</div>
${middle}
<a href="${escapeHtml(button.url)}" style="display:block;background:${BLUE};color:#ffffff;text-align:center;text-decoration:none;font-weight:600;padding:12px;border-radius:8px;margin-bottom:18px">${escapeHtml(button.label)}</a>
<div style="font-size:12px;color:${GREY};border-top:1px solid ${LINE};padding-top:12px;line-height:1.45">${footer}</div>
</div>`;
}

const settingsUrl = ({ lang, site }: Test) => `${site}${localePath(lang, "/compte")}#emails`;

function settingsLine(test: Test, t: T) {
  return `${escapeHtml(t("Tu reçois cet e-mail car ton test a duré plus de 2 minutes."))} <a href="${escapeHtml(settingsUrl(test))}" style="color:${BLUE}">${escapeHtml(t("Désactiver ces e-mails"))}</a>`;
}

function settingsText(test: Test, t: T) {
  return `${t("Tu reçois cet e-mail car ton test a duré plus de 2 minutes.")} ${t("{0} : {1}", [t("Désactiver ces e-mails"), settingsUrl(test)])}`;
}

export function finishedEmail(test: Test, id: string, results: Results): BacktestEmail {
  const t = translator(test.lang);
  const url = `${test.site}${localePath(test.lang, `/backtests/${id}`)}`;
  const stats = [
    { label: t("Rendement"), value: percent(results.totalReturnPercent, test.lang), color: results.totalReturnPercent < 0 ? RED : "#141821" },
    { label: t("Trades"), value: String(results.trades), color: "#141821" },
    { label: t("Baisse max"), value: percent(-results.maxDrawdownPercent, test.lang), color: RED },
  ];
  const cells = stats
    .map(
      (s, i) =>
        `<td width="33%" style="padding:10px 6px;text-align:center;font-size:11px;color:${GREY}${i ? `;border-left:1px solid ${LINE}` : ""}"><div style="font-size:16px;font-weight:700;color:${s.color};white-space:nowrap">${escapeHtml(s.value)}</div>${escapeHtml(s.label)}</td>`,
    )
    .join("");
  const table = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${LINE};border-radius:10px;border-collapse:separate;margin-bottom:18px"><tr>${cells}</tr></table>`;
  const disclaimer = t("Résultat d'une simulation sur des données passées : il ne promet aucun gain futur et n'est pas un conseil en investissement.");
  return {
    subject: t("Ton backtest est terminé : {0}", [test.name]),
    text: [
      t("Ton backtest est terminé"),
      `${test.name} · ${test.symbol} ${test.interval}`,
      period(test, t),
      "",
      ...stats.map((s) => t("{0} : {1}", [s.label, s.value])),
      "",
      t("{0} : {1}", [t("Voir le résultat"), url]),
      "",
      disclaimer,
      settingsText(test, t),
    ].join("\n"),
    html: layout(test, t, t("Ton backtest est terminé"), table, { label: t("Voir le résultat"), url }, `${escapeHtml(disclaimer)}<br><br>${settingsLine(test, t)}`),
  };
}

/** `reason` is already in the test's language. */
export function failedEmail(test: Test, reason: string): BacktestEmail {
  const t = translator(test.lang);
  const url = `${test.site}${localePath(test.lang, "/strategies/new")}`;
  const notCounted = t("Ce test n'a pas été compté dans ton quota du mois.");
  return {
    subject: t("Ton backtest n'a pas pu aboutir : {0}", [test.name]),
    text: [
      t("Ton backtest n'a pas pu aboutir"),
      `${test.name} · ${test.symbol} ${test.interval}`,
      period(test, t),
      "",
      reason,
      notCounted,
      "",
      t("{0} : {1}", [t("Relancer un test"), url]),
      "",
      settingsText(test, t),
    ].join("\n"),
    html: layout(
      test,
      t,
      t("Ton backtest n'a pas pu aboutir"),
      `<p style="margin:0 0 18px">${escapeHtml(reason)} ${escapeHtml(notCounted)}</p>`,
      { label: t("Relancer un test"), url },
      settingsLine(test, t),
    ),
  };
}

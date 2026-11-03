import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { BacktestResults } from "@/components/backtest-results";
import { pct } from "@/lib/client/format";
import { sharedSummary } from "@/lib/server/shares";
import { pageLang } from "@/lib/i18n/page";

/** A shared report: its title and figures become the preview in Discord, X or a message. */
export async function generateMetadata({ params }: PageProps<"/[lang]/r/[id]">): Promise<Metadata> {
  const { t } = await pageLang(params);
  const s = await sharedSummary((await params).id);
  if (!s) return { title: t("Rapport introuvable · Backtest Lab"), robots: { index: false } };
  const title = `${s.name} · ${s.symbol} ${s.interval} : ${pct(s.summary.totalReturnPercent)}`;
  const description = t("{0} trades du {1} au {2}, baisse max {3}. Backtest réalisé avec Backtest Lab : teste ta propre stratégie gratuitement.", [
    s.summary.trades,
    s.startDate,
    s.endDate,
    pct(-s.summary.maxDrawdownPercent),
  ]);
  return {
    title: `${title} · Backtest Lab`,
    description,
    // Only the home page example goes into search engines; the others are for the people who get the link.
    robots: { index: s.featured, follow: true },
    openGraph: { title, description, type: "article", siteName: "Backtest Lab" },
    twitter: { card: "summary_large_image", title, description },
  };
}

async function Shared({ params }: { params: PageProps<"/[lang]/r/[id]">["params"] }) {
  const { id } = await params;
  return <BacktestResults id={id} shared />;
}

export default function SharedReportPage({ params }: PageProps<"/[lang]/r/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Shared params={params} />
    </Suspense>
  );
}

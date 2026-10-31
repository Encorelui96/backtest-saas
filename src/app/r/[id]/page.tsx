import type { Metadata } from "next";
import { Suspense } from "react";
import { BacktestResults } from "@/components/backtest-results";
import { pct } from "@/lib/client/format";
import { sharedSummary } from "@/lib/server/shares";

/** A shared report: its title and figures become the preview in Discord, X or a message. */
export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const s = await sharedSummary((await params).id);
  if (!s) return { title: "Rapport introuvable · Backtest Lab", robots: { index: false } };
  const title = `${s.name} · ${s.symbol} ${s.interval} : ${pct(s.summary.totalReturnPercent)}`;
  const description = `${s.summary.trades} trades du ${s.startDate} au ${s.endDate}, baisse max ${pct(-s.summary.maxDrawdownPercent)}. Backtest réalisé avec Backtest Lab : teste ta propre stratégie gratuitement.`;
  return {
    title: `${title} · Backtest Lab`,
    description,
    // Only the home page example goes into search engines; the others are for the people who get the link.
    robots: { index: s.featured, follow: true },
    openGraph: { title, description, type: "article", siteName: "Backtest Lab" },
    twitter: { card: "summary_large_image", title, description },
  };
}

async function Shared({ params }: { params: PageProps<"/r/[id]">["params"] }) {
  const { id } = await params;
  return <BacktestResults id={id} shared />;
}

export default function SharedReportPage({ params }: PageProps<"/r/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Chargement…</p>}>
      <Shared params={params} />
    </Suspense>
  );
}

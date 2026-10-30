"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { BacktestResults } from "@/components/backtest-results";

function Results() {
  const { id } = useParams<{ id: string }>();
  return <BacktestResults key={id} id={id} />;
}

export default function BacktestPage() {
  return (
    <Suspense fallback={<p className="text-muted">Chargement…</p>}>
      <Results />
    </Suspense>
  );
}

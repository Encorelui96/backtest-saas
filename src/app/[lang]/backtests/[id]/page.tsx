"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { BacktestResults } from "@/components/backtest-results";
import { RequireAuth } from "@/components/require-auth";

function Results() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <BacktestResults key={id} id={id} />
    </RequireAuth>
  );
}

export default function BacktestPage() {
  return (
    <Suspense fallback={<p className="text-muted">Chargement…</p>}>
      <Results />
    </Suspense>
  );
}

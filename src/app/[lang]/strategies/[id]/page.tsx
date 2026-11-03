"use client";

import { useT } from "@/lib/client/i18n";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { StrategyEditor } from "@/components/strategy-editor";
import { RequireAuth } from "@/components/require-auth";

function Editor() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <StrategyEditor key={id} id={id} />
    </RequireAuth>
  );
}

export default function EditStrategyPage() {
  const tl = useT();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{tl("Modifier la stratégie")}</h1>
      <Suspense fallback={<p className="text-muted">Chargement…</p>}>
        <Editor />
      </Suspense>
    </div>
  );
}

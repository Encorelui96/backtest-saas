import { Suspense } from "react";
import { StrategyEditor } from "@/components/strategy-editor";
import { RequireAuth } from "@/components/require-auth";

export default function NewStrategyPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nouvelle stratégie</h1>
      {/* The default test period depends on today's date, so the editor renders at request time. */}
      <Suspense fallback={<p className="text-muted">Chargement…</p>}>
        <RequireAuth>
          <StrategyEditor />
        </RequireAuth>
      </Suspense>
    </div>
  );
}

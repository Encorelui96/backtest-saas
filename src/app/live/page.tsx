import { Suspense } from "react";
import { LiveView } from "@/components/live-view";
import { RequireAuth } from "@/components/require-auth";

export default function LivePage() {
  return (
    <Suspense fallback={<p className="text-muted">Chargement…</p>}>
      <RequireAuth>
        <LiveView />
      </RequireAuth>
    </Suspense>
  );
}

import { Suspense } from "react";
import { LiveView } from "@/components/live-view";

export default function LivePage() {
  return (
    <Suspense fallback={<p className="text-muted">Chargement…</p>}>
      <LiveView />
    </Suspense>
  );
}

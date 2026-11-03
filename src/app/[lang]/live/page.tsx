import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { LiveView } from "@/components/live-view";
import { RequireAuth } from "@/components/require-auth";

export default function LivePage() {
  return (
    <Suspense fallback={<Loading />}>
      <RequireAuth>
        <LiveView />
      </RequireAuth>
    </Suspense>
  );
}

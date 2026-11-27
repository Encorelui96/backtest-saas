import { Suspense } from "react";
import { Journal } from "@/components/journal";
import { Loading } from "@/components/loading";
import { RequireAuth } from "@/components/require-auth";

export default function JournalPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RequireAuth>
        <Journal />
      </RequireAuth>
    </Suspense>
  );
}

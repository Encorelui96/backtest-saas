import { Suspense } from "react";
import { Journal, JournalFrame } from "@/components/journal";
import { Loading } from "@/components/loading";
import { RequireAuth } from "@/components/require-auth";

/** The trading journal, a space of its own: data-journal-space hides the site's bars and footer (globals.css). */
export default function JournalPage() {
  const waiting = (
    <JournalFrame>
      <Loading />
    </JournalFrame>
  );
  return (
    <div data-journal-space>
      <Suspense fallback={waiting}>
        <RequireAuth fallback={waiting}>
          <Journal />
        </RequireAuth>
      </Suspense>
    </div>
  );
}

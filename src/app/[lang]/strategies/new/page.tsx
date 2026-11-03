import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { StrategyEditor } from "@/components/strategy-editor";
import { RequireAuth } from "@/components/require-auth";
import { pageLang } from "@/lib/i18n/page";

export default async function NewStrategyPage({ params }: PageProps<"/[lang]/strategies/new">) {
  const { t } = await pageLang(params);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("Nouvelle stratégie")}</h1>
      {/* The default test period depends on today's date, so the editor renders at request time. */}
      <Suspense fallback={<Loading />}>
        <RequireAuth>
          <StrategyEditor />
        </RequireAuth>
      </Suspense>
    </div>
  );
}

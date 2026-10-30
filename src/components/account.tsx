"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { Button, Card } from "./ui";

interface Me {
  user: { email: string; name: string } | null;
  usage: {
    plan: { id: string; label: string; backtestsPerMonth: number; aiPerMonth: number; minInterval: string; alerts: number };
    backtests: number;
    ai: number;
    resetsAt: string;
  } | null;
}

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const share = Math.min(1, used / Math.max(1, max));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="num text-muted">
          {used} / {max}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-panel-2">
        <div className={`h-2 rounded-full ${share >= 1 ? "bg-down" : share > 0.8 ? "bg-warn" : "bg-accent"}`} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

export function Account() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then((m) => {
      if (!m.user) router.replace("/connexion?next=/compte");
      else setMe(m);
    });
  }, [router]);

  if (!me?.user || !me.usage) return <p className="text-muted">Chargement…</p>;
  const u = me.usage;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Mon compte</h1>
      <Card title={`Offre ${u.plan.label}`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{me.user.email}</p>
          <Meter label="Backtests ce mois-ci" used={u.backtests} max={u.plan.backtestsPerMonth} />
          <Meter label="Traductions par l'IA ce mois-ci" used={u.ai} max={u.plan.aiPerMonth} />
          <p className="text-xs text-muted">
            Unité de temps minimale : {u.plan.minInterval} · alertes : {u.plan.alerts} · compteurs remis à zéro le {new Date(u.resetsAt).toLocaleDateString("fr-FR")}.
          </p>
          {u.plan.id === "free" && <p className="text-sm">Les offres payantes (scalp en 1 minute, plus de tests, alertes Telegram) arrivent bientôt.</p>}
        </div>
      </Card>
      <Button
        variant="ghost"
        onClick={async () => {
          await authClient.signOut();
          window.location.href = "/";
        }}
      >
        Se déconnecter
      </Button>
    </div>
  );
}

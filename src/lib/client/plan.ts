"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { Plan } from "@/lib/plans";

/** The signed-in user's plan, null until it is known: nothing is locked meanwhile, and the server has the last word. */
export function usePlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    api<{ usage: { plan: Plan } | null }>("/api/me")
      .then((m) => setPlan(m.usage?.plan ?? null))
      .catch(() => {});
  }, []);
  return plan;
}

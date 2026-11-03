import { connection } from "next/server";
import { z } from "zod";
import { createAlert, listAlerts, telegramLinkOf } from "@/lib/server/alerts";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { planOf } from "@/lib/server/quotas";
import { botUsername, telegramEnabled } from "@/lib/server/telegram";

/** The account's Telegram link and alerts, with the plan's limit. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const [plan, link, alerts] = await Promise.all([planOf(user), telegramLinkOf(user.id), listAlerts(user.id)]);
    const enabled = telegramEnabled();
    return Response.json({
      telegram: {
        enabled,
        bot: enabled ? await botUsername().catch(() => null) : null,
        linked: Boolean(link),
        username: link?.username ?? null,
      },
      limit: plan.alerts,
      minInterval: plan.minInterval,
      plan: plan.label,
      alerts,
    });
  });
}

const Body = z.object({ strategyId: z.string().min(1).max(64) });

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    const { strategyId } = Body.parse(await req.json());
    return Response.json({ alerts: await createAlert(user, strategyId) });
  });
}

import { connection } from "next/server";
import { aiEnabled } from "@/lib/server/ai";
import { TEMPLATES } from "@/lib/strategy/templates";
import { PROP_PRESETS } from "@/lib/engine/propfirm";
import { translatorOf } from "@/lib/server/lang";

export async function GET(req: Request) {
  await connection();
  const t = translatorOf(req);
  const templates = TEMPLATES.map((x) => ({
    ...x,
    label: t(x.label),
    prompt: t(x.prompt),
    strategy: { ...x.strategy, name: t(x.strategy.name), description: t(x.strategy.description) },
  }));
  return Response.json({ aiEnabled: aiEnabled(), templates, propPresets: PROP_PRESETS });
}

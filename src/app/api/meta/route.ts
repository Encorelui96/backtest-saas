import { connection } from "next/server";
import { aiEnabled } from "@/lib/server/ai";
import { TEMPLATES } from "@/lib/strategy/templates";
import { PROP_PRESETS } from "@/lib/engine/propfirm";

export async function GET() {
  await connection();
  return Response.json({ aiEnabled: aiEnabled(), templates: TEMPLATES, propPresets: PROP_PRESETS });
}

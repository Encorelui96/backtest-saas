import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { UserError } from "./backtests";
import { AuthError } from "./auth";
import { QuotaError } from "./quotas";
import { TelegramError } from "./telegram";
import { translate } from "@/lib/i18n";
import { requestLang } from "./lang";

/**
 * Turns thrown errors into JSON responses with a message the UI can show as is.
 * Answers belong to the signed-in user, or to a link its author can withdraw: no cache keeps them unless the route says so.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  const res = await settle(fn);
  if (!res.headers.has("Cache-Control")) {
    try {
      res.headers.set("Cache-Control", "private, no-store");
    } catch {
      // A response passed through from elsewhere can have read-only headers.
    }
  }
  return res;
}

async function settle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    // Next.js signals (e.g. "this route is dynamic" during prerendering) must pass through.
    unstable_rethrow(e);
    const lang = await requestLang();
    const t = (fr: string, values?: readonly unknown[]) => translate(lang, fr, values);
    if (e instanceof AuthError) return Response.json({ error: t(e.message), auth: true }, { status: 401 });
    if (e instanceof QuotaError) return Response.json({ error: e.in(lang), quota: true, recharge: e.recharge ?? null }, { status: 429 });
    if (e instanceof UserError) return Response.json({ error: e.in(lang) }, { status: 400 });
    if (e instanceof TelegramError) {
      console.error(e.message);
      return Response.json({ error: t("Telegram ne répond pas pour l'instant : réessaie dans un moment.") }, { status: 502 });
    }
    if (e instanceof ZodError) {
      return Response.json({ error: t("Données invalides : ") + e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ") }, { status: 400 });
    }
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: t("Clé API Anthropic invalide.") }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: t("Trop de demandes à l'IA, réessaie dans une minute.") }, { status: 429 });
    // The details stay in the server logs; the browser only gets a generic message.
    const ref = crypto.randomUUID().slice(0, 8);
    console.error(`[${ref}]`, e);
    if (e instanceof Anthropic.APIError) return Response.json({ error: t("Erreur de l'IA (réf. {0}). Réessaie dans un instant.", [ref]) }, { status: 502 });
    return Response.json({ error: t("Erreur interne (réf. {0}). Réessaie dans un instant.", [ref]) }, { status: 500 });
  }
}

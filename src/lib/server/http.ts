import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { UserError } from "./backtests";
import { AuthError } from "./auth";
import { QuotaError } from "./quotas";

/** Turns thrown errors into JSON responses with a message the UI can show as is. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    // Next.js signals (e.g. "this route is dynamic" during prerendering) must pass through.
    unstable_rethrow(e);
    if (e instanceof AuthError) return Response.json({ error: e.message, auth: true }, { status: 401 });
    if (e instanceof QuotaError) return Response.json({ error: e.message, quota: true }, { status: 429 });
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof ZodError) {
      return Response.json({ error: "Données invalides : " + e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ") }, { status: 400 });
    }
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "Clé API Anthropic invalide." }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Trop de demandes à l'IA, réessaie dans une minute." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: `Erreur de l'IA (${e.status}) : ${e.message}` }, { status: 502 });
    // The details stay in the server logs; the browser only gets a generic message.
    const ref = crypto.randomUUID().slice(0, 8);
    console.error(`[${ref}]`, e);
    return Response.json({ error: `Erreur interne (réf. ${ref}). Réessaie dans un instant.` }, { status: 500 });
  }
}

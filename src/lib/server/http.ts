import "server-only";
import { ZodError } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { UserError } from "./backtests";

/** Turns thrown errors into JSON responses with a message the UI can show as is. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof ZodError) {
      return Response.json({ error: "Données invalides : " + e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ") }, { status: 400 });
    }
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "Clé API Anthropic invalide." }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Trop de demandes à l'IA, réessaie dans une minute." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: `Erreur de l'IA (${e.status}) : ${e.message}` }, { status: 502 });
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, { status: 500 });
  }
}

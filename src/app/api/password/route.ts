import { z } from "zod";
import { auth, hasPassword, requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { UserError } from "@/lib/server/backtests";

const Body = z.object({ password: z.string().min(8, "8 caractères minimum.").max(128) });

/**
 * Gives a password to an account that has none (made with the e-mail link or
 * Google). Changing an existing password goes through better-auth's own
 * route, which asks for the current one.
 */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser(req.headers);
    const { password } = Body.parse(await req.json());
    if (await hasPassword(req.headers)) throw new UserError("Ce compte a déjà un mot de passe : utilise « Changer de mot de passe ».");
    await auth.api.setPassword({ body: { newPassword: password }, headers: req.headers });
    return Response.json({ ok: true });
  });
}

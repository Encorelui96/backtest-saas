import { createLinkUrl, unlinkUser } from "@/lib/server/alerts";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { langOf } from "@/lib/server/lang";
import { limitPerMinute } from "@/lib/server/rate-limit";

/** A one-time t.me link that binds the chat to this account when the user presses Start. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitPerMinute(user.id, "telegram-link", 5);
    return Response.json({ url: await createLinkUrl(user.id, langOf(req)) });
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    await unlinkUser(user.id);
    return Response.json({ ok: true });
  });
}

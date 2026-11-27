import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { TradeInput, createTrade, limitJournal } from "@/lib/server/journal";

/** Opens a trade, or files one already closed when the form sends its exit too. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    return Response.json(await createTrade(user.id, TradeInput.parse(await req.json())));
  });
}

import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { TradeInput, importTrades, limitJournal } from "@/lib/server/journal";
import { IMPORT_BATCH } from "@/lib/journal-import";

const Body = z.object({ trades: z.array(TradeInput).min(1).max(IMPORT_BATCH) });

/** Files a batch of trades read from an outside journal (CSV, Excel, MetaTrader report): the file itself stays in the browser. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    const { trades } = Body.parse(await req.json());
    return Response.json(await importTrades(user.id, trades));
  });
}

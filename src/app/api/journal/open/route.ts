import { connection } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { openTrades } from "@/lib/server/journal";

/** How many trades are still open: the badge on the Journal tab. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    return Response.json({ open: await openTrades(user.id) });
  });
}

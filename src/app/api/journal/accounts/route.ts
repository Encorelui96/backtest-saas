import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { AccountInput, createAccount, limitJournal } from "@/lib/server/journal";

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    return Response.json(await createAccount(user, AccountInput.parse(await req.json())));
  });
}

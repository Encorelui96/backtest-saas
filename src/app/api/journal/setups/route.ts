import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { SetupInput, createSetup, limitJournal } from "@/lib/server/journal";

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    return Response.json(await createSetup(user.id, SetupInput.parse(await req.json())));
  });
}

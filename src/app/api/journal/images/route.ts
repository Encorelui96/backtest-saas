import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { limitJournal } from "@/lib/server/journal";
import { ImageInput, addImage, imageUsage } from "@/lib/server/journal-media";

/** Keeps a chart image with a trade or a day's note. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    const id = await addImage(user, ImageInput.parse(await req.json()));
    return Response.json({ id, images: await imageUsage(user) });
  });
}

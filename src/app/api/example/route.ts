import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { limitVisitor } from "@/lib/server/rate-limit";
import { featuredShareId } from "@/lib/server/shares";

/** The shared report the home page offers as an example, if the admin picked one. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    limitVisitor(req.headers, "example", 120);
    return Response.json({ id: await featuredShareId() });
  });
}

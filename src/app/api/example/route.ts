import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { featuredShareId } from "@/lib/server/shares";

/** The shared report the home page offers as an example, if the admin picked one. */
export async function GET() {
  await connection();
  return handle(async () => Response.json({ id: await featuredShareId() }));
}

import { z } from "zod";
import { deleteAlert, listAlerts, setAlertEnabled } from "@/lib/server/alerts";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

const Body = z.object({ enabled: z.boolean() });

export async function PATCH(req: Request, ctx: RouteContext<"/api/alerts/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    const { enabled } = Body.parse(await req.json());
    await setAlertEnabled(user.id, (await ctx.params).id, enabled);
    return Response.json({ alerts: await listAlerts(user.id) });
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/alerts/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    await deleteAlert(user.id, (await ctx.params).id);
    return Response.json({ alerts: await listAlerts(user.id) });
  });
}

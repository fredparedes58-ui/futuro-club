/**
 * VITAS · Notifications Router
 */
import { errorResponse } from "../lib/apiResponse";
import subscribe from "./_subscribe";
import cron from "./_cron";

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "subscribe": subscribe,
  "cron": cron,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Notification route "${action}" not found`, 404);
  return fn(req);
}

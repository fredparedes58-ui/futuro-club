/**
 * VITAS · Notifications Router
 */
import { errorResponse } from "../_lib/apiResponse";
import subscribe from "./_subscribe";
import cron from "./_cron";
import preferences from "./_preferences";
import history from "./_history";

const routes: Record<string, (req: Request) => Promise<Response>> = {
  subscribe,
  cron,
  preferences,
  history,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Notification route "${action}" not found`, 404);
  return fn(req);
}

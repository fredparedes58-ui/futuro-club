/**
 * VITAS · Team Router
 */
import { errorResponse } from "../lib/apiResponse";
import invite from "./_invite";
import accept from "./_accept";

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "invite": invite,
  "accept": accept,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Team route "${action}" not found`, 404);
  return fn(req);
}

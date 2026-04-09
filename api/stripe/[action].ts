/**
 * VITAS · Stripe Router
 * Consolidates 3 Stripe endpoints into one Vercel function.
 */
import { errorResponse } from "../lib/apiResponse";

import checkout from "./_checkout";
import portal from "./_portal";
import webhook from "./_webhook";

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "checkout": checkout,
  "portal": portal,
  "webhook": webhook,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Stripe route "${action}" not found`, 404);
  return fn(req);
}

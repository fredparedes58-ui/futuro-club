/**
 * VITAS · Team Router
 */
import { errorResponse } from "../_lib/apiResponse";
import invite from "./_invite";
import accept from "./_accept";
import updateRole from "./_update-role";
import requestAccess from "./_request";
import decide from "./_decide";
import joinCode from "./_join-code";

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "invite": invite,
  "accept": accept,
  "update-role": updateRole,
  "request-access": requestAccess,
  "decide-request": decide,
  "join-code": joinCode,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Team route "${action}" not found`, 404);
  return fn(req);
}

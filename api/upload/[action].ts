/**
 * VITAS · Upload Router
 * Routes /api/upload/{action} to the correct handler.
 */
import { errorResponse } from "../_lib/apiResponse";

import image from "./_image";
import videoInit from "./_video-init";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "image": image,
  "video-init": videoInit,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Upload action "${action}" not found`, 404);
  return fn(req);
}

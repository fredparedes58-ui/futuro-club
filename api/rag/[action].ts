/**
 * VITAS · RAG Router
 * Consolidates 6 RAG endpoints into one Vercel function.
 */
import { errorResponse } from "../_lib/apiResponse";

import query from "./_query";
import embed from "./_embed";
import ingest from "./_ingest";
import feedback from "./_feedback";
import seed from "./_seed";
import seedKnowledge from "./_seed-knowledge";
import backfillEmbeddings from "./_backfill-embeddings";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "query": query,
  "embed": embed,
  "ingest": ingest,
  "feedback": feedback,
  "seed": seed,
  "seed-knowledge": seedKnowledge,
  "backfill-embeddings": backfillEmbeddings,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`RAG route "${action}" not found`, 404);
  return fn(req);
}

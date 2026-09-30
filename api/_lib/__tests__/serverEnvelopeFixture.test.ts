/**
 * Pins the UI test fixture src/test/fixtures/serverEnvelope.ts to the REAL
 * `errorResponse` (api/_lib/apiResponse.ts): the match-job UI tests (polling stops
 * on 404 job_not_found / 401 UNAUTHORIZED …) use that mirror, so it must produce
 * exactly the same status and body as the server, or those tests prove nothing.
 */
import { describe, expect, it } from "vitest";
import { errorResponse } from "../apiResponse";
import { REAL_SERVER_ERRORS, serverErrorResponse } from "../../../src/test/fixtures/serverEnvelope";

describe("src/test/fixtures/serverEnvelope mirrors errorResponse", () => {
  for (const [name, e] of Object.entries(REAL_SERVER_ERRORS)) {
    it(`${name}: same status and body (object form)`, async () => {
      const real = errorResponse({ message: e.message, status: e.status, code: e.code });
      const mirror = serverErrorResponse(e);
      expect(mirror.status).toBe(real.status);
      expect(await mirror.json()).toEqual(await real.json());
    });

    it(`${name}: same body as the positional form withHandler uses`, async () => {
      const real = errorResponse(e.message, e.status, e.code);
      expect(await serverErrorResponse(e).json()).toEqual(await real.json());
    });
  }

  it("keeps structured details next to message and code", async () => {
    const opts = { message: "Vídeo demasiado largo", status: 422, code: "video_too_long", details: { durationSec: 7200 } };
    expect(await serverErrorResponse(opts).json()).toEqual(await errorResponse(opts).json());
  });
});

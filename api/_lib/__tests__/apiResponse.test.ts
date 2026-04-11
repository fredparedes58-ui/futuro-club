/**
 * Tests for apiResponse — standardized API response helpers
 */
import { describe, it, expect } from "vitest";
import { successResponse, errorResponse, corsPreflightResponse } from "../apiResponse";

describe("successResponse", () => {
  it("returns 200 with ok:true and data", async () => {
    const res = successResponse({ foo: "bar" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ foo: "bar" });
  });

  it("accepts custom status code", async () => {
    const res = successResponse({ id: 1 }, 201);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("includes CORS headers", () => {
    const res = successResponse({});
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("merges extra headers", () => {
    const res = successResponse({}, 200, { "X-Custom": "test" });
    expect(res.headers.get("X-Custom")).toBe("test");
  });
});

describe("errorResponse", () => {
  it("returns 400 with ok:false and error message", async () => {
    const res = errorResponse("Bad input");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Bad input");
  });

  it("includes error code in errorDetail", async () => {
    const res = errorResponse("Not found", 404, "NOT_FOUND");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.errorDetail.code).toBe("NOT_FOUND");
    expect(body.errorDetail.message).toBe("Not found");
  });

  it("accepts custom status and extra headers", async () => {
    const res = errorResponse("Rate limited", 429, "RATE_LIMITED", {
      "X-RateLimit-Remaining": "0",
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("includes CORS headers on errors", () => {
    const res = errorResponse("fail", 500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
  });
});

describe("corsPreflightResponse", () => {
  it("returns 204 with CORS headers", () => {
    const res = corsPreflightResponse();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("has no body", async () => {
    const res = corsPreflightResponse();
    const text = await res.text();
    expect(text).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/origin";

function headers(values: Record<string, string>) {
  return new Headers(values);
}

describe("isSameOriginRequest", () => {
  it("always allows safe methods", () => {
    expect(isSameOriginRequest("GET", headers({ origin: "https://evil.example", host: "karaoki.test" }))).toBe(true);
    expect(isSameOriginRequest("head", headers({ "sec-fetch-site": "cross-site" }))).toBe(true);
  });

  it("allows requests from the same site", () => {
    expect(isSameOriginRequest("POST", headers({ origin: "https://karaoki.test", host: "karaoki.test" }))).toBe(true);
    expect(isSameOriginRequest("DELETE", headers({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
  });

  it("uses the forwarded host behind a proxy", () => {
    expect(
      isSameOriginRequest("POST", headers({ origin: "https://karaoki.test", host: "internal:3000", "x-forwarded-host": "karaoki.test" })),
    ).toBe(true);
  });

  it("blocks other sites", () => {
    expect(isSameOriginRequest("POST", headers({ origin: "https://evil.example", host: "karaoki.test" }))).toBe(false);
    expect(isSameOriginRequest("PATCH", headers({ origin: "https://karaoki.test.evil.example", host: "karaoki.test" }))).toBe(false);
  });

  it("blocks cross-site fetches even without an origin", () => {
    expect(isSameOriginRequest("POST", headers({ "sec-fetch-site": "cross-site", host: "karaoki.test" }))).toBe(false);
  });

  it("allows clients that send no origin, such as curl or server calls", () => {
    expect(isSameOriginRequest("POST", headers({ host: "karaoki.test" }))).toBe(true);
  });

  it("rejects a malformed origin or a missing host", () => {
    expect(isSameOriginRequest("POST", headers({ origin: "not a url", host: "karaoki.test" }))).toBe(false);
    expect(isSameOriginRequest("POST", headers({ origin: "https://karaoki.test" }))).toBe(false);
  });
});

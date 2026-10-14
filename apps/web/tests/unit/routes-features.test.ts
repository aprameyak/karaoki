import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  song: { id: "s", status: "ready" } as { id: string; status: string } | null,
  recording: null as Record<string, unknown> | null,
  file: { bucket: "recordings", path: "u/s/mixes/m.mp3" } as { bucket: string; path: string } | null,
  signFails: false,
}));

function builder(table: string) {
  const api = {
    select: () => api,
    eq: () => api,
    maybeSingle: async () => ({
      data: table === "songs" ? state.song : table === "recordings" ? state.recording : state.file,
      error: null,
    }),
  };
  return api;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      getSession: async () => ({ data: { session: { access_token: "token-abc" } } }),
    },
    from: (table: string) => builder(table),
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string) =>
          state.signFails
            ? { data: null, error: new Error("nope") }
            : { data: { signedUrl: `https://storage.test/${bucket}/${path}?token=t` }, error: null },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/sign/${path}` }, error: null }),
      }),
    },
  }),
}));

import { POST as adminRetry } from "@/app/api/admin/jobs/[id]/retry/route";
import { POST as adminReport } from "@/app/api/admin/reports/[id]/route";
import { POST as adminSupport } from "@/app/api/admin/support/[id]/route";
import { GET as getExport, DELETE as deleteExport } from "@/app/api/exports/[id]/route";
import { GET as getRecording, DELETE as deleteRecording } from "@/app/api/recordings/[id]/route";
import { POST as remix } from "@/app/api/recordings/[id]/remix/route";
import { POST as createExport } from "@/app/api/songs/[id]/exports/route";
import { POST as createRecording } from "@/app/api/songs/[id]/recordings/route";
import { POST as recordingUpload } from "@/app/api/songs/[id]/recordings/upload/route";
import { POST as support } from "@/app/api/support/route";
import { resetRateLimits } from "@/lib/rate-limit";

const ID = "22222222-2222-4222-8222-222222222222";
const ctx = { params: Promise.resolve({ id: ID }) };

function json(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function mockApi(status = 200, body: unknown = { ok: true }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  state.user = { id: "11111111-1111-4111-8111-111111111111" };
  state.song = { id: "s", status: "ready" };
  state.recording = null;
  state.file = { bucket: "recordings", path: "u/s/mixes/m.mp3" };
  state.signFails = false;
  process.env.API_URL = "http://api.test";
  resetRateLimits();
  vi.restoreAllMocks();
});

describe("recording upload url", () => {
  it("creates a private take path for the signed-in user", async () => {
    const res = await recordingUpload(json({ extension: "webm" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toMatch(/^11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\/take-[0-9a-f]{16}\.webm$/);
    expect(body.uploadUrl).toContain("https://storage.test/recordings/");
  });

  it("uses a different name every time", async () => {
    const a = await (await recordingUpload(json({ extension: "ogg" }), ctx)).json();
    const b = await (await recordingUpload(json({ extension: "ogg" }), ctx)).json();
    expect(a.path).not.toBe(b.path);
  });

  it("only accepts known audio extensions", async () => {
    for (const extension of ["exe", "mp3", "../x", ""]) {
      expect((await recordingUpload(json({ extension }), ctx)).status).toBe(400);
    }
  });

  it("requires a signed-in user, an owned song and a processed song", async () => {
    state.user = null;
    expect((await recordingUpload(json({ extension: "webm" }), ctx)).status).toBe(401);
    state.user = { id: "11111111-1111-4111-8111-111111111111" };
    state.song = null;
    expect((await recordingUpload(json({ extension: "webm" }), ctx)).status).toBe(404);
    state.song = { id: "s", status: "uploaded" };
    expect((await recordingUpload(json({ extension: "webm" }), ctx)).status).toBe(409);
  });

  it("reports a storage failure", async () => {
    state.signFails = true;
    expect((await recordingUpload(json({ extension: "webm" }), ctx)).status).toBe(500);
  });
});

describe("proxied routes", () => {
  it("forward the body and the user's token", async () => {
    const fetchMock = mockApi(202, { export: { id: "e1" } });
    const res = await createExport(json({ semitones: 2, tempo: 1.1, preview: true }), ctx);
    expect(res.status).toBe(202);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://api.test/v1/songs/${ID}/exports`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-abc");
    expect(JSON.parse(init.body as string)).toEqual({ semitones: 2, tempo: 1.1, preview: true });
  });

  it("send recordings and remixes to the API", async () => {
    const fetchMock = mockApi(202, { recording: { id: "r1" } });
    const created = await createRecording(json({ path: "a/b/take.webm", offsetMs: -40 }), ctx);
    const remixed = await remix(json({ offsetMs: 100 }), ctx);
    expect([created.status, remixed.status]).toEqual([202, 202]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      `http://api.test/v1/songs/${ID}/recordings`,
      `http://api.test/v1/recordings/${ID}/remix`,
    ]);
  });

  it("pass API errors through", async () => {
    mockApi(409, { error: { code: "not_ready", message: "Process this song first" } });
    const res = await createExport(json({ semitones: 1 }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("not_ready");
  });

  it("read, delete and look up exports", async () => {
    const fetchMock = mockApi(200, { export: {} });
    const results = [
      await getExport(new Request("http://localhost"), ctx),
      await deleteExport(new Request("http://localhost"), ctx),
      await deleteRecording(new Request("http://localhost"), ctx),
    ];
    expect(results.map((res) => res.status)).toEqual([200, 200, 200]);
    const calls = fetchMock.mock.calls.map((c) => [c[0], (c[1] as RequestInit).method]);
    expect(calls).toEqual([
      [`http://api.test/v1/exports/${ID}`, "GET"],
      [`http://api.test/v1/exports/${ID}`, "DELETE"],
      [`http://api.test/v1/recordings/${ID}`, "DELETE"],
    ]);
  });

  it("reject bad ids and signed-out users", async () => {
    const bad = { params: Promise.resolve({ id: "nope" }) };
    expect((await createExport(json({}), bad)).status).toBe(404);
    expect((await remix(json({}), bad)).status).toBe(404);
    state.user = null;
    expect((await createExport(json({}), ctx)).status).toBe(401);
    expect((await createRecording(json({}), ctx)).status).toBe(401);
    expect((await adminRetry(new Request("http://localhost", { method: "POST" }), ctx)).status).toBe(401);
  });
});

describe("recording status", () => {
  it("includes a download link when the mix is ready", async () => {
    state.recording = { id: ID, status: "ready", mix_file_id: "f1", title: "Take" };
    const res = await getRecording(new Request("http://localhost"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).recording.mix_url).toBe("https://storage.test/sign/u/s/mixes/m.mp3");
  });

  it("has no link while mixing", async () => {
    state.recording = { id: ID, status: "mixing", mix_file_id: null };
    expect((await (await getRecording(new Request("http://localhost"), ctx)).json()).recording.mix_url).toBeNull();
  });

  it("is a 404 for someone else's recording", async () => {
    state.recording = null;
    expect((await getRecording(new Request("http://localhost"), ctx)).status).toBe(404);
  });
});

describe("admin routes", () => {
  it("forward actions with the admin's token", async () => {
    const fetchMock = mockApi(200, { updated: true });
    const results = [
      await adminRetry(new Request("http://localhost", { method: "POST" }), ctx),
      await adminReport(json({ status: "actioned" }), ctx),
      await adminSupport(json({ status: "answered" }), ctx),
    ];
    expect(results.map((res) => res.status)).toEqual([200, 200, 200]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      `http://api.test/v1/admin/jobs/${ID}/retry`,
      `http://api.test/v1/admin/reports/${ID}`,
      `http://api.test/v1/admin/support/${ID}`,
    ]);
    for (const call of fetchMock.mock.calls) {
      expect(((call[1] as RequestInit).headers as Record<string, string>).Authorization).toBe("Bearer token-abc");
    }
  });

  it("surface a forbidden answer from the API", async () => {
    mockApi(403, { error: { code: "forbidden", message: "no" } });
    expect((await adminReport(json({ status: "actioned" }), ctx)).status).toBe(403);
  });

  it("need a status", async () => {
    expect((await adminReport(json({}), ctx)).status).toBe(400);
  });
});

describe("support route", () => {
  const message = { name: "Sam", email: "sam@example.com", message: "My upload will not finish" };

  it("forwards messages with the client address", async () => {
    const fetchMock = mockApi(201, { received: true });
    const res = await support(json(message, { "x-forwarded-for": "4.4.4.4, 10.0.0.1" }));
    expect(res.status).toBe(200);
    expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>)["X-Client-IP"]).toBe("4.4.4.4");
  });

  it("validates input before calling the API", async () => {
    const fetchMock = mockApi(201);
    expect((await support(json({ ...message, email: "bad" }))).status).toBe(400);
    expect((await support(json({ ...message, message: "short" }))).status).toBe(400);
    expect((await support(json({ ...message, name: " " }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits messages per address", async () => {
    mockApi(201);
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await support(json(message, { "x-forwarded-for": "6.6.6.6" }))).status);
    expect(codes).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

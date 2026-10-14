import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  inserted: [] as unknown[],
  deleted: [] as string[],
  signedFails: false,
  songStatus: "uploaded",
  removed: [] as { bucket: string; paths: string[] }[],
}));

function builder(table: string) {
  const api = {
    select: () => api,
    eq: () => api,
    insert: (row: unknown) => {
      state.inserted.push(row);
      return api;
    },
    delete: () => {
      state.deleted.push(table);
      return api;
    },
    single: async () =>
      table === "profiles"
        ? { data: { plan_id: "free", plans: { max_file_bytes: 50 * 1024 * 1024 } }, error: null }
        : { data: { id: "22222222-2222-4222-8222-222222222222" }, error: null },
    maybeSingle: async () => ({ data: { id: "s", status: state.songStatus }, error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: table === "audio_files" ? [{ bucket: "stems", path: "a/b.mp3" }] : [], error: null }),
  };
  return api;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      getSession: async () => ({ data: { session: { access_token: "token-123" } } }),
    },
    from: (table: string) => builder(table),
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string) =>
          state.signedFails
            ? { data: null, error: new Error("nope") }
            : { data: { signedUrl: `https://storage.test/${bucket}/${path}?token=t` }, error: null },
        remove: async (paths: string[]) => {
          state.removed.push({ bucket, paths });
          return { error: null };
        },
      }),
    },
  }),
}));

import { POST as upload } from "@/app/api/uploads/route";
import { DELETE as deleteSong } from "@/app/api/songs/[id]/route";
import { POST as processSong } from "@/app/api/songs/[id]/process/route";
import { POST as copyright } from "@/app/api/copyright/route";
import { resetRateLimits } from "@/lib/rate-limit";

const SONG = "22222222-2222-4222-8222-222222222222";

function json(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.user = { id: "11111111-1111-4111-8111-111111111111" };
  state.inserted = [];
  state.deleted = [];
  state.removed = [];
  state.signedFails = false;
  state.songStatus = "uploaded";
  process.env.API_URL = "http://api.test";
  resetRateLimits();
  vi.restoreAllMocks();
});

describe("POST /api/uploads", () => {
  const valid = { filename: "My Song.mp3", size: 1000, rightsConfirmed: true };

  it("creates the song and returns a signed upload url", async () => {
    const res = await upload(json(valid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.songId).toBe(SONG);
    expect(body.path).toBe(`11111111-1111-4111-8111-111111111111/${SONG}/original.mp3`);
    expect(body.uploadUrl).toContain("https://storage.test/originals/");
    const row = state.inserted[0] as Record<string, unknown>;
    expect(row.title).toBe("My Song");
    expect(row.user_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(typeof row.rights_confirmed_at).toBe("string");
  });

  it("requires a signed-in user", async () => {
    state.user = null;
    const res = await upload(json(valid));
    expect(res.status).toBe(401);
    expect(state.inserted).toHaveLength(0);
  });

  it("requires the rights confirmation", async () => {
    const res = await upload(json({ ...valid, rightsConfirmed: false }));
    expect(res.status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });

  it("rejects unsupported and oversized files before creating anything", async () => {
    expect((await upload(json({ ...valid, filename: "a.exe" }))).status).toBe(422);
    expect((await upload(json({ ...valid, size: 60 * 1024 * 1024 }))).status).toBe(422);
    expect((await upload(json({ ...valid, size: 0 }))).status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });

  it("rejects malformed bodies", async () => {
    const res = await upload(new Request("http://localhost/api", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("removes the song when the upload url cannot be created", async () => {
    state.signedFails = true;
    const res = await upload(json(valid));
    expect(res.status).toBe(500);
    expect(state.deleted).toContain("songs");
  });
});

describe("DELETE /api/songs/[id]", () => {
  const ctx = { params: Promise.resolve({ id: SONG }) };

  it("removes files and then the song", async () => {
    const res = await deleteSong(new Request("http://localhost"), ctx);
    expect(res.status).toBe(200);
    expect(state.removed).toEqual([{ bucket: "stems", paths: ["a/b.mp3"] }]);
    expect(state.deleted).toContain("songs");
  });

  it("refuses while a job is running", async () => {
    state.songStatus = "processing";
    const res = await deleteSong(new Request("http://localhost"), ctx);
    expect(res.status).toBe(409);
    expect(state.deleted).toHaveLength(0);
  });

  it("treats a bad id as missing", async () => {
    const res = await deleteSong(new Request("http://localhost"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/songs/[id]/process", () => {
  const ctx = { params: Promise.resolve({ id: SONG }) };

  it("forwards the user's token to the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ job: { id: "j1", status: "queued" } }), { status: 200 }),
    );
    const res = await processSong(new Request("http://localhost", { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://api.test/v1/songs/${SONG}/process`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
    expect(await res.json()).toEqual({ job: { id: "j1", status: "queued" } });
  });

  it("passes API errors through with their status and code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "quota_exceeded", message: "used up" } }), { status: 402 }),
    );
    const res = await processSong(new Request("http://localhost", { method: "POST" }), ctx);
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("quota_exceeded");
  });

  it("reports an unreachable API as unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));
    const res = await processSong(new Request("http://localhost", { method: "POST" }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("api_unavailable");
  });

  it("requires a signed-in user", async () => {
    state.user = null;
    const res = await processSong(new Request("http://localhost", { method: "POST" }), ctx);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/copyright", () => {
  const report = {
    reporterName: "Owner",
    reporterEmail: "owner@example.com",
    workDescription: "My song called Example",
    locationDescription: "A karaoke track named Example",
    statementAccepted: true,
  };

  it("forwards valid reports with the client address", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
    const res = await copyright(json(report, { "x-forwarded-for": "5.6.7.8, 10.0.0.1" }));
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Client-IP"]).toBe("5.6.7.8");
  });

  it("validates the report", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await copyright(json({ ...report, reporterEmail: "bad" }))).status).toBe(400);
    expect((await copyright(json({ ...report, statementAccepted: false }))).status).toBe(400);
    expect((await copyright(json({ ...report, workDescription: "short" }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits reports per address", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 201 }));
    const codes = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await copyright(json(report, { "x-forwarded-for": "9.9.9.9" }))).status);
    }
    expect(codes).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

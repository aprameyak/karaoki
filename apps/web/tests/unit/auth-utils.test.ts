import { describe, expect, it } from "vitest";
import { emailSchema, loginSchema, passwordSchema, safeNext, signupSchema } from "@/lib/auth-utils";
import { redirectTarget } from "@/lib/supabase/proxy";

describe("safeNext", () => {
  it("allows local paths", () => {
    expect(safeNext("/dashboard/library?page=2")).toBe("/dashboard/library?page=2");
    expect(safeNext("/dashboard/upload")).toBe("/dashboard/upload");
  });

  it("falls back for missing values", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
    expect(safeNext("", "/x")).toBe("/x");
  });

  it.each([
    "https://evil.example/path",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "dashboard",
    "/ok\u0000bad",
    "/\tfoo",
  ])("rejects %s", (value) => {
    expect(safeNext(value)).toBe("/dashboard");
  });
});

describe("schemas", () => {
  it("normalizes emails", () => {
    expect(emailSchema.parse("  Person@Example.COM ")).toBe("person@example.com");
    expect(emailSchema.safeParse("nope").success).toBe(false);
  });

  it("limits password length", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("long enough password").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(73)).success).toBe(false);
  });

  it("validates sign up and log in forms", () => {
    expect(signupSchema.safeParse({ name: "A", email: "a@b.co", password: "12345678" }).success).toBe(true);
    expect(signupSchema.safeParse({ name: " ", email: "a@b.co", password: "12345678" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("redirectTarget", () => {
  it("sends signed-out visitors to log in", () => {
    expect(redirectTarget("/dashboard", false)).toBe("/login?next=%2Fdashboard");
    expect(redirectTarget("/dashboard/songs/1", false)).toBe("/login?next=%2Fdashboard%2Fsongs%2F1");
  });

  it("protects the admin area the same way", () => {
    expect(redirectTarget("/admin", false)).toBe("/login?next=%2Fadmin");
    expect(redirectTarget("/admin/jobs", false)).toBe("/login?next=%2Fadmin%2Fjobs");
    expect(redirectTarget("/admin", true)).toBeNull();
    expect(redirectTarget("/administrator", false)).toBeNull();
  });

  it("does not protect public pages", () => {
    expect(redirectTarget("/", false)).toBeNull();
    expect(redirectTarget("/login", false)).toBeNull();
    expect(redirectTarget("/dashboardx", false)).toBeNull();
  });

  it("sends signed-in users away from auth pages", () => {
    expect(redirectTarget("/login", true)).toBe("/dashboard");
    expect(redirectTarget("/signup", true)).toBe("/dashboard");
    expect(redirectTarget("/dashboard", true)).toBeNull();
  });
});

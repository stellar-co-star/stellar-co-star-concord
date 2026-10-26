import { describe, expect, it } from "vitest";
import { Client, harness } from "./helpers.js";

describe("sign-up in code mode", () => {
  const body = (email: string, code?: string) => ({
    email,
    name: "Someone",
    password: "correct horse battery",
    orgName: "Workspace",
    ...(code === undefined ? {} : { code }),
  });

  it("answers an existing and a new email identically when no valid code is given", async () => {
    const h = harness({ signup: "code" });
    await new Client(h.app).call("/api/auth/signup", { body: body("taken@example.test", h.auth.createSignupCode()) });
    const client = new Client(h.app);
    const existing = await client.call("/api/auth/signup", { body: body("taken@example.test") });
    const fresh = await client.call("/api/auth/signup", { body: body("new@example.test") });
    const wrong = await client.call("/api/auth/signup", { body: body("taken@example.test", "not-a-code") });
    expect(existing.status).toBe(403);
    expect(fresh.status).toBe(403);
    expect(wrong.status).toBe(403);
    expect(await existing.json()).toEqual(await fresh.json());
  });

  it("leaves a valid code unspent when the email is already registered", async () => {
    const h = harness({ signup: "code" });
    const client = new Client(h.app);
    await client.call("/api/auth/signup", { body: body("taken@example.test", h.auth.createSignupCode()) });
    const code = h.auth.createSignupCode();
    const clash = await client.call("/api/auth/signup", { body: body("taken@example.test", code) });
    expect(clash.status).toBe(409);
    const ok = await client.call("/api/auth/signup", { body: body("fresh@example.test", code) });
    expect(ok.status).toBe(201);
  });
});

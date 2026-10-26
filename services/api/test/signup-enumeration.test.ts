import { describe, expect, it } from "vitest";
import { Client, harness } from "./helpers.js";

describe("open sign-up and existing emails", () => {
  const body = (email: string) => ({ email, name: "Someone", password: "correct horse battery", orgName: "Workspace" });

  it("says the account exists, by design, and caps how fast that can be probed per address", async () => {
    const h = harness({ trustProxyHops: 1 });
    const call = (email: string, ip: string) =>
      new Client(h.app).call("/api/auth/signup", { body: body(email), headers: { "x-forwarded-for": ip } });
    expect((await call("taken@example.test", "203.0.113.1")).status).toBe(201);

    const again = await call("taken@example.test", "203.0.113.2");
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "An account with this email already exists. Sign in instead." });

    // One address gets 20 sign-up attempts an hour in all, then 429, however many emails it tries.
    for (let i = 0; i < 19; i++) await call(`probe${i}@example.test`, "203.0.113.3");
    expect((await call("taken@example.test", "203.0.113.3")).status).toBe(409);
    expect((await call("taken@example.test", "203.0.113.3")).status).toBe(429);
  });
});

import { describe, expect, it } from "vitest";
import { SIGNIN_FAILURES_PER_ADDRESS, SIGNIN_FAILURES_PER_EMAIL } from "../src/auth-api.js";
import { Client, harness } from "./helpers.js";

const PASSWORD = "correct horse battery";

async function setup() {
  const h = harness({ trustProxyHops: 1 });
  await new Client(h.app).signUp("victim@example.test", "Victim Co", PASSWORD);
  const from = (ip: string) => {
    const client = new Client(h.app);
    const signIn = (password: string) =>
      client.call("/api/auth/signin", {
        body: { email: "victim@example.test", password },
        headers: { "x-forwarded-for": ip },
      });
    return { signIn };
  };
  return { from };
}

describe("sign-in lockout", () => {
  it("does not let failures from one address lock the real user out from another", async () => {
    const { from } = await setup();
    const attacker = from("203.0.113.9");
    for (let i = 0; i < SIGNIN_FAILURES_PER_ADDRESS; i++) {
      expect((await attacker.signIn("wrong password")).status).toBe(401);
    }
    // That address is now locked, even with the right password.
    expect((await attacker.signIn(PASSWORD)).status).toBe(429);
    // The legitimate user, elsewhere, still gets in.
    expect((await from("198.51.100.7").signIn(PASSWORD)).status).toBe(200);
  });

  it("still caps guessing against one email that is spread over many addresses", async () => {
    const { from } = await setup();
    for (let i = 0; i < SIGNIN_FAILURES_PER_EMAIL; i++) {
      const ip = `192.0.2.${(i % 10) + 1}`;
      await from(ip).signIn("wrong password");
    }
    // Ten addresses each failed five times: none is locked alone, but the email is.
    expect((await from("198.51.100.200").signIn(PASSWORD)).status).toBe(429);
  });
});

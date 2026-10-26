/**
 * Rebuilds the testnet practice workspace on a running Concord, from the files `pnpm demo:testnet`
 * wrote: sign in (or sign up), watch both assets from the first ledger of the life cycle, import
 * the three books, and create the dividend and the split. It talks to the HTTP API like the
 * dashboard does, so it works against a local server or a hosted one, and it can be run again
 * after a free-tier host has wiped everything. It never touches testnet.
 *
 *   pnpm demo:load --url https://stellar-co-star-stellar-co-star-stellar-co-star-concord.onrender.com --email me@example.org --password '…'
 *
 * Options: --url (default http://127.0.0.1:4400), --email, --password, --org (workspace name for
 * a new account), --code (sign-up code when the server wants one), --dir (default: the demo
 * folder under CONCORD_DATA_DIR).
 */
import { readFileSync } from "node:fs";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../config.js";

setDefaultAutoSelectFamilyAttemptTimeout(5000);

interface Manifest {
  network: "testnet";
  firstLedger: number;
  fund: { code: string; issuer: string; name: string };
  cash: { code: string; issuer: string; name: string };
  treasury: string;
  registerAsOf: string;
  dividend: { recordTime: string; windowTo: string; ratePerUnit: string };
  split: { recordTime: string; num: string; den: string };
}

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:4400" },
    email: { type: "string", default: "demo@example.org" },
    password: { type: "string" },
    name: { type: "string", default: "Demo Admin" },
    org: { type: "string", default: "Harbourline Transfer" },
    code: { type: "string" },
    dir: { type: "string" },
  },
});

const base = new URL(values.url!).origin;
const dir = values.dir ?? join(loadConfig(process.env).dataDir, "demo");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest;
const book = (name: string) => readFileSync(join(dir, name), "utf8");

const cookies = new Map<string, string>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown,
  accept: number[] = [],
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = { origin: base };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(base + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(90_000),
  });
  for (const line of res.headers.getSetCookie()) {
    const [pair = "", ...attrs] = line.split(";");
    const [name = "", ...rest] = pair.split("=");
    if (attrs.some((a) => /max-age=0/i.test(a)) || rest.join("=") === "") cookies.delete(name);
    else cookies.set(name, rest.join("="));
  }
  const text = await res.text();
  const data = (text ? JSON.parse(text) : {}) as T;
  if (!res.ok && !accept.includes(res.status)) {
    throw new Error(`${method} ${path} → ${res.status} ${(data as { error?: string }).error ?? text}`);
  }
  return { status: res.status, data };
}

async function signIn(): Promise<void> {
  const password = values.password;
  if (!password) throw new Error("give --password; it is used to sign in, or to create the account the first time");
  const email = values.email!;
  const created = await call("POST", "/api/auth/signup", {
    email,
    name: values.name,
    password,
    orgName: values.org,
    ...(values.code ? { code: values.code } : {}),
  }, [409]);
  if (created.status === 409) {
    await call("POST", "/api/auth/signin", { email, password });
    console.log(`signed in as ${email}`);
  } else {
    console.log(`created ${email} and the workspace "${values.org}"`);
  }
}

interface AssetRow {
  id: string;
  code: string;
  state: string;
  syncedAt?: string;
  syncError?: string;
}

async function watch(asset: Manifest["fund"], extra: Record<string, unknown>): Promise<AssetRow> {
  const have = (await call<{ assets: AssetRow[] }>("GET", "/api/overview")).data.assets.find((a) => a.code === asset.code);
  if (have) {
    console.log(`${asset.code}: already watched`);
    return have;
  }
  const made = await call<AssetRow>("POST", "/api/assets", {
    network: manifest.network,
    asset: `${asset.code}:${asset.issuer}`,
    name: asset.name,
    fromLedger: manifest.firstLedger,
    ...extra,
  });
  console.log(`${asset.code}: watching from ledger ${manifest.firstLedger}`);
  return made.data;
}

/** The indexer starts in the background; wait until it has read the chain at least once. */
async function ready(asset: AssetRow): Promise<void> {
  for (let i = 0; i < 90; i++) {
    const row = (await call<AssetRow>("GET", `/api/assets/${asset.id}`)).data;
    if (row.syncError) throw new Error(`${asset.code}: indexing failed: ${row.syncError}`);
    if (row.state === "ready" && row.syncedAt) return;
    if (i % 5 === 4) await call("POST", `/api/assets/${asset.id}/sync`, {}, [429]);
    await sleep(2000);
  }
  throw new Error(`${asset.code} did not finish indexing in three minutes`);
}

async function main(): Promise<void> {
  console.log(`loading ${dir} into ${base}`);
  await signIn();
  const fund = await watch(manifest.fund, { ignore: [manifest.treasury] });
  const cash = await watch(manifest.cash, {});
  await ready(fund);
  await ready(cash);
  console.log("both assets indexed");

  const register = await call<{ registerId: number; duplicate: boolean; run: { breaks: unknown[] } | null }>(
    "POST",
    `/api/assets/${fund.id}/registers`,
    { csv: book("register.csv"), asOf: manifest.registerAsOf, source: "register.csv" },
  );
  console.log(
    register.data.duplicate
      ? `register ${register.data.registerId}: already imported`
      : `register ${register.data.registerId}: imported and reconciled, ${register.data.run?.breaks.length ?? 0} breaks`,
  );
  await call("POST", `/api/assets/${fund.id}/journal`, { csv: book("journal.csv") });
  await call("POST", `/api/assets/${fund.id}/instructions`, { csv: book("instructions.csv") });
  if (register.data.duplicate) {
    console.log("journal and instructions imported");
  } else {
    // The journal changes what the register reconciles to, so run it once more with all three books.
    await call("POST", `/api/assets/${fund.id}/reconciliations`, { registerId: register.data.registerId });
    console.log("journal and instructions imported; reconciled again");
  }

  const existing = (await call<Array<{ type: string; recordTime: string }>>("GET", `/api/assets/${fund.id}/actions`)).data;
  const has = (type: string, recordTime: string) => existing.some((a) => a.type === type && a.recordTime === recordTime);
  if (!has("dividend", manifest.dividend.recordTime)) {
    await call("POST", `/api/assets/${fund.id}/actions`, {
      type: "dividend",
      ...manifest.dividend,
      payAsset: cash.id,
      payer: manifest.treasury,
    });
    console.log("dividend created");
  }
  if (!has("split", manifest.split.recordTime)) {
    await call("POST", `/api/assets/${fund.id}/actions`, { type: "split", ...manifest.split });
    console.log("split created");
  }
  console.log(`\nDone. Open ${base} and sign in as ${values.email}.`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});

/**
 * A practice asset on Stellar testnet, for developing Concord.
 *
 * Issues a regulated fund share (auth required, revocable, clawback enabled), runs a life cycle
 * against it — subscriptions, a cash dividend, a transfer, a freeze, a clawback, a redemption and
 * a 2:1 split — and writes a register, journal and instruction file that disagree with the chain
 * in known ways. The books are invented, so this script never opens a Concord database: it
 * prints what to watch and where the files are, and a person loads them by hand on testnet.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  Asset,
  AuthClawbackEnabledFlag,
  AuthRequiredFlag,
  AuthRevocableFlag,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
  rpc,
  type xdr,
} from "@stellar/stellar-sdk";
import { toCsv } from "@stellar-co-star-stellar-co-star-stellar-co-star-concord/core";
import { loadConfig } from "../config.js";

const config = loadConfig();
const testnet = config.networks.testnet;
const server = new rpc.Server(testnet.rpc[0]!.url);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retry<T>(what: string, fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw new Error(`${what}: ${(err as Error).message}`);
      await sleep(2000 * i);
    }
  }
}

async function fund(kp: Keypair): Promise<void> {
  await retry("friendbot", async () => {
    const res = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok && res.status !== 400) throw new Error(`HTTP ${res.status}`);
  });
}

interface Settled {
  hash: string;
  ledger: number;
  closedAt: string;
}

async function submit(label: string, source: Keypair, ops: xdr.Operation[], signers: Keypair[] = []): Promise<Settled> {
  const account = await retry("getAccount", () => server.getAccount(source.publicKey()));
  const builder = new TransactionBuilder(account, {
    fee: String(Number(BASE_FEE) * 100),
    networkPassphrase: testnet.passphrase,
  });
  for (const op of ops) builder.addOperation(op);
  const tx = builder.setTimeout(300).build();
  tx.sign(source, ...signers);
  const sent = await retry("sendTransaction", () => server.sendTransaction(tx));
  if (sent.status === "ERROR") throw new Error(`${label} rejected: ${JSON.stringify(sent.errorResult ?? sent)}`);
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const got = await server.getTransaction(sent.hash).catch(() => undefined);
    if (!got || got.status === "NOT_FOUND") continue;
    if (got.status !== "SUCCESS") throw new Error(`${label} failed on-chain (${sent.hash})`);
    const settled = { hash: sent.hash, ledger: got.ledger, closedAt: new Date(Number(got.createdAt) * 1000).toISOString() };
    console.log(`  ${label.padEnd(34)} ledger ${settled.ledger}`);
    return settled;
  }
  throw new Error(`${label} did not settle`);
}

async function main(): Promise<void> {
  const issuer = Keypair.random();
  const bank = Keypair.random();
  const treasury = Keypair.random();
  const holders = Array.from({ length: 5 }, () => Keypair.random());
  const [h1, h2, h3, h4, h5] = holders.map((k) => k.publicKey()) as [string, string, string, string, string];
  const fundAsset = new Asset("ACMEF", issuer.publicKey());
  const cash = new Asset("USDX", bank.publicKey());
  const startedAt = new Date(Date.now() - 60_000).toISOString();

  console.log("Funding the issuer from friendbot…");
  await fund(issuer);

  console.log("Running the asset life cycle on testnet:");
  await submit("accounts and regulated flags", issuer, [
    ...[bank, treasury, ...holders].map((k) =>
      Operation.createAccount({ destination: k.publicKey(), startingBalance: "100" }),
    ),
    Operation.setOptions({ setFlags: (AuthRequiredFlag | AuthRevocableFlag | AuthClawbackEnabledFlag) as 11 }),
  ]);
  const members = [treasury, ...holders];
  await submit(
    "trustlines and authorisations",
    issuer,
    [
      ...members.flatMap((k) => [
        Operation.changeTrust({ asset: fundAsset, source: k.publicKey() }),
        Operation.changeTrust({ asset: cash, source: k.publicKey() }),
        Operation.setTrustLineFlags({ trustor: k.publicKey(), asset: fundAsset, flags: { authorized: true } }),
      ]),
      Operation.payment({ destination: treasury.publicKey(), asset: cash, amount: "100000", source: bank.publicKey() }),
    ],
    [bank, ...members],
  );
  const pay = (destination: string, amount: string, asset = fundAsset) =>
    Operation.payment({ destination, asset, amount });
  const issue = await submit("subscriptions (mints)", issuer, [
    pay(treasury.publicKey(), "1000"),
    pay(h1, "5000"),
    pay(h2, "3000"),
    pay(h3, "1500"),
    pay(h4, "500"),
    pay(h5, "250"),
  ]);
  // Dividend of 0.05 USDX per unit: holder 3 is paid short and holder 5 is missed.
  await submit("cash dividend from paying agent", treasury, [
    pay(h1, "250", cash),
    pay(h2, "150", cash),
    pay(h3, "70", cash),
    pay(h4, "25", cash),
  ]);
  await submit("holder 1 transfers 400 to holder 2", holders[0]!, [pay(h2, "400")]);
  const freeze = await submit("issuer freezes holder 3", issuer, [
    Operation.setTrustLineFlags({ trustor: h3, asset: fundAsset, flags: { authorized: false } }),
  ]);
  const claw = await submit("issuer claws back 100 from holder 4", issuer, [
    Operation.clawback({ asset: fundAsset, from: h4, amount: "100" }),
  ]);
  const redeem = await submit("holder 5 redeems 50", holders[4]!, [pay(issuer.publicKey(), "50")]);
  // 2:1 split executed as mints. Holder 3 is frozen and cannot receive, so it is skipped.
  const split = await submit("2:1 split (mints)", issuer, [
    pay(treasury.publicKey(), "1000"),
    pay(h1, "4600"),
    pay(h2, "3400"),
    pay(h4, "400"),
    pay(h5, "200"),
  ]);

  const dir = join(config.dataDir, "demo");
  mkdirSync(dir, { recursive: true });
  const write = (name: string, text: string) => {
    writeFileSync(join(dir, name), text);
    return text;
  };
  write(
    "register.csv",
    toCsv(
      ["holder_id", "holder_name", "account", "units", "status"],
      [
        { holder_id: "H001", holder_name: "Northgate Pension Trust", account: h1, units: "5000", status: "active" },
        { holder_id: "H002", holder_name: "Lindqvist Family Office", account: h2, units: "3000", status: "active" },
        { holder_id: "H003", holder_name: "Okafor Holdings Ltd", account: h3, units: "1500", status: "active" },
        { holder_id: "H004A", holder_name: "Brightwater Nominees (client A)", account: h4, units: "300", status: "active" },
        { holder_id: "H004B", holder_name: "Brightwater Nominees (client B)", account: h4, units: "100", status: "active" },
        { holder_id: "H005", holder_name: "M. Castellanos", account: h5, units: "200", status: "active" },
        { holder_id: "H006", holder_name: "Estate of R. Whitlock", account: "", units: "100", status: "" },
      ],
    ),
  );
  write(
    "journal.csv",
    toCsv(
      ["ref", "date", "type", "from_account", "to_account", "units", "tx_hash"],
      [
        { ref: "J-001", date: issue.closedAt, type: "issue", to_account: h1, units: "5000", tx_hash: issue.hash },
        { ref: "J-002", date: issue.closedAt, type: "issue", to_account: h2, units: "3000", tx_hash: issue.hash },
        { ref: "J-003", date: issue.closedAt, type: "issue", to_account: h3, units: "1500", tx_hash: issue.hash },
        { ref: "J-004", date: issue.closedAt, type: "issue", to_account: h4, units: "500", tx_hash: issue.hash },
        { ref: "J-005", date: issue.closedAt, type: "issue", to_account: h5, units: "250", tx_hash: issue.hash },
        { ref: "J-006", date: claw.closedAt, type: "clawback", from_account: h4, units: "100" },
        { ref: "J-007", date: redeem.closedAt, type: "redeem", from_account: h5, units: "50", tx_hash: redeem.hash },
        { ref: "J-008", date: redeem.closedAt, type: "transfer", from_account: h2, to_account: h3, units: "200" },
      ],
    ),
  );
  write(
    "instructions.csv",
    toCsv(
      ["ref", "type", "account", "units", "issued_at", "approved_by", "reason"],
      [
        ...members.map((k, i) => ({
          ref: `I-${String(i + 1).padStart(3, "0")}`,
          type: "authorize",
          account: k.publicKey(),
          issued_at: startedAt,
          approved_by: "onboarding@acme-ta.example",
          reason: i === 0 ? "Issuer distribution account" : "KYC approved",
        })),
        {
          ref: "I-007",
          type: "freeze",
          account: h3,
          issued_at: new Date(Date.parse(freeze.closedAt) - 30_000).toISOString(),
          approved_by: "compliance@acme-ta.example",
          reason: "Court order 2026/1184",
        },
        {
          ref: "I-008",
          type: "freeze",
          account: h5,
          issued_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
          approved_by: "compliance@acme-ta.example",
          reason: "Sanctions screening hit",
        },
      ],
    ),
  );

  console.log(`
On testnet now (split settled in ${split.hash}).

Watch these in a workspace, with the network set to Testnet:
  ${fundAsset.getCode()}:${fundAsset.getIssuer()}
      keep off the register: ${treasury.publicKey()}
  ${cash.getCode()}:${cash.getIssuer()}

Then load the practice books from ${dir}:
  register.csv      as of ${redeem.closedAt}
  journal.csv
  instructions.csv

Corporate actions to try:
  dividend  record ${issue.closedAt}  window to ${redeem.closedAt}  rate 0.05  paid in ${cash.getCode()}  payer ${treasury.publicKey()}
  split     record ${redeem.closedAt}  ratio 2:1`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});

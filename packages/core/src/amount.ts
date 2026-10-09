/** Classic Stellar assets carry 7 decimal places. SEP-41 contract tokens may differ. */
export const DEFAULT_DECIMALS = 7;

const GROUPED = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;
const PLAIN = /^-?\d+(\.\d+)?$/;

/**
 * Parse a decimal string into the smallest unit. Throws rather than rounding: a register that
 * carries more precision than the chain can represent is itself a reconciliation problem.
 */
export function parseUnits(input: string, decimals = DEFAULT_DECIMALS): bigint {
  let s = input.trim();
  if (GROUPED.test(s)) s = s.replaceAll(",", "");
  if (!PLAIN.test(s)) throw new Error(`not a decimal amount: "${input}"`);
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  const [whole = "0", fracRaw = ""] = s.split(".");
  const frac = fracRaw.replace(/0+$/, "");
  if (frac.length > decimals) {
    throw new Error(`"${input}" has more than ${decimals} decimal places`);
  }
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  return negative ? -value : value;
}

export function formatUnits(value: bigint, decimals = DEFAULT_DECIMALS): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export interface Ratio {
  num: bigint;
  den: bigint;
}

/** Exact rational from a decimal string of any precision, e.g. "0.0123456789". */
export function parseRatio(input: string): Ratio {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a non-negative decimal: "${input}"`);
  const [whole = "0", frac = ""] = s.split(".");
  return { num: BigInt(whole + frac), den: 10n ** BigInt(frac.length) };
}

export type Rounding = "floor" | "half-up";

/** value * num / den for non-negative operands, with an explicit rounding rule. */
export function mulDiv(value: bigint, num: bigint, den: bigint, rounding: Rounding = "floor"): bigint {
  if (den <= 0n) throw new Error("denominator must be positive");
  if (value < 0n || num < 0n) throw new Error("mulDiv expects non-negative operands");
  const product = value * num;
  return rounding === "half-up" ? (product * 2n + den) / (den * 2n) : product / den;
}

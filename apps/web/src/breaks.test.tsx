import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Break } from "./api";
import { BreakTable } from "./breaks";

const base: Break = {
  scope: "control",
  type: "UNINSTRUCTED_CONTROL",
  severity: "high",
  key: "UNINSTRUCTED_CONTROL:e1",
  fingerprint: "UNINSTRUCTED_CONTROL:e1",
  message: "On-chain freeze has no instruction behind it",
  address: null,
  ref: "I-1",
  noteScope: "controls",
  status: "open",
  note: null,
  noteAuthor: null,
  noteAt: null,
  noteStale: false,
};

describe("break table columns", () => {
  it("leaves out the First seen column when no break has a date, as on the controls tab", () => {
    render(<BreakTable assetId="a" breaks={[base]} onChange={() => {}} />);
    expect(screen.queryByText("First seen")).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
  });

  it("shows First seen for position breaks, which carry the date", () => {
    const position: Break = { ...base, scope: "position", type: "SHORT", key: "SHORT:A", firstSeen: "2026-10-06T21:00:00Z" };
    render(<BreakTable assetId="a" breaks={[position]} onChange={() => {}} />);
    expect(screen.getByText("First seen")).toBeInTheDocument();
    expect(screen.getByText("2026-10-06")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(8);
  });
});

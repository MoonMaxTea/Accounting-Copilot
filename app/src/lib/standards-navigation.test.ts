import { describe, expect, it } from "vitest";
import type { StandardSummary } from "../types";
import {
  defaultSecondary,
  defaultTertiary,
  navigationForStandard,
  resolveStandardsQuery,
  secondaryOptions,
  tertiaryOptions,
} from "./standards-navigation";

const sample = (framework: string): StandardSummary => ({
  id: `${framework} 1`,
  title: "Sample",
  title_zh: null,
  framework,
  status: "current",
  legacy_label: null,
  superseded_by: null,
  official_url: "https://example.com",
});

describe("standards-navigation", () => {
  it("shows IFRS market tertiary options under accounting standards", () => {
    expect(
      tertiaryOptions("accounting-standards", "ifrs").map((item) => item.id),
    ).toEqual(["ALL", "IFRS", "IAS"]);
  });

  it("shows ASC under US GAAP", () => {
    expect(tertiaryOptions("accounting-standards", "us-gaap")).toEqual([
      { id: "ASC", label: "ASC" },
    ]);
  });

  it("uses listing markets for listing rules secondary options", () => {
    expect(secondaryOptions("listing-rules").map((item) => item.id)).toEqual(["hk", "us"]);
    expect(defaultSecondary("listing-rules")).toBe("hk");
  });

  it("returns empty query for listing rules", () => {
    expect(resolveStandardsQuery("listing-rules", "hk", "ALL")).toBe("empty");
    expect(resolveStandardsQuery("listing-rules", "us", "ALL")).toBe("empty");
  });

  it("filters IFRS market ALL to IFRS and IAS only", () => {
    const query = resolveStandardsQuery("accounting-standards", "ifrs", "ALL");
    expect(query).not.toBe("empty");
    if (query === "empty") {
      return;
    }

    expect(query.framework).toBeNull();
    expect(query.postFilter(sample("IFRS"))).toBe(true);
    expect(query.postFilter(sample("IAS"))).toBe(true);
    expect(query.postFilter(sample("ASC"))).toBe(false);
  });

  it("maps standards to navigation buckets", () => {
    expect(navigationForStandard(sample("ASC"))).toEqual({
      primary: "accounting-standards",
      secondary: "us-gaap",
      tertiary: "ASC",
    });
    expect(navigationForStandard(sample("IAS")).tertiary).toBe("IAS");
    expect(defaultTertiary("accounting-standards", "us-gaap")).toBe("ASC");
  });
});

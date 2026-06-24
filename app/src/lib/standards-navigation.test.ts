import { describe, expect, it } from "vitest";
import type { CategoryMeta, StandardSummary } from "../types";
import {
  defaultSecondary,
  defaultTertiary,
  navigationForStandard,
  resolveStandardsQuery,
  secondaryOptionsForCategory,
  standardsBreadcrumb,
  tertiaryOptions,
} from "./standards-navigation";

const meta: CategoryMeta[] = [
  { id: "accounting-standards", frameworks: ["IFRS", "IAS", "ASC"] },
  { id: "listing-rules", frameworks: ["HK", "SEC"] },
];

const sample = (framework: string): StandardSummary => ({
  id: `${framework} 1`,
  title: "Sample",
  title_zh: null,
  category: "accounting-standards",
  framework,
  status: "current",
  legacy_label: null,
  superseded_by: null,
  official_url: "https://example.com",
});

describe("standards-navigation", () => {
  it("shows IFRS market tertiary options under accounting standards", () => {
    expect(
      tertiaryOptions("accounting-standards", "IFRS").map((item) => item.id),
    ).toEqual(["ALL", "IFRS", "IAS"]);
  });

  it("shows ASC under ASC secondary", () => {
    expect(tertiaryOptions("accounting-standards", "ASC")).toEqual([
      { id: "ASC", label: "ASC" },
    ]);
  });

  it("uses listing markets for listing rules secondary options", () => {
    expect(secondaryOptionsForCategory("listing-rules", meta).map((item) => item.id)).toEqual([
      "HK",
      "SEC",
    ]);
    expect(defaultSecondary("listing-rules", meta)).toBe("HK");
  });

  it("builds breadcrumb labels (raw IDs; i18n overlay happens in component)", () => {
    expect(standardsBreadcrumb("accounting-standards", "IFRS", "ALL", meta)).toBe(
      "accounting-standards › IFRS › All",
    );
  });

  it("returns query for listing rules (no longer empty)", () => {
    const q = resolveStandardsQuery("listing-rules", "HK", "ALL");
    expect(q).not.toBe("empty");
    if (q === "empty") {
      return;
    }
    expect(q.framework).toBe("HK");
  });

  it("filters IFRS secondary ALL to IFRS and IAS only", () => {
    const query = resolveStandardsQuery("accounting-standards", "IFRS", "ALL");
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
    expect(navigationForStandard(sample("ASC"), meta)).toEqual({
      primary: "accounting-standards",
      secondary: "ASC",
      tertiary: "ASC",
    });
    expect(navigationForStandard(sample("IAS"), meta).tertiary).toBe("IAS");
    expect(defaultTertiary("accounting-standards", "ASC")).toBe("ASC");
  });
});

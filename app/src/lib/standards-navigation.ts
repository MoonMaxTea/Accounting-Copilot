import type { FrameworkFilter, StandardSummary } from "../types";

export type StandardsPrimaryCategory = "accounting-standards" | "listing-rules";
export type StandardsMarket = "ifrs" | "us-gaap";

export interface StandardsNavOption<T extends string> {
  id: T;
  label: string;
}

export const PRIMARY_CATEGORIES: StandardsNavOption<StandardsPrimaryCategory>[] = [
  { id: "accounting-standards", label: "Accounting Standards" },
  { id: "listing-rules", label: "Listing Rules" },
];

export const MARKETS: StandardsNavOption<StandardsMarket>[] = [
  { id: "ifrs", label: "IFRS" },
  { id: "us-gaap", label: "US GAAP" },
];

export interface StandardsQuery {
  framework: string | null;
  postFilter: (standard: StandardSummary) => boolean;
}

export function tertiaryOptions(
  primary: StandardsPrimaryCategory,
  market: StandardsMarket,
): StandardsNavOption<FrameworkFilter>[] {
  if (primary === "listing-rules") {
    return [];
  }

  if (market === "ifrs") {
    return [
      { id: "ALL", label: "全部" },
      { id: "IFRS", label: "IFRS" },
      { id: "IAS", label: "IAS" },
    ];
  }

  return [{ id: "ASC", label: "ASC" }];
}

export function defaultTertiaryForMarket(
  primary: StandardsPrimaryCategory,
  market: StandardsMarket,
): FrameworkFilter {
  if (primary === "listing-rules") {
    return "ALL";
  }
  return market === "ifrs" ? "ALL" : "ASC";
}

export function resolveStandardsQuery(
  primary: StandardsPrimaryCategory,
  market: StandardsMarket,
  tertiary: FrameworkFilter,
): StandardsQuery | "empty" {
  if (primary === "listing-rules") {
    return "empty";
  }

  if (market === "ifrs") {
    if (tertiary === "IFRS" || tertiary === "IAS") {
      return {
        framework: tertiary,
        postFilter: () => true,
      };
    }

    return {
      framework: null,
      postFilter: (standard) =>
        standard.framework === "IFRS" || standard.framework === "IAS",
    };
  }

  return {
    framework: "ASC",
    postFilter: (standard) => standard.framework === "ASC",
  };
}

export function navigationForStandard(standard: StandardSummary): {
  primary: StandardsPrimaryCategory;
  market: StandardsMarket;
  tertiary: FrameworkFilter;
} {
  if (standard.framework === "ASC") {
    return {
      primary: "accounting-standards",
      market: "us-gaap",
      tertiary: "ASC",
    };
  }

  if (standard.framework === "IAS") {
    return {
      primary: "accounting-standards",
      market: "ifrs",
      tertiary: "IAS",
    };
  }

  return {
    primary: "accounting-standards",
    market: "ifrs",
    tertiary: "IFRS",
  };
}

export function emptyStandardsMessage(
  primary: StandardsPrimaryCategory,
  market: StandardsMarket,
): string {
  if (primary === "listing-rules") {
    return `Listing Rules（${market === "ifrs" ? "IFRS" : "US GAAP"}）内容即将上线。`;
  }

  return "当前筛选条件下没有准则。可尝试切换分类或勾选「显示旧准则」。";
}

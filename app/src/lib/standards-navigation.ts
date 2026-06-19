import type { FrameworkFilter, StandardSummary } from "../types";

export type StandardsPrimaryCategory = "accounting-standards" | "listing-rules";
export type AccountingMarket = "ifrs" | "us-gaap";
export type ListingMarket = "hk" | "us";
export type StandardsSecondary = AccountingMarket | ListingMarket;

export interface StandardsNavOption<T extends string> {
  id: T;
  label: string;
}

export const PRIMARY_CATEGORIES: StandardsNavOption<StandardsPrimaryCategory>[] = [
  { id: "accounting-standards", label: "Accounting Standards" },
  { id: "listing-rules", label: "Listing Rules" },
];

export const ACCOUNTING_MARKETS: StandardsNavOption<AccountingMarket>[] = [
  { id: "ifrs", label: "IFRS" },
  { id: "us-gaap", label: "US GAAP" },
];

export const LISTING_MARKETS: StandardsNavOption<ListingMarket>[] = [
  { id: "hk", label: "HK" },
  { id: "us", label: "US" },
];

export interface StandardsQuery {
  framework: string | null;
  postFilter: (standard: StandardSummary) => boolean;
}

export function isAccountingMarket(
  secondary: StandardsSecondary,
): secondary is AccountingMarket {
  return secondary === "ifrs" || secondary === "us-gaap";
}

export function secondaryOptions(
  primary: StandardsPrimaryCategory,
): StandardsNavOption<StandardsSecondary>[] {
  return primary === "listing-rules" ? LISTING_MARKETS : ACCOUNTING_MARKETS;
}

export function secondaryFieldLabel(primary: StandardsPrimaryCategory): string {
  return primary === "listing-rules" ? "Market" : "Standards System";
}

export function secondaryLabel(
  primary: StandardsPrimaryCategory,
  secondary: StandardsSecondary,
): string {
  const options = secondaryOptions(primary);
  return options.find((item) => item.id === secondary)?.label ?? secondary;
}

export function tertiaryLabel(tertiary: FrameworkFilter): string {
  if (tertiary === "ALL") {
    return "All";
  }
  return tertiary;
}

export function standardsBreadcrumb(
  primary: StandardsPrimaryCategory,
  secondary: StandardsSecondary,
  tertiary: FrameworkFilter,
): string {
  const parts = [
    PRIMARY_CATEGORIES.find((item) => item.id === primary)?.label ?? primary,
    secondaryLabel(primary, secondary),
  ];
  if (primary === "accounting-standards") {
    parts.push(tertiaryLabel(tertiary));
  }
  return parts.join(" › ");
}

export function defaultSecondary(primary: StandardsPrimaryCategory): StandardsSecondary {
  return primary === "listing-rules" ? "hk" : "ifrs";
}

export function tertiaryOptions(
  primary: StandardsPrimaryCategory,
  secondary: StandardsSecondary,
): StandardsNavOption<FrameworkFilter>[] {
  if (primary === "listing-rules") {
    return [];
  }

  if (secondary === "ifrs") {
    return [
      { id: "ALL", label: "All" },
      { id: "IFRS", label: "IFRS" },
      { id: "IAS", label: "IAS" },
    ];
  }

  return [{ id: "ASC", label: "ASC" }];
}

export function defaultTertiary(
  primary: StandardsPrimaryCategory,
  secondary: StandardsSecondary,
): FrameworkFilter {
  if (primary === "listing-rules") {
    return "ALL";
  }
  return secondary === "ifrs" ? "ALL" : "ASC";
}

export function resolveStandardsQuery(
  primary: StandardsPrimaryCategory,
  secondary: StandardsSecondary,
  tertiary: FrameworkFilter,
): StandardsQuery | "empty" {
  if (primary === "listing-rules" || !isAccountingMarket(secondary)) {
    return "empty";
  }

  if (secondary === "ifrs") {
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
  secondary: StandardsSecondary;
  tertiary: FrameworkFilter;
} {
  if (standard.framework === "ASC") {
    return {
      primary: "accounting-standards",
      secondary: "us-gaap",
      tertiary: "ASC",
    };
  }

  if (standard.framework === "IAS") {
    return {
      primary: "accounting-standards",
      secondary: "ifrs",
      tertiary: "IAS",
    };
  }

  return {
    primary: "accounting-standards",
    secondary: "ifrs",
    tertiary: "IFRS",
  };
}

export function emptyStandardsMessage(
  primary: StandardsPrimaryCategory,
  secondary: StandardsSecondary,
): string {
  if (primary === "listing-rules") {
    return `Listing rules for ${secondaryLabel(primary, secondary)} are coming soon. Browse Accounting Standards in the meantime.`;
  }

  return "No standards match the current filters. Try another series or enable legacy standards.";
}

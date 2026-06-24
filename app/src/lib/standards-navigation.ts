import type { CategoryMeta, FrameworkFilter, StandardSummary } from "../types";

export interface StandardsNavOption<T extends string> {
  id: T;
  label: string;
}

// ── Primary categories (from pack data) ──

export function buildPrimaryCategories(
  meta: CategoryMeta[],
): StandardsNavOption<string>[] {
  return meta.map((item) => ({ id: item.id, label: item.id }));
}

// ── Secondary (framework) options per primary category ──

export function secondaryOptionsForCategory(
  primary: string,
  meta: CategoryMeta[],
): StandardsNavOption<string>[] {
  const cat = meta.find((item) => item.id === primary);
  return (cat?.frameworks ?? []).map((fw) => ({ id: fw, label: fw }));
}

export function secondaryFieldLabel(primary: string): string {
  return primary === "listing-rules" ? "Market" : "Standards System";
}

export function secondaryLabel(
  primary: string,
  secondary: string,
  meta: CategoryMeta[],
): string {
  const opts = secondaryOptionsForCategory(primary, meta);
  return opts.find((item) => item.id === secondary)?.label ?? secondary;
}

// ── Tertiary (sub-series within a framework) ──

export function tertiaryOptions(
  primary: string,
  secondary: string,
): StandardsNavOption<FrameworkFilter>[] {
  if (primary !== "accounting-standards") {
    return [];
  }
  if (secondary === "IFRS") {
    return [
      { id: "ALL", label: "All" },
      { id: "IFRS", label: "IFRS" },
      { id: "IAS", label: "IAS" },
    ];
  }
  return [{ id: secondary, label: secondary }];
}

export function tertiaryLabel(tertiary: FrameworkFilter): string {
  if (tertiary === "ALL") {
    return "All";
  }
  return tertiary;
}

// ── Breadcrumb ──

export function standardsBreadcrumb(
  primary: string,
  secondary: string,
  tertiary: FrameworkFilter,
  meta: CategoryMeta[],
): string {
  const parts = [
    buildPrimaryCategories(meta).find((item) => item.id === primary)?.label ?? primary,
    secondaryLabel(primary, secondary, meta),
  ];
  if (primary === "accounting-standards") {
    parts.push(tertiaryLabel(tertiary));
  }
  return parts.join(" › ");
}

// ── Defaults ──

export function defaultSecondary(
  primary: string,
  meta: CategoryMeta[],
): string {
  const cat = meta.find((item) => item.id === primary);
  const first = cat?.frameworks[0];
  return first ?? "ALL";
}

export function defaultTertiary(
  primary: string,
  secondary: string,
): FrameworkFilter {
  if (primary !== "accounting-standards") {
    return "ALL";
  }
  return secondary === "IFRS" ? "ALL" : secondary;
}

// ── Resolve navigation → backend query ──

export interface StandardsQuery {
  framework: string | null;
  postFilter: (standard: StandardSummary) => boolean;
}

export function resolveStandardsQuery(
  primary: string,
  secondary: string,
  tertiary: FrameworkFilter,
): StandardsQuery | "empty" {
  if (primary === "accounting-standards") {
    if (secondary === "IFRS") {
      if (tertiary === "IFRS" || tertiary === "IAS") {
        return { framework: tertiary, postFilter: () => true };
      }
      // tertiary === "ALL": IFRS + IAS together
      return {
        framework: null,
        postFilter: (s) => s.framework === "IFRS" || s.framework === "IAS",
      };
    }
    // ASC or IAS direct
    return { framework: secondary, postFilter: (s) => s.framework === secondary };
  }

  // All other categories: filter by the framework directly
  if (secondary === "ALL") {
    return { framework: null, postFilter: () => true };
  }
  return { framework: secondary, postFilter: () => true };
}

// ── Navigate to a specific standard ──

export function navigationForStandard(
  standard: StandardSummary,
  _meta: CategoryMeta[],
): { primary: string; secondary: string; tertiary: FrameworkFilter } {
  const category = standard.category ?? "accounting-standards";

  if (standard.framework === "ASC") {
    return { primary: category, secondary: "ASC", tertiary: "ASC" };
  }
  if (standard.framework === "IAS") {
    return { primary: category, secondary: "IFRS", tertiary: "IAS" };
  }
  // IFRS or non-accounting frameworks
  if (standard.framework === "IFRS") {
    return { primary: category, secondary: "IFRS", tertiary: "IFRS" };
  }
  // Unknown framework: use as secondary, default tertiary
  return { primary: category, secondary: standard.framework, tertiary: "ALL" };
}

// ── Empty state messages ──

export function emptyStandardsMessage(primary: string, secondary: string): string {
  if (primary !== "accounting-standards") {
    return `Content for ${secondary} is coming soon. Browse Accounting Standards in the meantime.`;
  }
  return "No standards match the current filters. Try another series or enable legacy standards.";
}

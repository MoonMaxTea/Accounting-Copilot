import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../context/PreferencesContext";
import { navLabel } from "../lib/i18n";
import { IconChevronDown, IconFilter } from "./icons";
import { FilterSelect } from "./FilterSelect";
import {
  PRIMARY_CATEGORIES,
  secondaryOptions,
  type StandardsPrimaryCategory,
  type StandardsSecondary,
  tertiaryOptions,
} from "../lib/standards-navigation";
import type { FrameworkFilter } from "../types";

interface StandardsCategoryNavProps {
  primary: StandardsPrimaryCategory;
  secondary: StandardsSecondary;
  tertiary: FrameworkFilter;
  includeLegacy: boolean;
  onPrimaryChange: (value: StandardsPrimaryCategory) => void;
  onSecondaryChange: (value: StandardsSecondary) => void;
  onTertiaryChange: (value: FrameworkFilter) => void;
  onIncludeLegacyChange: (value: boolean) => void;
}

export function StandardsCategoryNav({
  primary,
  secondary,
  tertiary,
  includeLegacy,
  onPrimaryChange,
  onSecondaryChange,
  onTertiaryChange,
  onIncludeLegacyChange,
}: StandardsCategoryNavProps) {
  const { tr, locale } = usePreferences();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const breadcrumb = [
    navLabel(locale, primary),
    navLabel(locale, secondary),
    ...(primary === "accounting-standards" && tertiary !== "ALL"
      ? [navLabel(locale, tertiary)]
      : []),
  ].join(" › ");
  const tertiaryChoices = tertiaryOptions(primary, secondary);

  useEffect(() => {
    if (!open) {
      return;
    }

    const close = () => setOpen(false);
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-brand-border bg-brand-surface px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-brand-muted">{tr("browse")}</p>
        <p className="truncate text-sm font-medium text-brand-ink">{breadcrumb}</p>
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="ui-focus-ring inline-flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm font-medium text-brand-ink hover:bg-brand-hover"
      >
        <IconFilter className="h-4 w-4" />
        {tr("filters")}
        <IconChevronDown className={["h-4 w-4 transition", open ? "rotate-180" : ""].join(" ")} />
      </button>

      {primary === "accounting-standards" && (
        <label className="inline-flex items-center gap-2 text-sm text-brand-ink">
          <input
            type="checkbox"
            checked={includeLegacy}
            onChange={(event) => onIncludeLegacyChange(event.target.checked)}
            className="rounded border-brand-border text-brand-ink focus:ring-brand-accent"
          />
          {tr("includeLegacy")}
        </label>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 rounded-xl border border-brand-border bg-brand-surface p-4 shadow-lg">
          <div className="grid gap-3 sm:grid-cols-3">
            <FilterSelect
              label={tr("contentType")}
              value={primary}
              options={PRIMARY_CATEGORIES.map((item) => ({
                id: item.id,
                label: navLabel(locale, item.id),
              }))}
              onChange={onPrimaryChange}
            />
            <FilterSelect
              label={primary === "listing-rules" ? tr("market") : tr("standardsSystem")}
              value={secondary}
              options={secondaryOptions(primary).map((item) => ({
                id: item.id,
                label: navLabel(locale, item.id),
              }))}
              onChange={onSecondaryChange}
            />
            {tertiaryChoices.length > 0 && (
              <FilterSelect
                label={tr("specificSeries")}
                value={tertiary}
                options={tertiaryChoices.map((item) => ({
                  id: item.id,
                  label: navLabel(locale, item.id),
                }))}
                onChange={onTertiaryChange}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

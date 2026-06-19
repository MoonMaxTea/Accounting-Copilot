import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconFilter } from "./icons";
import { FilterSelect } from "./FilterSelect";
import {
  PRIMARY_CATEGORIES,
  secondaryFieldLabel,
  secondaryOptions,
  standardsBreadcrumb,
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const breadcrumb = standardsBreadcrumb(primary, secondary, tertiary);
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
      className="relative flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500">Browse</p>
        <p className="truncate text-sm font-medium text-slate-900">{breadcrumb}</p>
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="ui-focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        <IconFilter className="h-4 w-4" />
        Filters
        <IconChevronDown className={["h-4 w-4 transition", open ? "rotate-180" : ""].join(" ")} />
      </button>

      {primary === "accounting-standards" && (
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeLegacy}
            onChange={(event) => onIncludeLegacyChange(event.target.checked)}
            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          Include legacy
        </label>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="grid gap-3 sm:grid-cols-3">
            <FilterSelect
              label="Content Type"
              value={primary}
              options={PRIMARY_CATEGORIES}
              onChange={onPrimaryChange}
            />
            <FilterSelect
              label={secondaryFieldLabel(primary)}
              value={secondary}
              options={secondaryOptions(primary)}
              onChange={onSecondaryChange}
            />
            {tertiaryChoices.length > 0 && (
              <FilterSelect
                label="Specific Series"
                value={tertiary}
                options={tertiaryChoices}
                onChange={onTertiaryChange}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

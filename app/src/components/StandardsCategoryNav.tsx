import type { FrameworkFilter } from "../types";
import { FilterSelect } from "./FilterSelect";
import {
  PRIMARY_CATEGORIES,
  secondaryOptions,
  type StandardsPrimaryCategory,
  type StandardsSecondary,
  tertiaryOptions,
} from "../lib/standards-navigation";

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
  const secondaryChoices = secondaryOptions(primary);
  const tertiaryChoices = tertiaryOptions(primary, secondary);
  const secondaryLabelText = primary === "listing-rules" ? "市场" : "准则体系";

  return (
    <div className="shrink-0 rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 px-3 py-3 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="一级分类"
          value={primary}
          options={PRIMARY_CATEGORIES}
          onChange={onPrimaryChange}
        />
        <FilterSelect
          label={`二级分类 · ${secondaryLabelText}`}
          value={secondary}
          options={secondaryChoices}
          onChange={onSecondaryChange}
        />
        {tertiaryChoices.length > 0 && (
          <FilterSelect
            label="三级分类"
            value={tertiary}
            options={tertiaryChoices}
            onChange={onTertiaryChange}
          />
        )}

        {primary === "accounting-standards" && (
          <label className="ml-auto flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
            <input
              type="checkbox"
              checked={includeLegacy}
              onChange={(event) => onIncludeLegacyChange(event.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            显示旧准则
          </label>
        )}
      </div>

      {primary === "listing-rules" && (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Listing Rules 按上市市场分类（如 HK、US），细则内容将陆续加入。
        </p>
      )}
    </div>
  );
}

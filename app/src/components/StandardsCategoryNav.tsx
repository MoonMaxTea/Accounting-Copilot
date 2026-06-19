import type { FrameworkFilter } from "../types";
import {
  MARKETS,
  PRIMARY_CATEGORIES,
  type StandardsMarket,
  type StandardsPrimaryCategory,
  tertiaryOptions,
} from "../lib/standards-navigation";

interface StandardsCategoryNavProps {
  primary: StandardsPrimaryCategory;
  market: StandardsMarket;
  tertiary: FrameworkFilter;
  includeLegacy: boolean;
  onPrimaryChange: (value: StandardsPrimaryCategory) => void;
  onMarketChange: (value: StandardsMarket) => void;
  onTertiaryChange: (value: FrameworkFilter) => void;
  onIncludeLegacyChange: (value: boolean) => void;
}

interface FilterSelectProps<T extends string> {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: FilterSelectProps<T>) {
  return (
    <label className="flex min-w-[9.5rem] flex-1 flex-col gap-1 sm:max-w-[13rem]">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-slate-900 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StandardsCategoryNav({
  primary,
  market,
  tertiary,
  includeLegacy,
  onPrimaryChange,
  onMarketChange,
  onTertiaryChange,
  onIncludeLegacyChange,
}: StandardsCategoryNavProps) {
  const tertiaryChoices = tertiaryOptions(primary, market);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <FilterSelect
        label="一级分类"
        value={primary}
        options={PRIMARY_CATEGORIES}
        onChange={onPrimaryChange}
      />
      <FilterSelect
        label="二级分类"
        value={market}
        options={MARKETS}
        onChange={onMarketChange}
      />
      {tertiaryChoices.length > 0 && (
        <FilterSelect
          label="三级分类"
          value={tertiary}
          options={tertiaryChoices}
          onChange={onTertiaryChange}
        />
      )}

      <label className="ml-auto flex shrink-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
        <input
          type="checkbox"
          checked={includeLegacy}
          onChange={(event) => onIncludeLegacyChange(event.target.checked)}
        />
        显示旧准则
      </label>

      {primary === "listing-rules" && (
        <p className="w-full text-xs text-slate-500">
          Listing Rules 各市场细则将陆续加入，当前可先浏览 Accounting Standards。
        </p>
      )}
    </div>
  );
}

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

function NavButton({
  active,
  label,
  onClick,
  size = "md",
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  size?: "lg" | "md" | "sm";
}) {
  const sizeClass =
    size === "lg"
      ? "px-5 py-2.5 text-sm"
      : size === "sm"
        ? "px-3 py-1.5 text-xs"
        : "px-4 py-2 text-sm";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full font-medium transition",
        sizeClass,
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-400",
      ].join(" ")}
    >
      {label}
    </button>
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
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
          一级分类
        </p>
        <div className="flex flex-wrap gap-2">
          {PRIMARY_CATEGORIES.map((item) => (
            <NavButton
              key={item.id}
              size="lg"
              active={primary === item.id}
              label={item.label}
              onClick={() => onPrimaryChange(item.id)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
          二级分类
        </p>
        <div className="flex flex-wrap gap-2">
          {MARKETS.map((item) => (
            <NavButton
              key={item.id}
              size="md"
              active={market === item.id}
              label={item.label}
              onClick={() => onMarketChange(item.id)}
            />
          ))}
        </div>
      </div>

      {tertiaryChoices.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            三级分类
          </p>
          <div className="flex flex-wrap gap-2">
            {tertiaryChoices.map((item) => (
              <NavButton
                key={item.id}
                size="sm"
                active={tertiary === item.id}
                label={item.label}
                onClick={() => onTertiaryChange(item.id)}
              />
            ))}
          </div>
        </div>
      )}

      {primary === "listing-rules" && (
        <p className="border-t border-slate-100 pt-3 text-sm text-slate-500">
          Listing Rules 各市场的细则将陆续加入，当前可先浏览 Accounting Standards。
        </p>
      )}

      <div className="flex justify-end border-t border-slate-100 pt-3">
        <label className="flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
          <input
            type="checkbox"
            checked={includeLegacy}
            onChange={(event) => onIncludeLegacyChange(event.target.checked)}
          />
          显示旧准则
        </label>
      </div>
    </div>
  );
}

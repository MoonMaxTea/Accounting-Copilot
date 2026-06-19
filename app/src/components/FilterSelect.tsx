import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "./icons";

export interface FilterSelectOption<T extends string> {
  id: T;
  label: string;
}

interface FilterSelectProps<T extends string> {
  label: string;
  value: T;
  options: FilterSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: FilterSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((item) => item.id === value);

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
    <div ref={rootRef} className="relative min-w-[10rem] flex-1 sm:max-w-[14rem]">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        className={[
          "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ui-focus-ring",
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
            : open
              ? "border-slate-900 bg-white text-slate-900 shadow-sm ring-2 ring-slate-900/10"
              : "border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50",
        ].join(" ")}
      >
        <span className="truncate font-medium">{selected?.label ?? "Select"}</span>
        <IconChevronDown
          className={["h-4 w-4 text-slate-400 transition", open ? "rotate-180" : ""].join(" ")}
        />
      </button>

      {open && !disabled && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-slate-900/5"
        >
          {options.map((item) => {
            const active = item.id === value;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                >
                  <span>{item.label}</span>
                  {active && <span className="text-xs">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { usePreferences } from "../context/PreferencesContext";

interface WordmarkProps {
  variant?: "header" | "hero" | "mark";
  className?: string;
}

export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={className}
    >
      <rect x="1" y="1" width="38" height="38" rx="8" fill="#1B2838" />
      <rect
        x="5"
        y="5"
        width="30"
        height="30"
        rx="5"
        fill="none"
        stroke="#C7D0DB"
        strokeWidth="1"
        opacity="0.55"
      />
      <text
        x="20"
        y="24.5"
        textAnchor="middle"
        fill="#F8FAFC"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="13"
        fontWeight="700"
        letterSpacing="0.8"
      >
        AC
      </text>
      <path d="M9 31.5h22" stroke="#9AA8B8" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ variant = "header", className = "" }: WordmarkProps) {
  const { tr } = usePreferences();
  if (variant === "mark") {
    return (
      <div className={className}>
        <BrandMark />
      </div>
    );
  }

  const titleClass =
    variant === "hero"
      ? "text-2xl font-semibold tracking-tight text-brand-ink"
      : "text-base font-semibold tracking-tight text-brand-ink";

  return (
    <div className={["flex items-center gap-3", className].join(" ")}>
      <BrandMark className={variant === "hero" ? "h-10 w-10" : "h-8 w-8"} />
      <div className="min-w-0">
        <div className={titleClass}>
          <span>Accounting </span>
          <span className="font-normal text-brand-steel">Copilot</span>
        </div>
        {variant === "hero" ? (
          <p className="mt-1 text-caption tracking-[0.18em] text-brand-muted uppercase">
            {tr("tagline")}
          </p>
        ) : (
          <p className="hidden text-caption text-brand-muted sm:block">
            {tr("tagline")}
          </p>
        )}
      </div>
    </div>
  );
}

interface WordmarkProps {
  variant?: "header" | "hero" | "mark";
  className?: string;
}

function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
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
      <path
        d="M11 27V13h4.2c2.8 0 4.6 1.5 4.6 3.9 0 2.1-1.3 3.4-3.2 3.7L21.8 27H18l-2.8-5.6H14.2V27H11Zm3.2-8.3h1c1.2 0 1.9-.6 1.9-1.6 0-1-.7-1.6-1.9-1.6h-1v3.2Z"
        fill="#F8FAFC"
      />
      <path
        d="M22.5 27V13H27l3.4 9.1h.1L33.8 13H38v14h-3.2v-9.2h-.1L31 27h-2.9l-3.6-9.2h-.1V27h-3.2Z"
        fill="#F8FAFC"
      />
      <path d="M9 31.5h22" stroke="#9AA8B8" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ variant = "header", className = "" }: WordmarkProps) {
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
            Standards · Workpapers · Review
          </p>
        ) : (
          <p className="hidden text-caption text-brand-muted sm:block">
            Standards · Workpapers · Review
          </p>
        )}
      </div>
    </div>
  );
}

import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </BaseIcon>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </BaseIcon>
  );
}

export function IconFile(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </BaseIcon>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </BaseIcon>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m9 6 6 6-6 6" />
    </BaseIcon>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m15 6-6 6 6 6" />
    </BaseIcon>
  );
}

export function IconPin(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 17v5" />
      <path d="M9 3h6l1 7h-8l1-7Z" />
      <path d="M9 10v2.5L7 17h10l-2-4.5V10" />
    </BaseIcon>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.5-2-3.5-2.3 1a8 8 0 0 0-1.7-1L15 3h-4l-.5 2.5a8 8 0 0 0-1.7 1l-2.3-1-2 3.5 2 1.5a7.8 7.8 0 0 0 .1 2l-2 1.5 2 3.5 2.3-1a8 8 0 0 0 1.7 1L11 21h4l.5-2.5a8 8 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5Z" />
    </BaseIcon>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </BaseIcon>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </BaseIcon>
  );
}

export function IconGrip(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="9" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="19" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="19" r="1" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function IconSparkles(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3 13.5 8.5 19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" />
      <path d="M5 3v2M19 19v2M3 5h2M19 19h2" />
    </BaseIcon>
  );
}

export function IconBook(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </BaseIcon>
  );
}

export function IconSun(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </BaseIcon>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z" />
    </BaseIcon>
  );
}

export function IconMinimize(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 12h14" />
    </BaseIcon>
  );
}

export function IconMaximize(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="5" y="5" width="14" height="14" rx="1" />
    </BaseIcon>
  );
}

export function IconRestore(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 3v3H5" />
      <path d="M5 8h3V5" />
      <rect x="9" y="9" width="10" height="10" rx="1" />
      <path d="M16 3h5v5" />
      <path d="M21 8h-3V5" />
    </BaseIcon>
  );
}

export function IconClose(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </BaseIcon>
  );
}

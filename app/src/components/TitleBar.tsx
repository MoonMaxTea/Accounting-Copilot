import { useEffect, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { usePreferences } from "../context/PreferencesContext";
import type { AppTab } from "../types";
import { BrandMark } from "./Wordmark";
import {
  IconClose,
  IconMaximize,
  IconMinimize,
  IconMoon,
  IconRestore,
  IconSun,
} from "./icons";

interface TitleBarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  showNav: boolean;
  packLoaded?: boolean;
}

function TitleBarButton({
  title,
  active = false,
  onClick,
  children,
  className = "",
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={[
        "ui-focus-ring flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium transition",
        active
          ? "bg-brand-accent/15 text-brand-accent"
          : "text-brand-muted hover:bg-brand-hover hover:text-brand-ink",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function WindowControl({
  title,
  onClick,
  children,
  danger = false,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={[
        "ui-focus-ring flex h-10 w-11 items-center justify-center transition",
        danger
          ? "hover:bg-red-500 hover:text-white"
          : "text-brand-muted hover:bg-brand-hover hover:text-brand-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function TitleBar({ activeTab, onTabChange, showNav, packLoaded = false }: TitleBarProps) {
  const { locale, theme, toggleLocale, toggleTheme, tr } = usePreferences();
  const [desktop, setDesktop] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    setDesktop(isTauri());
    if (!isTauri()) {
      return;
    }

    const window = getCurrentWindow();
    void window.isMaximized().then(setMaximized);

    const unlistenPromise = window.onResized(async () => {
      setMaximized(await window.isMaximized());
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const tabLabel = (tab: AppTab): string => {
    switch (tab) {
      case "standards":
        return tr("standards");
      case "settings":
        return tr("settings");
      default:
        return tr("workbench");
    }
  };

  const navTabs: AppTab[] = !showNav
    ? []
    : packLoaded
      ? ["evidence", "standards", "settings"]
      : ["settings"];

  const handleMinimize = () => {
    void getCurrentWindow().minimize();
  };

  const handleToggleMaximize = () => {
    void getCurrentWindow().toggleMaximize();
  };

  const handleClose = () => {
    void getCurrentWindow().close();
  };

  return (
    <header className="flex h-10 shrink-0 items-stretch border-b border-brand-border bg-brand-titlebar">
      <div
        data-tauri-drag-region
        className="flex min-w-0 items-center gap-2 pl-3 text-xs text-brand-muted select-none"
      >
        <BrandMark className="h-5 w-5 shrink-0" />
        <span className="hidden truncate font-medium text-brand-ink sm:inline">
          Accounting Copilot
        </span>
      </div>

      {showNav && (
        <nav
          aria-label={tr("mainNavigation")}
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2"
        >
          {navTabs.map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onTabChange(tab)}
                className={[
                  "ui-focus-ring relative shrink-0 px-3 py-2 text-sm font-medium transition",
                  active ? "text-brand-ink" : "text-brand-muted hover:text-brand-ink",
                ].join(" ")}
              >
                {tabLabel(tab)}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-accent" />
                )}
              </button>
            );
          })}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-0.5 px-1">
        <TitleBarButton
          title={locale === "en" ? tr("switchToChinese") : tr("switchToEnglish")}
          onClick={toggleLocale}
        >
          {locale === "en" ? "中" : "EN"}
        </TitleBarButton>

        <TitleBarButton
          title={theme === "light" ? tr("darkMode") : tr("lightMode")}
          onClick={toggleTheme}
        >
          {theme === "light" ? (
            <IconMoon className="h-4 w-4" />
          ) : (
            <IconSun className="h-4 w-4" />
          )}
        </TitleBarButton>
      </div>

      {desktop && (
        <div className="flex items-stretch pl-1">
          <WindowControl title={tr("minimize")} onClick={handleMinimize}>
            <IconMinimize className="h-3 w-3" />
          </WindowControl>
          <WindowControl
            title={maximized ? tr("windowRestore") : tr("maximize")}
            onClick={handleToggleMaximize}
          >
            {maximized ? (
              <IconRestore className="h-3 w-3" />
            ) : (
              <IconMaximize className="h-3 w-3" />
            )}
          </WindowControl>
          <WindowControl title={tr("close")} onClick={handleClose} danger>
            <IconClose className="h-3.5 w-3.5" />
          </WindowControl>
        </div>
      )}
    </header>
  );
}

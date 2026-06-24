import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePreferences } from "../context/PreferencesContext";

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  resolve: (value: boolean) => void;
}

interface PromptRequest {
  title: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (value: string | null) => void;
}

interface DialogContextValue {
  confirm: (options: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
  }) => Promise<boolean>;
  prompt: (options: {
    title: string;
    label: string;
    defaultValue?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogEscape(onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onClose]);
}

function useInitialFocus<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T | null>(null);
  useEffect(() => {
    if (!active || !containerRef.current) {
      return;
    }
    const focusable = containerRef.current.querySelector<HTMLElement>(
      'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [active]);
  return containerRef;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const { tr } = usePreferences();
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const confirm = useCallback<DialogContextValue["confirm"]>((options) => {
    return new Promise((resolve) => {
      setConfirmRequest({ ...options, resolve });
    });
  }, []);

  const prompt = useCallback<DialogContextValue["prompt"]>((options) => {
    return new Promise((resolve) => {
      setPromptValue(options.defaultValue ?? "");
      setPromptRequest({ ...options, resolve });
    });
  }, []);

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  const closeConfirm = useCallback(
    (result: boolean) => {
      if (!confirmRequest) {
        return;
      }
      confirmRequest.resolve(result);
      setConfirmRequest(null);
    },
    [confirmRequest],
  );

  const closePrompt = useCallback(
    (result: string | null) => {
      if (!promptRequest) {
        return;
      }
      promptRequest.resolve(result);
      setPromptRequest(null);
    },
    [promptRequest],
  );

  const confirmTitleId = "confirm-dialog-title";
  const confirmDescId = "confirm-dialog-desc";
  const promptTitleId = "prompt-dialog-title";

  useDialogEscape(() => closeConfirm(false), Boolean(confirmRequest));
  useDialogEscape(() => closePrompt(null), Boolean(promptRequest));
  const confirmRef = useInitialFocus<HTMLDivElement>(Boolean(confirmRequest));
  const promptRef = useInitialFocus<HTMLFormElement>(Boolean(promptRequest));

  return (
    <DialogContext.Provider value={value}>
      {children}

      {confirmRequest && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-ink/50 p-4 dark:bg-black/60"
          onClick={() => closeConfirm(false)}
        >
          <div
            ref={confirmRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            aria-describedby={confirmDescId}
            className="w-full max-w-md rounded-lg border border-brand-border bg-brand-surface p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={confirmTitleId} className="text-base font-semibold text-brand-ink">
              {confirmRequest.title}
            </h2>
            <p id={confirmDescId} className="mt-2 text-sm leading-6 text-brand-muted">
              {confirmRequest.message}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="ui-focus-ring rounded-lg px-4 py-2 text-sm text-brand-ink hover:bg-brand-hover"
                onClick={() => closeConfirm(false)}
              >
                {confirmRequest.cancelLabel ?? tr("cancel")}
              </button>
              <button
                type="button"
                className={[
                  "ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium text-white",
                  confirmRequest.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "ui-btn-primary",
                ].join(" ")}
                onClick={() => closeConfirm(true)}
              >
                {confirmRequest.confirmLabel ?? tr("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptRequest && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-ink/50 p-4 dark:bg-black/60"
          onClick={() => closePrompt(null)}
        >
          <form
            ref={promptRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={promptTitleId}
            className="w-full max-w-md rounded-lg border border-brand-border bg-brand-surface p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = promptValue.trim();
              closePrompt(trimmed.length > 0 ? trimmed : null);
            }}
          >
            <h2 id={promptTitleId} className="text-base font-semibold text-brand-ink">
              {promptRequest.title}
            </h2>
            <label className="mt-4 block space-y-2">
              <span className="text-sm font-medium text-brand-ink">{promptRequest.label}</span>
              <input
                autoFocus
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                className="ui-input ui-focus-ring w-full rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="ui-focus-ring rounded-lg px-4 py-2 text-sm text-brand-ink hover:bg-brand-hover"
                onClick={() => closePrompt(null)}
              >
                {promptRequest.cancelLabel ?? tr("cancel")}
              </button>
              <button
                type="submit"
                className="ui-btn-primary ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium"
              >
                {promptRequest.confirmLabel ?? tr("save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within DialogProvider");
  }
  return context;
}

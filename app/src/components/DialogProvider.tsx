import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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

  return (
    <DialogContext.Provider value={value}>
      {children}

      {confirmRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-ink dark:bg-brand-accent/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-brand-border bg-brand-surface p-5 shadow-xl"
          >
            <h2 className="text-base font-semibold text-brand-ink">{confirmRequest.title}</h2>
            <p className="mt-2 text-sm leading-6 text-brand-muted">{confirmRequest.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="ui-focus-ring rounded-lg px-4 py-2 text-sm text-brand-ink hover:bg-brand-hover"
                onClick={() => {
                  confirmRequest.resolve(false);
                  setConfirmRequest(null);
                }}
              >
                {confirmRequest.cancelLabel ?? tr("cancel")}
              </button>
              <button
                type="button"
                className={[
                  "ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium text-white",
                  confirmRequest.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-brand-ink dark:bg-brand-accent hover:opacity-90",
                ].join(" ")}
                onClick={() => {
                  confirmRequest.resolve(true);
                  setConfirmRequest(null);
                }}
              >
                {confirmRequest.confirmLabel ?? tr("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-ink dark:bg-brand-accent/40 p-4">
          <form
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-brand-border bg-brand-surface p-5 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = promptValue.trim();
              promptRequest.resolve(trimmed.length > 0 ? trimmed : null);
              setPromptRequest(null);
            }}
          >
            <h2 className="text-base font-semibold text-brand-ink">{promptRequest.title}</h2>
            <label className="mt-4 block space-y-2">
              <span className="text-sm font-medium text-brand-ink">{promptRequest.label}</span>
              <input
                autoFocus
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                className="ui-focus-ring w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="ui-focus-ring rounded-lg px-4 py-2 text-sm text-brand-ink hover:bg-brand-hover"
                onClick={() => {
                  promptRequest.resolve(null);
                  setPromptRequest(null);
                }}
              >
                {promptRequest.cancelLabel ?? tr("cancel")}
              </button>
              <button
                type="submit"
                className="ui-focus-ring rounded-lg bg-brand-ink dark:bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
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

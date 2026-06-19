import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 className="text-base font-semibold text-slate-900">{confirmRequest.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{confirmRequest.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="ui-focus-ring rounded-lg px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  confirmRequest.resolve(false);
                  setConfirmRequest(null);
                }}
              >
                {confirmRequest.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                className={[
                  "ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium text-white",
                  confirmRequest.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-slate-900 hover:bg-slate-700",
                ].join(" ")}
                onClick={() => {
                  confirmRequest.resolve(true);
                  setConfirmRequest(null);
                }}
              >
                {confirmRequest.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
          <form
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = promptValue.trim();
              promptRequest.resolve(trimmed.length > 0 ? trimmed : null);
              setPromptRequest(null);
            }}
          >
            <h2 className="text-base font-semibold text-slate-900">{promptRequest.title}</h2>
            <label className="mt-4 block space-y-2">
              <span className="text-sm font-medium text-slate-700">{promptRequest.label}</span>
              <input
                autoFocus
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                className="ui-focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="ui-focus-ring rounded-lg px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  promptRequest.resolve(null);
                  setPromptRequest(null);
                }}
              >
                {promptRequest.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="submit"
                className="ui-focus-ring rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                {promptRequest.confirmLabel ?? "Save"}
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

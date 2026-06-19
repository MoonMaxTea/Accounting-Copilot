import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { ContentDownloadProgress } from "../types";

export function useContentDownloadProgress(active: boolean): ContentDownloadProgress | null {
  const [progress, setProgress] = useState<ContentDownloadProgress | null>(null);

  useEffect(() => {
    if (!active) {
      setProgress(null);
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<ContentDownloadProgress>("content-download-progress", (event) => {
      if (disposed) {
        return;
      }
      if (event.payload.phase === "idle") {
        setProgress(null);
        return;
      }
      setProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
      setProgress(null);
    };
  }, [active]);

  return progress;
}

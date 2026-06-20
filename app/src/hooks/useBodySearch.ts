import { useCallback, useEffect, useRef, useState } from "react";

export interface BodySearchResult {
  query: string;
  setQuery: (q: string) => void;
  currentIndex: number;
  totalMatches: number;
  goToNext: () => void;
  goToPrev: () => void;
  clearSearch: () => void;
  bodyRef: React.RefObject<HTMLDivElement | null>;
}

const MARK_CLASS = "body-search-mark";
const MARK_CURRENT_CLASS = "body-search-mark-current";
const DEBOUNCE_MS = 250;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Walks text nodes inside a container, wraps regex matches in <mark> elements,
 * and tracks the marks for navigation.  When the query or body content changes
 * the old marks are removed and new ones applied.
 *
 * Returns a ref to attach to the scrollable body container, along with
 * search state and navigation helpers.
 */
export function useBodySearch(body?: string): BodySearchResult {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const marksRef = useRef<HTMLElement[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQueryState] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);

  // Debounced query setter
  const setQuery = useCallback((q: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setQueryState(q.trim());
    }, DEBOUNCE_MS);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      cleanupRef.current?.();
    };
  }, []);

  // Main highlight effect — runs when query or body changes
  useEffect(() => {
    // Always clean up previous marks first
    cleanupRef.current?.();
    cleanupRef.current = null;
    marksRef.current = [];
    setCurrentIndex(0);

    if (!query || !bodyRef.current || !body) {
      setTotalMatches(0);
      return;
    }

    const container = bodyRef.current;
    const regex = new RegExp(escapeRegex(query), "gi");
    const newMarks: HTMLElement[] = [];

    // Collect all text nodes first
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let tn: Text | null;
    while ((tn = walker.nextNode() as Text | null)) {
      textNodes.push(tn);
    }

    // Replace text nodes with fragments containing <mark> elements
    for (const textNode of textNodes) {
      const text = textNode.textContent ?? "";
      if (!text) continue;

      regex.lastIndex = 0;

      const fragments: Array<Node> = [];
      let lastIdx = 0;
      let m: RegExpExecArray | null;

      while ((m = regex.exec(text)) !== null) {
        const ms = m.index;
        const me = ms + m[0].length;

        if (ms > lastIdx) {
          fragments.push(document.createTextNode(text.slice(lastIdx, ms)));
        }

        const mark = document.createElement("mark");
        mark.className = MARK_CLASS;
        mark.textContent = m[0];
        fragments.push(mark);
        newMarks.push(mark);

        lastIdx = me;
        if (ms === me) {
          regex.lastIndex = me + 1;
        }
      }

      if (lastIdx < text.length) {
        fragments.push(document.createTextNode(text.slice(lastIdx)));
      }

      if (fragments.length > 0 && textNode.parentNode) {
        const frag = document.createDocumentFragment();
        for (const f of fragments) frag.appendChild(f);
        textNode.parentNode.replaceChild(frag, textNode);
      }
    }

    marksRef.current = newMarks;
    setTotalMatches(newMarks.length);
    setCurrentIndex(newMarks.length > 0 ? 0 : 0);

    // Scroll to first match
    if (newMarks.length > 0) {
      newMarks[0].classList.add(MARK_CURRENT_CLASS);
      newMarks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Register cleanup
    cleanupRef.current = () => {
      for (const mark of marksRef.current) {
        const parent = mark.parentNode;
        if (!parent) continue;
        const text = document.createTextNode(mark.textContent ?? "");
        parent.replaceChild(text, mark);
      }
      marksRef.current = [];
    };
  }, [query, body]);

  // Update current-mark class when currentIndex changes
  useEffect(() => {
    for (let i = 0; i < marksRef.current.length; i++) {
      if (i === currentIndex) {
        marksRef.current[i].classList.add(MARK_CURRENT_CLASS);
        marksRef.current[i].scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        marksRef.current[i].classList.remove(MARK_CURRENT_CLASS);
      }
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (marksRef.current.length < 2) return;
    setCurrentIndex((prev) => (prev + 1) % marksRef.current.length);
  }, []);

  const goToPrev = useCallback(() => {
    if (marksRef.current.length < 2) return;
    setCurrentIndex(
      (prev) => (prev - 1 + marksRef.current.length) % marksRef.current.length,
    );
  }, []);

  const clearSearch = useCallback(() => {
    setQueryState("");
  }, []);

  return {
    query,
    setQuery,
    currentIndex,
    totalMatches,
    goToNext,
    goToPrev,
    clearSearch,
    bodyRef,
  };
}

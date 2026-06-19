import { useCallback, useEffect, useRef, useState } from "react";

export function useHorizontalResize(
  initialWidth: number,
  minWidth: number,
  maxWidth: number,
) {
  const [width, setWidth] = useState(initialWidth);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      dragState.current = { startX: event.clientX, startWidth: width };
    },
    [width],
  );

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!dragState.current) {
        return;
      }
      const delta = event.clientX - dragState.current.startX;
      setWidth(
        Math.min(maxWidth, Math.max(minWidth, dragState.current.startWidth + delta)),
      );
    };
    const onMouseUp = () => {
      dragState.current = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [maxWidth, minWidth]);

  return { width, onMouseDown, dragging: dragState.current !== null };
}

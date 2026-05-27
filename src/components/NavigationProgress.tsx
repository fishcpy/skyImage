import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

type Timer = ReturnType<typeof setTimeout>;

export function NavigationProgress() {
  const location = useLocation();
  const barRef = useRef<HTMLDivElement | null>(null);
  const growTimerRef = useRef<Timer | null>(null);
  const finishTimerRef = useRef<Timer | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    if (growTimerRef.current) {
      clearTimeout(growTimerRef.current);
    }
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
    }

    bar.style.opacity = "1";
    bar.style.width = "18%";

    growTimerRef.current = setTimeout(() => {
      bar.style.width = "72%";
    }, 60);

    finishTimerRef.current = setTimeout(() => {
      bar.style.width = "100%";
      bar.style.opacity = "0";
      finishTimerRef.current = setTimeout(() => {
        if (barRef.current) {
          barRef.current.style.width = "0%";
        }
      }, 240);
    }, 280);

    return () => {
      if (growTimerRef.current) {
        clearTimeout(growTimerRef.current);
      }
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
      }
    };
  }, [location.pathname, location.search]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        ref={barRef}
        className="h-full w-0 bg-muted-foreground/85 transition-all duration-300 ease-out"
      />
    </div>
  );
}
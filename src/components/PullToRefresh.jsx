import { useState, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";

const THRESHOLD = 72;

export default function PullToRefresh({ onRefresh, children }) {
  const [pulling, setPulling] = useState(false);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const containerRef = useRef(null);

  const onTouchStart = useCallback((e) => {
    if (containerRef.current?.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0 && containerRef.current?.scrollTop === 0) {
      setPulling(true);
      setPullY(Math.min(delta * 0.5, THRESHOLD + 20));
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (pullY >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(THRESHOLD);
      await onRefresh();
      setRefreshing(false);
    }
    setPulling(false);
    setPullY(0);
    startY.current = null;
  }, [pullY, refreshing, onRefresh]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator */}
      {(pulling || refreshing) && (
        <div
          className="flex items-center justify-center transition-all duration-150"
          style={{ height: pullY }}
        >
          <div className={`flex items-center gap-2 text-sm text-muted-foreground ${refreshing ? "opacity-100" : pullY >= THRESHOLD ? "opacity-100" : "opacity-60"}`}>
            <Loader2 className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Actualizando..." : pullY >= THRESHOLD ? "Suelta para actualizar" : "Tira para actualizar"}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
import { useCallback, useEffect, useRef, useState } from "react";
import { appApi } from "@/api/app-api";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 380;
const MIN_LEN = 3;

/**
 * Dirección línea 1 con sugerencias vía `/api/address-autocomplete` (clave solo en servidor).
 * @param {{
 *   id?: string;
 *   name?: string;
 *   value: string;
 *   onChange: (v: string) => void;
 *   onPick?: (s: Record<string, string>) => void;
 *   className?: string;
 *   disabled?: boolean;
 * }} props
 */
export function BillingAddressSuggestInput({
  id,
  name,
  value,
  onChange,
  onPick,
  className,
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverConfigured, setServerConfigured] = useState(null);
  const timerRef = useRef(null);
  const rootRef = useRef(null);
  const searchSeq = useRef(0);

  const runSearch = useCallback(async (q) => {
    const mySeq = ++searchSeq.current;
    setLoading(true);
    try {
      const res = await appApi.addressAutocomplete.search(q);
      if (mySeq !== searchSeq.current) {
        return;
      }
      if (typeof res?.configured === "boolean") {
        setServerConfigured(res.configured);
      }
      const list = Array.isArray(res?.suggestions) ? res.suggestions : [];
      setSuggestions(list);
      setOpen(list.length > 0);
    } catch {
      if (mySeq !== searchSeq.current) {
        return;
      }
      setSuggestions([]);
      setOpen(false);
    } finally {
      if (mySeq === searchSeq.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const q = String(value || "").trim();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (q.length < MIN_LEN) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      runSearch(q);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, runSearch]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <Input
        id={id}
        name={name}
        className={className}
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (String(e.target.value || "").trim().length < MIN_LEN) {
            setOpen(false);
          }
        }}
        onFocus={() => {
          if (suggestions.length > 0) {
            setOpen(true);
          }
        }}
      />
      {serverConfigured === false &&
      String(value || "").trim().length >= MIN_LEN &&
      !loading ? (
        <p className="text-[11px] text-muted-foreground mt-1">
          Autocompletado de direcciones no configurado.
        </p>
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul
          className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-md text-sm"
          role="listbox"
        >
          {suggestions.map((s, idx) => (
            <li key={`${s.provider_place_id || s.label}-${idx}`}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick?.(s);
                  setOpen(false);
                }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {loading && String(value || "").trim().length >= MIN_LEN ? (
        <p className="text-[11px] text-muted-foreground mt-1">Buscando sugerencias…</p>
      ) : null}
    </div>
  );
}

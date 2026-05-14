import { useCallback, useEffect, useRef, useState } from "react";
import { appApi } from "@/api/app-api";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 400;
const MIN_LEN = 3;

/**
 * Input de dirección con sugerencias vía /api/address-autocomplete.
 * El token del proveedor vive solo en el servidor; nunca llega al navegador.
 *
 * @param {{
 *   value: string;
 *   onChange: (v: string) => void;
 *   onPick?: (s: { address_line1, city, postal_code, region, country, label }) => void;
 *   className?: string;
 *   placeholder?: string;
 *   disabled?: boolean;
 * }} props
 */
export function AddressAutocomplete({
  value,
  onChange,
  onPick,
  className,
  placeholder,
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [serverConfigured, setServerConfigured] = useState(null);
  const timerRef = useRef(null);
  const rootRef = useRef(null);
  const seqRef = useRef(0);

  const runSearch = useCallback(async (q) => {
    const mySeq = ++seqRef.current;
    setError(false);
    try {
      const res = await appApi.addressAutocomplete.search(q);
      if (mySeq !== seqRef.current) return;
      if (typeof res?.configured === "boolean") {
        setServerConfigured(res.configured);
      }
      const list = Array.isArray(res?.suggestions) ? res.suggestions : [];
      setSuggestions(list);
      setOpen(list.length > 0);
    } catch {
      if (mySeq !== seqRef.current) return;
      setSuggestions([]);
      setOpen(false);
      setError(true);
    }
  }, []);

  useEffect(() => {
    const q = String(value || "").trim();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < MIN_LEN) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, runSearch]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = String(value || "").trim();

  return (
    <div ref={rootRef} className="relative">
      <Input
        autoComplete="off"
        className={className}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (String(e.target.value || "").trim().length < MIN_LEN) setOpen(false);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
      />

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-md text-sm"
        >
          {suggestions.map((s, idx) => (
            <li key={`${s.provider_place_id || s.label}-${idx}`}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.address_line1 || value);
                  onPick?.(s);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{s.address_line1 || s.label}</span>
                {(s.postal_code || s.city) && (
                  <span className="text-muted-foreground ml-1 text-xs">
                    {[s.postal_code, s.city].filter(Boolean).join(" ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && q.length >= MIN_LEN && (
        <p className="text-[11px] text-muted-foreground mt-1">
          No se pudieron cargar sugerencias. Puedes escribir la dirección manualmente.
        </p>
      )}
      {serverConfigured === false && !error && q.length >= MIN_LEN && (
        <p className="text-[11px] text-muted-foreground mt-1">
          Autocompletado no configurado. Puedes escribir la dirección manualmente.
        </p>
      )}
    </div>
  );
}

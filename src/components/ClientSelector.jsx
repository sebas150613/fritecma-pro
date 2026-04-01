import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ClientSelector({ clients, selectedId, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef(null);

  const selectedClient = clients.find(c => c.id === selectedId);
  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.cif?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (clientId) => {
    onChange(clientId);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 100);
        }}
        disabled={disabled}
        className={cn(
          "w-full h-9 px-3 py-1 text-sm rounded-md border border-input bg-transparent shadow-sm",
          "transition-colors text-left flex items-center justify-between",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "hover:bg-accent/10"
        )}
      >
        <span className={selectedClient ? "text-foreground font-medium" : "text-muted-foreground"}>
          {selectedClient ? selectedClient.name : "Seleccionar cliente..."}
        </span>
      </button>

      {/* Modal Overlay with fixed positioning and ultra-high z-index */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setOpen(false);
              setSearch("");
            }}
          />
          <div className="fixed inset-0 z-[9999] flex items-end lg:items-center lg:justify-center pointer-events-none">
            <div className="w-full lg:max-w-md h-[70vh] lg:h-auto lg:max-h-[70vh] bg-card rounded-t-3xl lg:rounded-2xl border border-border shadow-2xl flex flex-col pointer-events-auto overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50 shrink-0">
                <h3 className="font-semibold text-sm">Seleccionar Cliente</h3>
                <button
                  onClick={() => {
                    setOpen(false);
                    setSearch("");
                  }}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Search Input */}
              <div className="px-4 py-3 border-b border-border shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Buscar por nombre o CIF..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm rounded-lg"
                    autoFocus
                  />
                </div>
              </div>

              {/* Client List with internal scroll */}
              <div className="flex-1 overflow-y-auto px-2 py-2">
                {filtered.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                    {clients.length === 0 ? "Sin clientes" : "Sin resultados"}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filtered.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => handleSelect(client.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                          selectedId === client.id
                            ? "bg-primary text-primary-foreground font-medium"
                            : "hover:bg-accent/20 text-foreground"
                        )}
                      >
                        <div className="font-medium">{client.name}</div>
                        {(client.cif || client.city || client.phone) && (
                          <div className="text-xs opacity-75 mt-0.5">
                            {[client.cif, client.city, client.phone].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer action */}
              {selectedId && (
                <div className="px-4 py-3 border-t border-border bg-muted/30 shrink-0">
                  <Button
                    onClick={() => {
                      setOpen(false);
                      setSearch("");
                    }}
                    className="w-full rounded-lg h-9 text-sm"
                  >
                    Confirmar Selección
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
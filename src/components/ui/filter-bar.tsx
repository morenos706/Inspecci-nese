import { Search } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

export interface FilterSelect {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}

/**
 * Barra de filtros genérica (formulario GET): búsqueda + selects. La URL es
 * compartible y el servidor valida cada parámetro.
 */
export function FilterBar({
  q,
  placeholder = "Buscar…",
  selects,
  resetHref,
}: {
  q?: string;
  placeholder?: string;
  selects: FilterSelect[];
  resetHref: string;
}) {
  const active = Boolean(q) || selects.some((s) => s.value);
  return (
    <form role="search" method="get" className="space-y-2 border-b border-border p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input name="q" defaultValue={q} placeholder={placeholder} aria-label="Buscar" className="pl-9" type="search" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {selects.map((s) => (
          <Select key={s.name} name={s.name} defaultValue={s.value ?? ""} aria-label={s.label}>
            <option value="">{s.label}: todos</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ))}
        <div className="col-span-2 flex gap-2 md:col-span-1">
          <Button type="submit" variant="outline" className="flex-1">
            Filtrar
          </Button>
          {active && (
            <ButtonLink href={resetHref} variant="ghost" className="flex-1">
              Limpiar
            </ButtonLink>
          )}
        </div>
      </div>
    </form>
  );
}

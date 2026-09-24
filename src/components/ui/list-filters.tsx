import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

/**
 * Filtros de listado como formulario GET: funciona sin JavaScript, la URL
 * es compartible y el servidor valida los parámetros.
 */
export function ListFilters({
  q,
  status,
  placeholder = "Buscar…",
}: {
  q?: string;
  status?: string;
  placeholder?: string;
}) {
  return (
    <form key={`${q ?? ""}|${status ?? ""}`} role="search" className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row" method="get">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input name="q" defaultValue={q} placeholder={placeholder} aria-label="Buscar" className="pl-9" type="search" />
      </div>
      <Select name="status" defaultValue={status ?? "all"} aria-label="Estado" className="sm:w-44">
        <option value="all">Todos</option>
        <option value="active">Activos</option>
        <option value="inactive">Inactivos</option>
      </Select>
      <Button type="submit" variant="outline">
        Filtrar
      </Button>
    </form>
  );
}

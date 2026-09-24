import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { addDaysISO } from "@/lib/utils";

interface Option {
  id: string;
  name: string;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Abiertos" },
  { value: "closed", label: "Cerrados" },
  { value: "PENDING", label: "Pendientes" },
  { value: "IN_PROGRESS", label: "En proceso" },
  { value: "SOLVED", label: "Solucionados" },
  { value: "VERIFIED", label: "Verificados" },
];

/**
 * Filtros del dashboard: una sola fila sobre todos los gráficos (formulario
 * GET: la URL se puede compartir). El rango de fechas va primero, con atajos.
 */
export function IndicatorFilters({
  values,
  today,
  options,
}: {
  values: { from: string; to: string; process?: string; site?: string; type?: string; responsible?: string; status?: string };
  today: string;
  options: { processes: Option[]; sites: Option[]; types: Option[]; users: Option[] };
}) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const [y, m] = today.split("-").map(Number) as [number, number];
  const last12 = new Date(Date.UTC(y, m - 1 - 11, 1)).toISOString().slice(0, 10);
  const presets = [
    { label: "Este mes", from: monthStart },
    { label: "Últimos 90 días", from: addDaysISO(today, -89) },
    { label: "Este año", from: yearStart },
    { label: "Últimos 12 meses", from: last12 },
  ];
  const keep = (from: string) => {
    const p = new URLSearchParams();
    p.set("from", from);
    p.set("to", today);
    for (const k of ["process", "site", "type", "responsible", "status"] as const) if (values[k]) p.set(k, values[k]!);
    return `/indicators?${p}`;
  };
  const select = (name: string, label: string, value: string | undefined, opts: { value: string; label: string }[]) => (
    <Select name={name} defaultValue={value ?? ""} aria-label={label} className="h-10">
      <option value="">{label}: todos</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="mb-6 space-y-2">
      <nav aria-label="Periodos rápidos" className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = values.from === p.from && values.to === today;
          return (
            <Link
              key={p.label}
              href={keep(p.from)}
              aria-current={active ? "true" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-primary bg-primary-soft text-primary" : "border-border-strong bg-surface text-muted hover:bg-surface-muted"}`}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>
      {/* key: al navegar con un atajo o "Limpiar" el formulario se reinicia con los valores de la URL */}
      <form key={JSON.stringify(values)} method="get" className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
        <label className="text-xs text-subtle">
          <span className="sr-only">Desde</span>
          <Input type="date" name="from" defaultValue={values.from} max={today} aria-label="Desde" className="h-10" />
        </label>
        <label className="text-xs text-subtle">
          <span className="sr-only">Hasta</span>
          <Input type="date" name="to" defaultValue={values.to} max={today} aria-label="Hasta" className="h-10" />
        </label>
        {select("process", "Proceso", values.process, options.processes.map((o) => ({ value: o.id, label: o.name })))}
        {select("site", "Sede", values.site, options.sites.map((o) => ({ value: o.id, label: o.name })))}
        {select("type", "Tipo", values.type, options.types.map((o) => ({ value: o.id, label: o.name })))}
        {select("responsible", "Responsable", values.responsible, options.users.map((o) => ({ value: o.id, label: o.name })))}
        {select("status", "Estado", values.status, STATUS_OPTIONS)}
        <div className="flex gap-2">
          <Button type="submit" variant="outline" className="h-10 flex-1">
            Aplicar
          </Button>
          <Link href="/indicators" className="flex h-10 items-center px-2 text-sm text-primary hover:underline">
            Limpiar
          </Link>
        </div>
      </form>
    </div>
  );
}

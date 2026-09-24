export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-48 rounded bg-slate-200" />
      <div className="h-4 w-72 rounded bg-slate-200" />
      <div className="h-64 rounded-xl bg-slate-200" />
    </div>
  );
}

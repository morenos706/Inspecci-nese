import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/** Paginación basada en URL (?page=N), conserva el resto de filtros. */
export function Pagination({
  page,
  pageCount,
  total,
  basePath,
  searchParams,
}: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v && k !== "page") params.set(k, v);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm" aria-label="Paginación">
      <p className="text-subtle">
        {total} registro{total === 1 ? "" : "s"} · Página {page} de {pageCount}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClasses("outline", "sm")} aria-label="Página anterior">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link href={href(page + 1)} className={buttonClasses("outline", "sm")} aria-label="Página siguiente">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

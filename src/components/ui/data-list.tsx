import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Oculta la columna en la vista de tarjetas móvil. */
  hideOnMobile?: boolean;
}

/**
 * Listado responsive: tabla en escritorio (md+) y tarjetas apiladas en móvil.
 * La primera columna se usa como título de la tarjeta.
 */
export function DataList<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  empty,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty: ReactNode;
  caption: string;
}) {
  if (rows.length === 0) return <>{empty}</>;
  const [first, ...rest] = columns;

  return (
    <>
      {/* Escritorio */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-subtle">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-4 py-3 font-medium", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-surface-muted/60">
                {columns.map((c, i) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                    {i === 0 && rowHref ? (
                      <Link href={rowHref(row)} className="font-medium text-primary hover:underline">
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil */}
      <ul className="divide-y divide-border md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const content = (
            <>
              <div className="font-medium text-foreground">{first!.cell(row)}</div>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {rest
                  .filter((c) => !c.hideOnMobile)
                  .map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-subtle">{c.header}</dt>
                      <dd className="min-w-0 text-foreground">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </>
          );
          return (
            <li key={rowKey(row)}>
              {rowHref ? (
                <Link href={rowHref(row)} className="block px-4 py-3 active:bg-surface-muted">
                  {content}
                </Link>
              ) : (
                <div className="px-4 py-3">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

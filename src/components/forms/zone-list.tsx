"use client";

import { useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ZoneForm } from "@/components/forms/site-forms";

interface ZoneRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  _count: { elements: number };
}

export function ZoneList({ siteId, zones }: { siteId: string; zones: ZoneRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  if (zones.length === 0) {
    return <EmptyState icon={MapPin} title="Sin zonas" description="Agrega la primera zona de esta sede." />;
  }

  return (
    <ul className="divide-y divide-border">
      {zones.map((zone) => (
        <li key={zone.id} className="px-4 py-3 sm:px-6">
          {editing === zone.id ? (
            <ZoneForm siteId={siteId} zone={zone} onDone={() => setEditing(null)} />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{zone.name}</p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-subtle">
                  <code>{zone.code}</code>
                  <Badge>{zone._count.elements} elementos</Badge>
                  <ActiveBadge active={zone.active} />
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditing(zone.id)} aria-label={`Editar ${zone.name}`}>
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

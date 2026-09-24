"use client";

import { useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AreaForm } from "@/components/forms/site-forms";

interface AreaRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  _count: { elements: number };
}

export function AreaList({ siteId, areas }: { siteId: string; areas: AreaRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  if (areas.length === 0) {
    return <EmptyState icon={MapPin} title="Sin áreas" description="Agrega la primera área de esta sede." />;
  }

  return (
    <ul className="divide-y divide-border">
      {areas.map((area) => (
        <li key={area.id} className="px-4 py-3 sm:px-6">
          {editing === area.id ? (
            <AreaForm siteId={siteId} area={area} onDone={() => setEditing(null)} />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{area.name}</p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-subtle">
                  <code>{area.code}</code>
                  <Badge>{area._count.elements} elementos</Badge>
                  <ActiveBadge active={area.active} />
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditing(area.id)} aria-label={`Editar ${area.name}`}>
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

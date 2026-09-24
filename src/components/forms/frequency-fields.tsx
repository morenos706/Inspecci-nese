"use client";

import { useState } from "react";
import type { InspectionFrequency } from "@/generated/prisma/enums";
import { FormField } from "@/components/ui/form-field";
import { Input, Select } from "@/components/ui/input";
import { FREQUENCIES, FREQUENCY_LABELS } from "@/lib/scheduling";

/** Selector de frecuencia + días (solo visibles si es personalizada). */
export function FrequencyFields({
  name,
  daysName,
  defaultFrequency,
  defaultDays,
  errors,
  frequency: controlled,
  onFrequencyChange,
}: {
  name: string;
  daysName: string;
  defaultFrequency?: InspectionFrequency;
  defaultDays?: number | null;
  errors: (field: string) => string[] | undefined;
  frequency?: InspectionFrequency;
  onFrequencyChange?: (f: InspectionFrequency) => void;
}) {
  const [internal, setInternal] = useState<InspectionFrequency>(defaultFrequency ?? "MONTHLY");
  const frequency = controlled ?? internal;
  return (
    <>
      <FormField label="Frecuencia de inspección" errors={errors(name)} required>
        <Select
          name={name}
          value={frequency}
          onChange={(e) => {
            const f = e.target.value as InspectionFrequency;
            setInternal(f);
            onFrequencyChange?.(f);
          }}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABELS[f]}
            </option>
          ))}
        </Select>
      </FormField>
      {frequency === "CUSTOM" && (
        <FormField label="Cada cuántos días" errors={errors(daysName)} required>
          <Input name={daysName} type="number" min={1} max={3650} inputMode="numeric" defaultValue={defaultDays ?? ""} />
        </FormField>
      )}
    </>
  );
}

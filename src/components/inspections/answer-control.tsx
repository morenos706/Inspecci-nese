"use client";

import { useState } from "react";
import type { ResponseType } from "@/generated/prisma/enums";
import { Input, Textarea } from "@/components/ui/input";
import { choicesFor, evaluateCompliance, type AnswerValue, type RuleQuestion } from "@/lib/inspection-rules";
import { cn } from "@/lib/utils";

export interface RunnerQuestion extends RuleQuestion {
  id: string;
  text: string;
  helpText: string | null;
  responseType: ResponseType;
  required: boolean;
  generatesFinding: boolean;
  defaultPriority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

const CHOICE_TYPES: ResponseType[] = ["YES_NO", "COMPLIES", "YES_NO_NA", "SELECT"];

/**
 * Control de respuesta según el tipo de pregunta. Las opciones son botones
 * grandes (≥56 px) pensados para usar con una mano en campo.
 */
export function AnswerControl({
  question,
  value,
  today,
  onChange,
  disabled,
}: {
  question: RunnerQuestion;
  value: AnswerValue;
  today: string;
  onChange: (value: AnswerValue) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value === null || Array.isArray(value) ? "" : String(value));
  const id = `q-${question.id}`;

  if (CHOICE_TYPES.includes(question.responseType) || question.responseType === "MULTI_SELECT") {
    const multi = question.responseType === "MULTI_SELECT";
    const selected = new Set(Array.isArray(value) ? value : value === null ? [] : [String(value)]);
    const choices = choicesFor(question);
    const binary = choices.length <= 3 && question.responseType !== "SELECT" && !multi;
    return (
      <div
        role={multi ? "group" : "radiogroup"}
        aria-labelledby={`${id}-label`}
        className={cn("grid gap-2", binary ? (choices.length === 3 ? "grid-cols-3" : "grid-cols-2") : "grid-cols-1 sm:grid-cols-2")}
      >
        {choices.map((choice) => {
          const isSelected = selected.has(choice.value);
          const compliance = isSelected
            ? evaluateCompliance(question, multi ? [choice.value] : choice.value, today)
            : undefined;
          return (
            <button
              key={choice.value}
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => {
                if (multi) {
                  const next = new Set(selected);
                  if (isSelected) next.delete(choice.value);
                  else next.add(choice.value);
                  onChange(next.size ? [...next] : null);
                } else if (!isSelected) {
                  onChange(choice.value);
                }
              }}
              className={cn(
                "min-h-14 rounded-xl border-2 px-3 py-2 text-base font-semibold transition-colors disabled:opacity-60",
                binary && "uppercase tracking-wide",
                !isSelected && "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
                isSelected && compliance === false && "border-danger bg-danger text-white",
                isSelected && compliance === true && "border-success bg-success text-white",
                isSelected && (compliance === null || compliance === undefined) && "border-primary bg-primary text-white",
              )}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.responseType === "NUMBER" || question.responseType === "DATE") {
    return (
      <Input
        id={id}
        aria-labelledby={`${id}-label`}
        type={question.responseType === "NUMBER" ? "text" : "date"}
        inputMode={question.responseType === "NUMBER" ? "decimal" : undefined}
        className="h-14 text-lg"
        value={draft}
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value);
          if (question.responseType === "DATE") onChange(e.target.value || null);
        }}
        onBlur={() => {
          if (question.responseType === "NUMBER") onChange(draft.trim() === "" ? null : draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    );
  }

  if (question.responseType === "TEXT") {
    return (
      <Textarea
        id={id}
        aria-labelledby={`${id}-label`}
        rows={3}
        maxLength={2000}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onChange(draft.trim() === "" ? null : draft)}
      />
    );
  }

  return null; // PHOTO: se gestiona con PhotoUploader
}

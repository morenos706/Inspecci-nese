import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  /** Mensajes de error del campo (fieldErrors[nombre]). */
  errors?: string[];
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}

/**
 * Etiqueta + control + ayuda + error, con los atributos ARIA conectados
 * (aria-invalid, aria-describedby) para lectores de pantalla.
 */
export function FormField({ label, errors, hint, required, className, children }: FormFieldProps) {
  const autoId = useId();
  const id = (children.props.id as string | undefined) ?? autoId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasError = Boolean(errors?.length);
  const describedBy = [hint ? hintId : null, hasError ? errorId : null].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": hasError || undefined,
        "aria-describedby": describedBy,
        required: required || undefined,
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {control}
      {hint && !hasError && (
        <p id={hintId} className="text-xs text-subtle">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} className="text-xs font-medium text-danger" role="alert">
          {errors![0]}
        </p>
      )}
    </div>
  );
}

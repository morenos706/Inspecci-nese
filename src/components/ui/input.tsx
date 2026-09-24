import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// text-base (16px) en móvil evita el zoom automático de iOS al enfocar campos.
const fieldBase =
  "block w-full rounded-lg border border-border-strong bg-surface px-3 text-base sm:text-sm text-foreground " +
  "placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-subtle " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, "h-11", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(fieldBase, "py-2", className)} {...props} />;
  },
);

// Select nativo: mejor experiencia en móviles (usa el selector del sistema).
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(fieldBase, "h-11 pr-8", className)} {...props}>
      {children}
    </select>
  );
});

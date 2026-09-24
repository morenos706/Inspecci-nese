import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, id, ...props },
  ref,
) {
  const inputId = id ?? `${props.name}-${String(props.value ?? "on")}`;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-surface-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
        className,
      )}
    >
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-border-strong accent-primary"
        {...props}
      />
      <span className="text-sm">
        <span className="font-medium text-foreground">{label}</span>
        {description && <span className="block text-subtle">{description}</span>}
      </span>
    </label>
  );
});

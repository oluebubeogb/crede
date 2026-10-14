"use client";

import { cn } from "@/lib/utils";

type CircleCheckboxProps = {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
};

/**
 * Accessible circle checkbox: ○ / ●
 * Used for selection, toggles, multi-select, and progress indicators.
 */
export function CircleCheckbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
  id,
  name,
}: CircleCheckboxProps) {
  const handleToggle = () => {
    if (disabled || !onChange) return;
    onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <label
      className={cn(
        "group flex items-start gap-2.5 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <span
        role="checkbox"
        aria-checked={checked}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        id={id}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={cn(
          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-base leading-none transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          checked ? "text-accent" : "text-muted group-hover:text-foreground/70"
        )}
      >
        {checked ? "●" : "○"}
      </span>
      {(label || description) && (
        <span className="min-w-0 flex-1">
          {label && (
            <span className={cn("block text-sm", checked ? "text-foreground font-medium" : "text-foreground")}>
              {label}
            </span>
          )}
          {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
        </span>
      )}
      {/* Hidden native input for forms if needed */}
      {name && (
        <input type="checkbox" name={name} checked={checked} onChange={() => {}} className="sr-only" tabIndex={-1} readOnly />
      )}
    </label>
  );
}

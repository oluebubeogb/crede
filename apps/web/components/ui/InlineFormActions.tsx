"use client";

import { TextAction } from "./TextAction";
import { cn } from "@/lib/utils";

type InlineFormActionsProps = {
  onSave?: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  className?: string;
  saveType?: "button" | "submit";
};

/**
 * Standard form footer: Save changes · Cancel
 * Uses TextAction only — never rectangular buttons.
 */
export function InlineFormActions({
  onSave,
  onCancel,
  saveLabel = "Save changes",
  cancelLabel = "Cancel",
  saveDisabled,
  className,
  saveType = "button",
}: InlineFormActionsProps) {
  return (
    <div className={cn("mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", className)}>
      <TextAction
        type={saveType}
        variant="primary"
        onClick={onSave}
        disabled={saveDisabled}
      >
        {saveLabel}
      </TextAction>
      {onCancel && (
        <>
          <span className="text-muted">·</span>
          <TextAction type="button" variant="muted" onClick={onCancel}>
            {cancelLabel}
          </TextAction>
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, type AnchorHTMLAttributes } from "react";

type Variant = "primary" | "muted" | "danger" | "secondary";

const variantClasses: Record<Variant, string> = {
  primary: "text-accent underline-offset-4 hover:underline focus-visible:underline font-medium",
  muted: "text-muted hover:text-foreground underline-offset-4 hover:underline focus-visible:underline",
  danger: "text-danger/90 hover:text-danger underline-offset-4 hover:underline focus-visible:underline",
  secondary: "text-foreground/80 hover:text-foreground underline-offset-4 hover:underline focus-visible:underline",
};

type BaseProps = {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
};

type AsButton = BaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

type AsLink = BaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
  };

export type TextActionProps = AsButton | AsLink;

/**
 * Primary interaction primitive: rich text link that can navigate or fire onClick.
 * Never looks like a traditional button.
 */
export function TextAction({
  variant = "primary",
  className,
  children,
  disabled,
  ...props
}: TextActionProps) {
  const classes = cn(
    "inline-flex items-center gap-1 text-sm transition-colors cursor-pointer select-none",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm",
    variantClasses[variant],
    disabled && "opacity-50 pointer-events-none cursor-not-allowed",
    className
  );

  if ("href" in props && props.href) {
    const { href, ...rest } = props as AsLink;
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  const buttonProps = props as AsButton;
  return (
    <button type={buttonProps.type ?? "button"} className={classes} disabled={disabled} {...buttonProps}>
      {children}
    </button>
  );
}

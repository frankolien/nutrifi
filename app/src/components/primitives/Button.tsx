import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

/**
 * Button — three variants, one file.
 *
 *   primary  — green background, black text. The one "commit" button
 *              on each page. Soft accent glow on hover so pressing it
 *              feels like the end of a sentence.
 *   secondary — transparent, thin border. Every other action.
 *   danger   — alert red, used sparingly.
 *
 * Glow is a pure box-shadow transition — no filter, no blur, no
 * reflow. Cheap enough to run on every button without frame drops.
 */

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const baseClasses =
  "group/btn relative inline-flex items-center justify-center gap-2 rounded px-4 h-10 text-sm font-medium transition-[background,box-shadow,transform] duration-150 disabled:opacity-40 disabled:pointer-events-none";

const variantClasses: Record<Variant, string> = {
  primary: [
    "bg-accent text-bg",
    "hover:bg-accent/90 hover:shadow-[0_0_0_1px_rgba(107,191,138,0.35),0_8px_32px_-12px_rgba(107,191,138,0.6)]",
    "active:scale-[0.98]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
  ].join(" "),
  secondary: [
    "border border-border text-fg",
    "hover:bg-fg/[0.04] hover:border-border-strong",
    "active:scale-[0.98]",
  ].join(" "),
  danger: [
    "bg-alert text-bg",
    "hover:bg-alert/90 hover:shadow-[0_0_0_1px_rgba(212,102,90,0.35),0_8px_32px_-12px_rgba(212,102,90,0.5)]",
    "active:scale-[0.98]",
  ].join(" "),
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", className, ...rest }, ref) => (
    <button
      ref={ref}
      className={cx(baseClasses, variantClasses[variant], className)}
      {...rest}
    />
  ),
);
Button.displayName = "Button";

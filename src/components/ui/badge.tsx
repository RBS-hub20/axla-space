import { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-slate-800 text-slate-200",
        success: "bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/30",
        warning: "bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/30",
        destructive: "bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

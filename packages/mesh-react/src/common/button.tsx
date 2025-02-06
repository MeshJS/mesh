import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "./cn"

const buttonVariants = cva(
  "mesh-inline-flex mesh-items-center mesh-justify-center mesh-whitespace-nowrap mesh-rounded-md mesh-text-sm mesh-font-medium mesh-transition-colors focus-visible:mesh-outline-none focus-visible:mesh-ring-1 focus-visible:mesh-ring-zinc-950 disabled:mesh-pointer-events-none disabled:mesh-opacity-50 dark:focus-visible:mesh-ring-zinc-300 dark:mesh-text-white",
  {
    variants: {
      variant: {
        default:
          "mesh-bg-zinc-900 mesh-text-zinc-50 mesh-shadow hover:mesh-bg-zinc-900/90 dark:mesh-bg-zinc-50 dark:mesh-text-zinc-900 dark:hover:mesh-bg-zinc-50/90",
        destructive:
          "mesh-bg-red-500 mesh-text-zinc-50 mesh-shadow-sm hover:mesh-bg-red-500/90 dark:mesh-bg-red-900 dark:mesh-text-zinc-50 dark:hover:mesh-bg-red-900/90",
        outline:
          "mesh-border mesh-border-zinc-200 mesh-bg-white mesh-shadow-sm hover:mesh-bg-zinc-100 hover:mesh-text-zinc-900 dark:mesh-border-zinc-800 dark:mesh-bg-zinc-950 dark:hover:mesh-bg-zinc-800 dark:hover:mesh-text-zinc-50",
        secondary:
          "mesh-bg-zinc-100 mesh-text-zinc-900 mesh-shadow-sm hover:mesh-bg-zinc-100/80 dark:mesh-bg-zinc-800 dark:mesh-text-zinc-50 dark:hover:mesh-bg-zinc-800/80",
        ghost: "hover:mesh-bg-zinc-100 hover:mesh-text-zinc-900 dark:hover:mesh-bg-zinc-800 dark:hover:mesh-text-zinc-50",
        link: "mesh-text-zinc-900 mesh-underline-offset-4 hover:mesh-underline dark:mesh-text-zinc-50",
      },
      size: {
        default: "mesh-h-9 mesh-px-4 mesh-py-2",
        sm: "mesh-h-8 mesh-rounded-md mesh-px-3 mesh-text-xs",
        lg: "mesh-h-10 mesh-rounded-md mesh-px-8",
        icon: "mesh-h-9 mesh-w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

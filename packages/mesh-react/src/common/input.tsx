import * as React from "react";

import { cn } from "./cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "mesh-flex mesh-h-9 mesh-w-full mesh-rounded-md mesh-border mesh-border-zinc-200 mesh-bg-transparent mesh-px-3 mesh-py-1 mesh-text-sm mesh-shadow-sm mesh-transition-colors file:mesh-border-0 file:mesh-bg-transparent file:mesh-text-sm file:mesh-font-medium placeholder:mesh-text-zinc-500 focus-visible:mesh-outline-none focus-visible:mesh-ring-1 focus-visible:mesh-ring-zinc-950 disabled:mesh-cursor-not-allowed disabled:mesh-opacity-50 dark:mesh-border-zinc-800 dark:mesh-placeholder:text-zinc-400 dark:mesh-focus-visible:ring-zinc-300",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

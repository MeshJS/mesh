import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "./cn"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "mesh-z-50 mesh-overflow-hidden mesh-rounded-md mesh-bg-primary mesh-px-3 mesh-py-1.5 mesh-text-xs mesh-text-primary-foreground mesh-animate-in mesh-fade-in-0 mesh-zoom-in-95 data-[state=closed]:mesh-animate-out data-[state=closed]:mesh-fade-out-0 data-[state=closed]:mesh-zoom-out-95 data-[side=bottom]:mesh-slide-in-from-top-2 data-[side=left]:mesh-slide-in-from-right-2 data-[side=right]:mesh-slide-in-from-left-2 data-[side=top]:mesh-slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

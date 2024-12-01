import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Cross2Icon } from "@radix-ui/react-icons"

import { cn } from "./cn"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "mesh-fixed mesh-inset-0 mesh-z-50 mesh-bg-black/80 data-[state=open]:mesh-animate-in data-[state=closed]:mesh-animate-out data-[state=closed]:mesh-fade-out-0 data-[state=open]:mesh-fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        `mesh-fixed mesh-left-[50%] mesh-top-[50%] mesh-z-50 mesh-grid mesh-w-full mesh-max-w-lg mesh-translate-x-[-50%] mesh-translate-y-[-50%] mesh-gap-4 mesh-p-6 mesh-shadow-lg mesh-duration-200 data-[state=open]:mesh-animate-in data-[state=closed]:mesh-animate-out data-[state=closed]:mesh-fade-out-0 data-[state=open]:mesh-fade-in-0 data-[state=closed]:mesh-zoom-out-95 data-[state=open]:mesh-zoom-in-95 data-[state=closed]:mesh-slide-out-to-left-1/2 data-[state=closed]:mesh-slide-out-to-top-[48%] data-[state=open]:mesh-slide-in-from-left-1/2 data-[state=open]:mesh-slide-in-from-top-[48%] sm:mesh-rounded-lg mesh-bg-zinc-900 mesh-text-white mesh-border mesh-border-zinc-700`,
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="mesh-absolute mesh-right-4 mesh-top-4 mesh-rounded-sm mesh-opacity-70 mesh-ring-offset-background mesh-transition-opacity hover:mesh-opacity-100 disabled:mesh-pointer-events-none data-[state=open]:mesh-bg-black data-[state=open]:mesh-text-white">
        <Cross2Icon className="mesh-h-4 mesh-w-4" />
        <span className="mesh-sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "mesh-flex mesh-flex-col mesh-space-y-1.5 mesh-text-center sm:mesh-text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "mesh-flex mesh-flex-col-reverse sm:mesh-flex-row sm:mesh-justify-end sm:mesh-space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "mesh-text-lg mesh-font-semibold mesh-leading-none mesh-tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("mesh-text-sm mesh-text-white", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}

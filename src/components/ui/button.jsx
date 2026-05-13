import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition-all duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-[#2563EB] text-white hover:bg-[#1d4ed8]",
        primary:
          "border border-transparent bg-[#2563EB] text-white hover:bg-[#1d4ed8]",
        "primary-soft":
          "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
        secondary:
          "border border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
        outline:
          "border border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
        ghost:
          "border border-transparent bg-transparent text-[#2563EB] hover:bg-blue-50",
        link: "border border-transparent bg-transparent text-[#2563EB] underline-offset-4 hover:underline",
        success:
          "border border-transparent bg-green-600 text-white hover:bg-green-700",
        destructive:
          "border border-transparent bg-red-600 text-white hover:bg-red-700",
        "danger-solid":
          "border border-transparent bg-red-600 text-white hover:bg-red-700",
        "danger-outline":
          "border border-red-200 bg-white text-red-600 hover:bg-red-50",
      },
      size: {
        sm: "h-9 gap-1.5 rounded-[10px] px-4 text-[13px]",
        default:
          "h-11 min-w-[130px] gap-1.5 rounded-[14px] px-5 text-[14px]",
        md: "h-11 min-w-[130px] gap-1.5 rounded-[14px] px-5 text-[14px]",
        lg: "h-[52px] min-w-[160px] gap-2 rounded-[16px] px-7 text-[15px]",
        icon: "h-11 w-11 min-w-0 gap-1.5 rounded-[14px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function spinnerClassesForVariant(variant) {
  if (
    variant === "default" ||
    variant === "primary" ||
    variant === "destructive" ||
    variant === "danger-solid" ||
    variant === "success"
  ) {
    return "border-white/30 border-t-white"
  }
  return "border-blue-200 border-t-blue-600"
}

const Button = React.forwardRef(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      icon,
      iconRight,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    const isDisabled = Boolean(disabled || loading)
    const resolvedVariant = variant ?? "default"

    const mergedClassName = cn(
      buttonVariants({ variant, size }),
      fullWidth && "w-full",
      variant === "link" && "h-auto min-w-0 w-auto p-0",
      loading && "cursor-not-allowed !opacity-75",
      className
    )

    if (asChild) {
      return (
        <Comp
          ref={ref}
          className={mergedClassName}
          aria-busy={loading || undefined}
          {...props}
        >
          {children}
        </Comp>
      )
    }

    const spinner = (
      <span
        aria-hidden
        className={cn(
          "h-[15px] w-[15px] shrink-0 animate-spin rounded-full border-2",
          spinnerClassesForVariant(resolvedVariant)
        )}
      />
    )

    const showLoadingLabel =
      loadingText !== undefined && loadingText !== null

    return (
      <Comp
        ref={ref}
        className={mergedClassName}
        {...props}
        disabled={isDisabled}
        aria-busy={loading || undefined}
      >
        {loading ? (
          <>
            {spinner}
            {showLoadingLabel ? loadingText : children}
          </>
        ) : (
          <>
            {icon}
            {children}
            {iconRight}
          </>
        )}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

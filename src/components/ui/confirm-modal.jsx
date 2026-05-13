"use client"

import * as React from "react"
import { AlertTriangle, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  note,
  confirmText,
  cancelText = "Cancelar",
  variant = "danger",
  loading = false,
  onConfirm,
  icon,
  disabled = false,
  keepOpenOnConfirm = false,
}) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const internalLoading = Boolean(loading || isSubmitting)

  React.useEffect(() => {
    if (!open) setIsSubmitting(false)
  }, [open])

  const resolvedConfirmText =
    confirmText ??
    (variant === "warning" ? "Continuar" : "Eliminar")

  const defaultIcon =
    variant === "warning" ? (
      <AlertTriangle className="h-6 w-6" />
    ) : (
      <Trash2 className="h-6 w-6" />
    )

  const resolvedIcon = icon ?? defaultIcon

  const iconBoxClass =
    variant === "warning"
      ? "bg-amber-50 text-amber-700"
      : "bg-red-50 text-red-600"

  const noteBoxClass =
    variant === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-red-200 bg-red-50 text-red-700"

  const confirmVariant = variant === "warning" ? "primary" : "danger-solid"

  const handleOpenChange = React.useCallback(
    (next) => {
      if (!next && internalLoading) return
      onOpenChange?.(next)
    },
    [internalLoading, onOpenChange]
  )

  const handleCancel = React.useCallback(() => {
    if (internalLoading) return
    onOpenChange?.(false)
  }, [internalLoading, onOpenChange])

  const handleConfirm = React.useCallback(async () => {
    if (disabled || internalLoading) return
    if (!onConfirm) return
    setIsSubmitting(true)
    try {
      await Promise.resolve(onConfirm())
      if (!keepOpenOnConfirm) {
        onOpenChange?.(false)
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("ConfirmModal onConfirm failed", error)
      }
      // parent handles error / toast; keep modal open
    } finally {
      setIsSubmitting(false)
    }
  }, [
    disabled,
    internalLoading,
    keepOpenOnConfirm,
    onConfirm,
    onOpenChange,
  ])

  const blockDismiss = React.useCallback(
    (e) => {
      if (internalLoading) e.preventDefault()
    },
    [internalLoading]
  )

  const hasDescription =
    description !== undefined &&
    description !== null &&
    description !== false

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-w-md gap-0 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:max-w-md"
        )}
        onPointerDownOutside={blockDismiss}
        onInteractOutside={blockDismiss}
        onEscapeKeyDown={blockDismiss}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div
            className={cn(
              "mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:mx-0",
              iconBoxClass
            )}
            aria-hidden
          >
            {resolvedIcon}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-[16px] font-medium leading-snug text-gray-950">
                {title}
              </DialogTitle>
              {hasDescription ? (
                typeof description === "string" ||
                typeof description === "number" ? (
                  <DialogDescription className="text-[13px] leading-relaxed text-gray-500">
                    {description}
                  </DialogDescription>
                ) : (
                  <DialogDescription asChild>
                    <div className="text-[13px] leading-relaxed text-gray-500">
                      {description}
                    </div>
                  </DialogDescription>
                )
              ) : null}
            </DialogHeader>

            {note !== undefined && note !== null && note !== false ? (
              <div
                className={cn(
                  "rounded-xl border px-3 py-2 text-[12px] leading-relaxed",
                  noteBoxClass
                )}
              >
                {note}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0 sm:gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full min-w-0 sm:w-auto"
            disabled={internalLoading}
            onClick={handleCancel}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            className="w-full min-w-0 sm:w-auto"
            loading={internalLoading}
            disabled={disabled}
            onClick={() => {
              void handleConfirm()
            }}
          >
            {resolvedConfirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

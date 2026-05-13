import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"

const inputBaseClass =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 transition-all duration-150 ease-in-out file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-gray-900 placeholder:text-gray-400 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 disabled:opacity-70"

const Input = React.forwardRef(
  (
    {
      className,
      type = "text",
      id,
      label,
      required,
      icon,
      iconRight,
      error,
      hint,
      containerClassName,
      inputClassName,
      disabled,
      ...props
    },
    ref
  ) => {
    const rid = React.useId()
    const stableKey = id ?? rid

    const showError =
      error !== undefined &&
      error !== null &&
      error !== false &&
      error !== "" &&
      error !== 0

    const showHint =
      hint !== undefined &&
      hint !== null &&
      hint !== "" &&
      !showError

    const isPassword = type === "password"
    const [reveal, setReveal] = React.useState(false)
    const effectiveType = isPassword ? (reveal ? "text" : "password") : type

    const needsWrapper = Boolean(
      label ||
        showError ||
        showHint ||
        icon ||
        iconRight ||
        isPassword
    )

    const inputId = needsWrapper ? id ?? rid : id
    const errorId = `${stableKey}-error`
    const hintId = `${stableKey}-hint`

    const describedBy = showError ? errorId : showHint ? hintId : undefined

    const {
      "aria-describedby": ariaDescribedByProp,
      "aria-invalid": ariaInvalidProp,
      ...inputProps
    } = props

    const finalAriaDescribedBy =
      [ariaDescribedByProp, describedBy].filter(Boolean).join(" ") ||
      undefined

    const hasLeftIcon = Boolean(icon)
    const showPasswordToggle = isPassword
    const hasRightChrome = showPasswordToggle || Boolean(iconRight)

    const inputClass = cn(
      inputBaseClass,
      showError &&
        "border-red-400 focus-visible:border-red-400 focus-visible:ring-red-400/10",
      hasLeftIcon && "pl-10",
      hasRightChrome && "pr-10",
      className,
      inputClassName
    )

    const inputEl = (
      <input
        ref={ref}
        type={effectiveType}
        id={inputId}
        className={inputClass}
        {...inputProps}
        disabled={disabled}
        required={required}
        aria-invalid={showError ? true : ariaInvalidProp}
        aria-describedby={finalAriaDescribedBy}
      />
    )

    if (!needsWrapper) {
      return inputEl
    }

    return (
      <div className={cn("w-full", containerClassName)}>
        {label ? (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-[13px] font-medium text-gray-700"
          >
            {label}
            {required ? (
              <span className="text-red-600" aria-hidden>
                {" "}
                *
              </span>
            ) : null}
          </label>
        ) : null}

        <div className="relative w-full">
          {icon ? (
            <span
              className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-gray-400 [&_svg]:h-4 [&_svg]:w-4"
              aria-hidden
            >
              {icon}
            </span>
          ) : null}

          {inputEl}

          {showPasswordToggle ? (
            <button
              type="button"
              className="absolute right-3 top-1/2 flex -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:pointer-events-none [&_svg]:h-4 [&_svg]:w-4"
              aria-label={reveal ? "Ocultar contraseña" : "Mostrar contraseña"}
              disabled={disabled}
              onClick={() => setReveal((v) => !v)}
            >
              {reveal ? <EyeOff /> : <Eye />}
            </button>
          ) : iconRight ? (
            <span
              className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 text-gray-400 [&_svg]:h-4 [&_svg]:w-4"
              aria-hidden
            >
              {iconRight}
            </span>
          ) : null}
        </div>

        {showError ? (
          <div
            id={errorId}
            role="alert"
            className="mt-1.5 text-[12px] text-red-600"
          >
            {error}
          </div>
        ) : showHint ? (
          <div id={hintId} className="mt-1.5 text-[12px] text-gray-400">
            {hint}
          </div>
        ) : null}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }

"use client";
import { Toaster as Sonner } from "sonner"

// La app no tiene modo oscuro (sin ThemeProvider de next-themes en ningún sitio),
// así que se fija tema claro en vez de depender de next-themes (causaba un
// "Invalid hook call" al no haber Provider, y dejaba el Toaster sin montar).
const Toaster = ({
  ...props
}) => {
  return (
    (<Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props} />)
  );
}

export { Toaster }

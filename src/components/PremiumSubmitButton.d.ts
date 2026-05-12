import type { ReactNode } from "react";

export function PremiumSubmitButton(props: {
  loading: boolean;
  disabled?: boolean;
  variant?: "light" | "dark";
  loadingLabel?: string;
  children: ReactNode;
  className?: string;
}): JSX.Element;

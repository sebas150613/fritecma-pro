import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BackButton({ label = "Atrás", to = null, fallback = "/" }) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (to) {
      navigate(to);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <Button
      variant="ghost"
      onClick={handleClick}
      className="flex items-center gap-0.5 text-accent hover:text-accent/80 px-2 -ml-2 rounded-xl h-10 font-medium text-base"
    >
      <ChevronLeft className="h-5 w-5 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface DonationButtonProps {
  onClick: () => void;
  variant?: "default" | "small" | "minimal" | "footer";
  className?: string;
}

export default function DonationButton({ 
  onClick, 
  variant = "default", 
  className 
}: DonationButtonProps) {
  const baseClasses = "transition-all duration-200 flex items-center gap-2 font-medium";
  
  const variantClasses = {
    default: "bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105",
    small: "bg-pink-50 dark:bg-pink-900/20 hover:bg-pink-100 dark:hover:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-3 py-1.5 rounded-md border border-pink-200 dark:border-pink-700 hover:border-pink-300 dark:hover:border-pink-600",
    minimal: "text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 px-2 py-1 rounded hover:bg-pink-50 dark:hover:bg-pink-900/20",
    footer: "bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-pink-600 dark:text-pink-400 px-4 py-2 rounded-lg border border-pink-200 dark:border-pink-600 hover:border-pink-300 dark:hover:border-pink-500 shadow-sm hover:shadow-md"
  };

  const iconSizes = {
    default: "h-5 w-5",
    small: "h-4 w-4", 
    minimal: "h-4 w-4",
    footer: "h-4 w-4"
  };

  const textContent = {
    default: "Support Us",
    small: "Donate",
    minimal: "♥",
    footer: "Support ShelfScanner"
  };

  return (
    <button
      onClick={onClick}
      className={cn(baseClasses, variantClasses[variant], className)}
      title="Support ShelfScanner with a donation"
    >
      <Heart className={cn(iconSizes[variant], "fill-current")} />
      {variant !== "minimal" && (
        <span className="text-sm">
          {textContent[variant]}
        </span>
      )}
    </button>
  );
} 
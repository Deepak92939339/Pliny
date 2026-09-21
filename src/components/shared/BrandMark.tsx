import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
};

export function BrandMark({ className, markClassName, textClassName }: BrandMarkProps) {
  // markClassName stays in the signature for call-site compatibility; the wordmark is text-only by design law.
  void markClassName;
  return (
    <span className={cn("flex h-10 items-center gap-3", className)}>
      <span className={cn("text-xl font-semibold leading-none tracking-tight", textClassName)}>Pliny</span>
    </span>
  );
}

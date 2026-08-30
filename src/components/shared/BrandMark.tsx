import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
};

export function BrandMark({ className, markClassName, textClassName }: BrandMarkProps) {
  return (
    <span className={cn("flex h-10 items-center gap-3", className)}>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[4px] border border-current/15 bg-current",
          markClassName
        )}
        aria-hidden="true"
      >
        <Image src="/brand/pliny-mark.png" alt="" width={1024} height={1024} className="size-7 shrink-0 object-contain" />
      </span>
      <span className={cn("text-xl font-semibold leading-none tracking-tight", textClassName)}>Pliny</span>
    </span>
  );
}

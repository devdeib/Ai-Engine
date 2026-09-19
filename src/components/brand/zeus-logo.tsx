import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface ZeusLogoProps {
  className?: string;
  showDescriptor?: boolean;
}

export function ZeusLogo({ className, showDescriptor = true }: ZeusLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zeus-blue/12">
        <Zap className="h-3.5 w-3.5 text-zeus-blue" strokeWidth={2} aria-hidden="true" />
      </div>
      <div className="min-w-0 leading-none">
        <p className="text-[15px] font-extrabold tracking-[0.16em] text-zeus-black">
          ZEUS
        </p>
        {showDescriptor ? (
          <p className="mt-1 text-[9px] font-medium tracking-[0.18em] text-zeus-black/45">
            AI SALES AGENT
          </p>
        ) : null}
      </div>
    </div>
  );
}

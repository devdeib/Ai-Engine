import type { Metadata } from "next";
import { ZeusLogo } from "@/components/brand/zeus-logo";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center text-center">
          <ZeusLogo />
          <p className="mt-4 text-[10px] tracking-[0.16em] text-muted-foreground">
            ZEUS by Virtual Gravity
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

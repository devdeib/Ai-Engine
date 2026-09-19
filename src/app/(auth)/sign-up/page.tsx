import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { isPublicSignupEnabled } from "@/modules/auth/public-signup";

export const metadata: Metadata = {
  title: "Create Account",
};

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  if (!isPublicSignupEnabled()) {
    redirect("/login");
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start your free trial today
        </p>
      </div>
      <SignUpForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <a
          href="/login"
          className="font-medium text-primary hover:text-zeus-blue hover:underline underline-offset-4"
        >
          Sign in
        </a>
      </p>
    </div>
  );
}

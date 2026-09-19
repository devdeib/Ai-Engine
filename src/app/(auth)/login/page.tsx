import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { isPublicSignupEnabled } from "@/modules/auth/public-signup";

export const metadata: Metadata = {
  title: "Sign In",
};

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to your account to continue
        </p>
      </div>
      <LoginForm />
      {isPublicSignupEnabled() ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a
            href="/sign-up"
            className="font-medium text-primary hover:text-zeus-blue hover:underline underline-offset-4"
          >
            Create one
          </a>
        </p>
      ) : null}
    </div>
  );
}

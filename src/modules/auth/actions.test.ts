import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signUpAction } from "@/modules/auth/actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validSignup = {
  email: "pilot@example.com",
  password: "long-enough-password",
  fullName: "Pilot User",
};

describe("signUpAction", () => {
  const original = process.env.ALLOW_PUBLIC_SIGNUP;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ALLOW_PUBLIC_SIGNUP;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ALLOW_PUBLIC_SIGNUP;
    } else {
      process.env.ALLOW_PUBLIC_SIGNUP = original;
    }
  });

  it("rejects public sign-up by default without calling Auth", async () => {
    const result = await signUpAction({}, form(validSignup));
    expect(result).toEqual({
      error: "Public sign-up is disabled. Ask an operator for access.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates an account when ALLOW_PUBLIC_SIGNUP=true", async () => {
    process.env.ALLOW_PUBLIC_SIGNUP = "true";
    const signUp = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp },
    } as never);

    const result = await signUpAction({}, form(validSignup));
    expect(result).toBeUndefined();
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(signUp).toHaveBeenCalledWith({
      email: validSignup.email,
      password: validSignup.password,
      options: { data: { full_name: validSignup.fullName } },
    });
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});

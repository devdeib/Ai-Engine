import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPublicSignupEnabled } from "@/modules/auth/public-signup";

describe("isPublicSignupEnabled", () => {
  const original = process.env.ALLOW_PUBLIC_SIGNUP;

  beforeEach(() => {
    delete process.env.ALLOW_PUBLIC_SIGNUP;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ALLOW_PUBLIC_SIGNUP;
    } else {
      process.env.ALLOW_PUBLIC_SIGNUP = original;
    }
  });

  it("is disabled by default for the supervised pilot", () => {
    expect(isPublicSignupEnabled()).toBe(false);
  });

  it("is enabled only when ALLOW_PUBLIC_SIGNUP=true", () => {
    process.env.ALLOW_PUBLIC_SIGNUP = "true";
    expect(isPublicSignupEnabled()).toBe(true);
  });

  it("treats other values as disabled so it stays easy to re-enable later", () => {
    process.env.ALLOW_PUBLIC_SIGNUP = "1";
    expect(isPublicSignupEnabled()).toBe(false);
    process.env.ALLOW_PUBLIC_SIGNUP = "false";
    expect(isPublicSignupEnabled()).toBe(false);
  });
});

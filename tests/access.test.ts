import { describe, expect, it } from "vitest";
import { accountEmail, isAllowedEmail, loginErrorMessage } from "@/lib/access";

describe("isAllowedEmail", () => {
  it("accepts the corporate domains and the listed addresses, in any case", () => {
    expect(isAllowedEmail("persona@somllar.cat")).toBe(true);
    expect(isAllowedEmail("Persona@ProHabitatge.org")).toBe(true);
    expect(isAllowedEmail("secretariadq@gmail.com")).toBe(true);
  });

  it("rejects other domains, look-alike domains and empty values", () => {
    expect(isAllowedEmail("persona@outlook.com")).toBe(false);
    expect(isAllowedEmail("persona@somllar.cat.example.com")).toBe(false);
    expect(isAllowedEmail("persona@notsomllar.cat")).toBe(false);
    expect(isAllowedEmail("")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
  });
});

describe("accountEmail", () => {
  it("uses the user's e-mail, or the provider's when Microsoft leaves it empty", () => {
    expect(accountEmail({ email: "A@somllar.cat" })).toBe("a@somllar.cat");
    expect(accountEmail({ email: null, providerData: [{ email: null }, { email: "B@prohabitatge.org" }] })).toBe("b@prohabitatge.org");
    expect(accountEmail({ email: null, providerData: [] })).toBe("");
    expect(accountEmail(null)).toBe("");
  });
});

describe("loginErrorMessage", () => {
  it("stays silent when the person closes the window", () => {
    expect(loginErrorMessage("auth/popup-closed-by-user", "microsoft")).toBeNull();
  });

  it("names the provider that is not enabled yet", () => {
    expect(loginErrorMessage("auth/operation-not-allowed", "microsoft")).toContain("Microsoft");
  });

  it("points to the other button when the e-mail already uses another method", () => {
    expect(loginErrorMessage("auth/account-exists-with-different-credential", "microsoft")).toContain("Google");
    expect(loginErrorMessage("auth/account-exists-with-different-credential", "google")).toContain("Microsoft");
  });

  it("falls back to the original message", () => {
    expect(loginErrorMessage("auth/something-else", "google", "Detall")).toBe("Detall");
  });
});

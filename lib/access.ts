// Who may use the platform. Must match isAllowedUser() in firestore.rules.
export const ALLOWED_DOMAINS = ["somllar.cat", "prohabitatge.org"];
export const ALLOWED_EMAILS = ["litofortuna@gmail.com", "secretariadq@gmail.com"];

export function isAllowedEmail(email: string | null | undefined): boolean {
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@")) return false;
  const domain = e.split("@").pop() || "";
  return ALLOWED_DOMAINS.includes(domain) || ALLOWED_EMAILS.includes(e);
}

/** Minimal shape of a Firebase user, enough to find its e-mail. */
export interface AccountLike {
  email: string | null;
  providerData?: { email?: string | null }[];
}

/**
 * The account's e-mail. Microsoft (Entra ID) accounts sometimes reach Firebase without it on the
 * user and only in the provider data.
 */
export function accountEmail(user: AccountLike | null | undefined): string {
  if (!user) return "";
  const fromProvider = (user.providerData || []).map(p => p?.email).find(e => !!e);
  return String(user.email || fromProvider || "").trim().toLowerCase();
}

export type LoginProvider = "google" | "microsoft";

export const PROVIDER_LABEL: Record<LoginProvider, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

/** User-facing message for a Firebase Auth error (null = nothing to show, e.g. popup closed). */
export function loginErrorMessage(code: string | undefined, provider: LoginProvider, fallback?: string): string | null {
  const name = PROVIDER_LABEL[provider];
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return null;
    case "auth/popup-blocked":
      return "El navegador ha bloquejat la finestra d'inici de sessió. Permet les finestres emergents per a aquest lloc i torna-ho a provar.";
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
      return `L'inici de sessió amb ${name} encara no està activat a la consola de Firebase (Authentication > Sign-in method > ${name}).`;
    case "auth/unauthorized-domain":
      return "Aquest domini no està autoritzat a la consola de Firebase (Authentication > Settings > Authorized domains).";
    case "auth/account-exists-with-different-credential":
      return `Aquest correu ja té accés amb un altre mètode. Entra amb el botó de ${provider === "microsoft" ? "Google" : "Microsoft"}; un cop dins, podràs fer servir tots dos.`;
    default:
      return fallback || "S'ha produït un error en iniciar la sessió.";
  }
}

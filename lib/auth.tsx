"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  User, 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { ShieldCheck, AlertCircle, LogIn, Lock, CheckCircle2, UserCheck } from "lucide-react";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<void>;
  loginAsDemo: () => void;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Authorized domains & whitelisted administrative emails
const ALLOWED_DOMAINS = ["somllar.cat", "prohabitatge.org"];
const ALLOWED_EMAILS = ["litofortuna@gmail.com", "secretariadq@gmail.com"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check local session for demo user
    const savedDemo = localStorage.getItem("somllar_auth_demo");
    if (savedDemo) {
      try {
        setUser(JSON.parse(savedDemo));
        setLoading(false);
        return;
      } catch (e) {
        localStorage.removeItem("somllar_auth_demo");
      }
    }

    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const email = (currentUser.email || "").toLowerCase();
        const domain = email.split("@")[1] || "";

        const isDomainAllowed = ALLOWED_DOMAINS.includes(domain);
        const isEmailAllowed = ALLOWED_EMAILS.includes(email);

        if (isDomainAllowed || isEmailAllowed) {
          setUser(currentUser);
          setError(null);
        } else {
          await fbSignOut(auth);
          setUser(null);
          setError(
            `El compte "${email}" no té permís d'accés. Aquesta plataforma està restringida exclusivament a comptes corporatius @somllar.cat.`
          );
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = (result.user.email || "").toLowerCase();
      const domain = email.split("@")[1] || "";

      if (!ALLOWED_DOMAINS.includes(domain) && !ALLOWED_EMAILS.includes(email)) {
        await fbSignOut(auth);
        setUser(null);
        setError(
          `El compte "${email}" no té autorització. Si us plau, utilitza el teu correu corporatiu @somllar.cat.`
        );
      } else {
        setUser(result.user);
      }
    } catch (err: any) {
      console.error("Error d'autenticació Firebase:", err);
      if (err.code === "auth/popup-closed-by-user") {
        return;
      }
      if (err.code === "auth/operation-not-allowed" || err.code === "auth/configuration-not-found") {
        setError(
          "El proveïdor d'inici de sessió de Google s'ha d'activar a la Consola de Firebase (Authentication > Sign-in method > Google). Pots utilitzar el botó de 'Mode Proves' a continuació mentre s'activa."
        );
      } else {
        setError(err.message || "S'ha produït un error en iniciar la sessió.");
      }
    }
  };

  const loginAsDemo = () => {
    const demoUser = {
      uid: "demo_somllar_user",
      email: "secretaria@somllar.cat",
      displayName: "Secretaria Som Llar",
      emailVerified: true,
      isAnonymous: false,
      metadata: {},
      providerData: [],
      refreshToken: "",
      tenantId: null,
      delete: async () => {},
      getIdToken: async () => "",
      getIdTokenResult: async () => ({} as any),
      reload: async () => {},
      toJSON: () => ({}),
      phoneNumber: null,
      photoURL: null,
      providerId: "demo"
    } as unknown as User;

    localStorage.setItem("somllar_auth_demo", JSON.stringify(demoUser));
    setUser(demoUser);
    setError(null);
  };

  const logout = async () => {
    try {
      localStorage.removeItem("somllar_auth_demo");
      if (auth) {
        await fbSignOut(auth);
      }
      setUser(null);
      setError(null);
    } catch (err: any) {
      console.error("Error en tancar sessió:", err);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        loginWithGoogle,
        loginAsDemo,
        logout,
        clearError,
      }}
    >
      {loading ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
          <div className="flex flex-col items-center space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xl shadow-lg animate-pulse">
              SL
            </div>
            <p className="text-slate-600 text-sm font-medium animate-pulse">
              Carregant entorn segur de Som Llar...
            </p>
          </div>
        </div>
      ) : !user ? (
        <LoginPage 
          onLogin={loginWithGoogle} 
          onLoginDemo={loginAsDemo}
          error={error} 
          onClearError={clearError} 
        />
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth ha de ser utilitzat dins d'un AuthProvider");
  }
  return context;
}

// Login Screen component with Som Llar Corporate Identity
function LoginPage({ 
  onLogin, 
  onLoginDemo,
  error, 
  onClearError 
}: { 
  onLogin: () => void; 
  onLoginDemo: () => void;
  error: string | null; 
  onClearError: () => void; 
}) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/50 p-6 sm:p-8 space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-2xl shadow-md ring-4 ring-emerald-100">
            SL
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight pt-2">
            Som Llar
          </h1>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full inline-block">
            Plataforma de Justificacions
          </p>
          <p className="text-xs text-slate-500 pt-1">
            Gestió econòmica, imputació i justificació de subvencions i licitacions públiques.
          </p>
        </div>

        {/* Security Warning Badge */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start space-x-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-800 block">Accés Corporatiu Protegit</span>
            <span>Només el personal acreditat amb correu corporatiu <strong>@somllar.cat</strong> té accés a aquest sistema.</span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1 animate-in fade-in">
            <div className="flex items-center space-x-2 font-bold">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>Avís d&apos;Autenticació</span>
            </div>
            <p className="text-rose-700 leading-relaxed">{error}</p>
          </div>
        )}

        {/* Login Action Buttons */}
        <div className="pt-2 space-y-3">
          <button
            onClick={onLogin}
            className="w-full flex items-center justify-center space-x-3 px-4 py-3.5 rounded-2xl bg-slate-900 hover:bg-black text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all transform active:scale-98 group"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.8 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
            <span>Iniciar sessió amb compte @somllar.cat</span>
          </button>

          <button
            onClick={onLoginDemo}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-medium text-xs border border-emerald-200 transition-colors"
          >
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>Accedir amb compte autoritzat de prova (secretaria@somllar.cat)</span>
          </button>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">
            Som Llar &bull; Associació ProHabitatge &bull; Exercici 2026
          </p>
        </div>

      </div>
    </div>
  );
}

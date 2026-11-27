"use client";

import { useSyncExternalStore } from "react";

/**
 * Install prompt of the app (PWA). Chrome and Edge fire `beforeinstallprompt` once per page load,
 * when the platform can be installed and is not installed yet; the event is kept here (from the
 * first moment, before the login screen) so that a button can open the install dialog later.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

let started = false;
/** Starts listening for the install prompt. Called as early as possible (from PwaRegister). */
export function startInstallPromptCapture() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); // the app shows its own button instead of the browser's mini-infobar
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** True while the browser offers to install the app. */
export function useCanInstallApp(): boolean {
  return useSyncExternalStore(subscribe, () => deferredPrompt !== null, () => false);
}

/** Opens the browser's install dialog. Returns true if the person accepted. */
export async function promptInstallApp(): Promise<boolean> {
  const prompt = deferredPrompt;
  if (!prompt) return false;
  // The event can only be used once
  deferredPrompt = null;
  notify();
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === "accepted";
}

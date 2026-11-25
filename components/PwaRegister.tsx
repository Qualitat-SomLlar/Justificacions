"use client";

import { useEffect } from "react";

/** Registers the service worker that makes the platform installable as an app (PWA). */
export default function PwaRegister() {
  useEffect(() => {
    // Not in development: a service worker would get in the way of hot reloading
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(err => {
      console.warn("No s'ha pogut registrar el service worker:", err);
    });
  }, []);
  return null;
}

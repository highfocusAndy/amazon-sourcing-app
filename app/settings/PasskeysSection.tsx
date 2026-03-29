"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";

export function PasskeysSection({ className = "" }: { className?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAddPasskey() {
    setMessage(null);
    setError(null);
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setError("Passkeys are not supported in this browser. Try Chrome, Safari, or Edge on a recent version.");
      return;
    }
    setLoading(true);
    try {
      const optRes = await fetch("/api/passkeys/register/options", {
        method: "POST",
        credentials: "same-origin",
      });
      const options = (await optRes.json()) as PublicKeyCredentialCreationOptionsJSON & { error?: string };
      if (!optRes.ok) {
        setError(options.error ?? "Could not start passkey registration.");
        return;
      }

      const attestation = await startRegistration(options);

      const verifyRes = await fetch("/api/passkeys/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ response: attestation }),
      });
      const verifyJson = (await verifyRes.json()) as { ok?: boolean; error?: string };
      if (!verifyRes.ok || !verifyJson.ok) {
        setError(verifyJson.error ?? "Could not save passkey.");
        return;
      }

      setMessage(
        "Passkey added. You can sign in with Face ID, fingerprint, or your device PIN on this device — use the button on the login page.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Passkey registration failed.";
      if (/abort|cancel/i.test(msg)) {
        setError("Registration was cancelled.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <p className="text-sm text-slate-600">
        Add a passkey to sign in with your device biometrics or screen lock (Face ID, Touch ID, Windows Hello,
        or phone PIN). You can add more than one device.
      </p>
      <button
        type="button"
        onClick={() => void handleAddPasskey()}
        disabled={loading}
        className="mt-3 rounded-lg border border-teal-600/40 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800 shadow-sm hover:bg-teal-100 disabled:opacity-50"
      >
        {loading ? "Follow prompts on your device…" : "Add passkey"}
      </button>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

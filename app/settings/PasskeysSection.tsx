"use client";

import { useState } from "react";

export function PasskeysSection({ className = "" }: { className?: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function handleAddPasskey() {
    setMessage(null);
    if (!window.PublicKeyCredential) {
      setMessage("Passkeys are not supported in this browser. Try Chrome, Safari, or Edge.");
      return;
    }
    setMessage("Passkey registration will be available in a future update. For now, use your password to sign in.");
  }

  return (
    <div className={className}>
      <p className="text-sm text-slate-600">
        Add a passkey to sign in with your device biometrics or PIN. Fewer passwords to remember.
      </p>
      <button
        type="button"
        onClick={handleAddPasskey}
        className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        Add passkey
      </button>
      {message && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Passkey sign-in (WebAuthn) will be enabled in an upcoming update.
      </p>
    </div>
  );
}

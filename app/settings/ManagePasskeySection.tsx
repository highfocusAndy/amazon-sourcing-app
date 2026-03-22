"use client";

import { useState } from "react";

/** Shown in the "Change passkey" panel when user has (or may have) a passkey. */
export function ManagePasskeySection({ className = "" }: { className?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  // TODO: fetch from API whether user has a passkey; for now we show placeholder
  const hasPasskey = false;

  async function handleRemovePasskey() {
    setMessage(null);
    setMessage("Passkey removal will be available when WebAuthn is enabled. For now, use your password to sign in.");
  }

  if (!hasPasskey) {
    return (
      <div className={className}>
        <p className="text-sm text-slate-600">
          You don’t have a passkey yet. Add one from <strong>Add passkey</strong> in the menu; then you can change or remove it here.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-sm text-slate-600">
        You have a passkey registered. You can remove it and add a new one later.
      </p>
      <button
        type="button"
        onClick={handleRemovePasskey}
        className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        Remove passkey
      </button>
      {message && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      )}
    </div>
  );
}

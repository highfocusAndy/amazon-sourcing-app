"use client";

import { useCallback, useEffect, useState } from "react";

type PasskeyRow = { id: string; label: string | null; createdAt: string };

export function ManagePasskeySection({ className = "" }: { className?: string }) {
  const [passkeys, setPasskeys] = useState<PasskeyRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/passkeys", { credentials: "same-origin" });
      const data = (await res.json()) as { passkeys?: PasskeyRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load passkeys.");
        setPasskeys([]);
        return;
      }
      setPasskeys(data.passkeys ?? []);
    } catch {
      setError("Could not load passkeys.");
      setPasskeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function removePasskey(id: string) {
    setRemovingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/passkeys/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not remove passkey.");
        return;
      }
      await load();
    } catch {
      setError("Could not remove passkey.");
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <div className={className}>
        <p className="text-sm text-slate-500">Loading passkeys…</p>
      </div>
    );
  }

  if (!passkeys?.length) {
    return (
      <div className={className}>
        <p className="text-sm text-slate-600">
          You don&apos;t have a passkey yet. Add one from <strong>Add passkey</strong> in the menu; then you can
          remove it here if needed.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-sm text-slate-600">
        Passkeys linked to your account. Removing one does not change your password.
      </p>
      <ul className="mt-3 space-y-2">
        {passkeys.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <span className="text-slate-800">
              {p.label?.trim() || "Passkey"}{" "}
              <span className="text-slate-400">
                · added {new Date(p.createdAt).toLocaleDateString()}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void removePasskey(p.id)}
              disabled={removingId === p.id}
              className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
            >
              {removingId === p.id ? "Removing…" : "Remove"}
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

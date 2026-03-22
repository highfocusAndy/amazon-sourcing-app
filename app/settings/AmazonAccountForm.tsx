"use client";

import { useEffect, useState } from "react";

const BTN_PRIMARY =
  "w-fit rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-500 disabled:opacity-50 transition-all";
const BTN_OUTLINE =
  "w-fit rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all";

export function AmazonAccountForm({
  className = "",
  onStatusChange,
}: {
  className?: string;
  onStatusChange?: (
    status: { connected: boolean; emailMasked?: string; connectionLabel?: string } | null,
  ) => void;
}) {
  const [status, setStatus] = useState<{
    connected: boolean;
    oauthConnected?: boolean;
    sellerIdMasked?: string;
    emailMasked?: string;
    connectionLabel?: string;
    updatedAt?: string;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function refreshStatus() {
    fetch("/api/settings/amazon-account")
      .then((res) => res.json())
      .then((data) => {
        const next =
          data.connected
            ? {
                connected: true,
                oauthConnected: data.oauthConnected as boolean | undefined,
                sellerIdMasked: data.sellerIdMasked as string | undefined,
                emailMasked: data.emailMasked as string | undefined,
                connectionLabel: data.connectionLabel as string | undefined,
                updatedAt: data.updatedAt as string | undefined,
              }
            : { connected: false };
        setStatus(next);
        onStatusChange?.(next);
      })
      .catch(() => {
        const next = { connected: false };
        setStatus(next);
        onStatusChange?.(next);
      });
  }

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once; parent setState is stable
  }, []);

  function startOAuth() {
    setError(null);
    setSuccess(null);
    window.location.href = "/api/amazon/oauth/start";
  }

  async function disconnectOAuth() {
    setError(null);
    setSuccess(null);
    setDisconnecting(true);
    try {
      const res = await fetch("/api/settings/amazon-account", {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to disconnect.");
        setDisconnecting(false);
        return;
      }
      setSuccess("Amazon seller authorization removed.");
      refreshStatus();
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setDisconnecting(false);
  }

  if (status === null) {
    return (
      <div className={className}>
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <p className="text-sm text-slate-600">
        Connect your Selling Partner account with Amazon&apos;s secure OAuth flow. Your password is never
        stored—we only keep an encrypted refresh token so the app can call SP-API on your behalf. Your server
        must still have{" "}
        <code className="rounded bg-slate-100 px-1 text-xs">SP_API_CLIENT_ID</code>,{" "}
        <code className="rounded bg-slate-100 px-1 text-xs">SP_API_CLIENT_SECRET</code>, and AWS signing keys
        in the environment.
      </p>

      {status.connected && status.connectionLabel && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Connected: <span className="font-medium">{status.connectionLabel}</span>
          {status.oauthConnected ? (
            <span className="ml-2 text-xs text-emerald-700">(OAuth)</span>
          ) : null}
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {status.oauthConnected ? (
          <button
            type="button"
            disabled={disconnecting}
            onClick={disconnectOAuth}
            className={BTN_OUTLINE}
          >
            {disconnecting ? "Disconnecting…" : "Disconnect Amazon seller"}
          </button>
        ) : (
          <button type="button" onClick={startOAuth} className={BTN_PRIMARY}>
            Connect Amazon (OAuth)
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500">
        In{" "}
        <a
          href="https://developercentral.amazon.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-teal-600 hover:underline"
        >
          Amazon Developer Central
        </a>
        , register a <strong>Login URI</strong> and <strong>Redirect URI</strong> that match this app (see
        README). Use the same marketplace region as your Seller Central account when authorizing.
      </p>
    </div>
  );
}

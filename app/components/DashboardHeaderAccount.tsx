"use client";

import { useState } from "react";
import type { Session } from "next-auth";

export function DashboardHeaderAccount({
  session,
  amazonConnected,
  accountTitle,
  onConnectAmazon,
  onAmazonDisconnected,
}: {
  session: Session | null;
  amazonConnected: boolean;
  /** Store name (preferred) or fallback label when Amazon is linked */
  accountTitle: string | null;
  onConnectAmazon: () => void;
  /** Called after Amazon OAuth (and linked store name) is removed so the header can refresh */
  onAmazonDisconnected?: () => void;
}) {
  const [disconnecting, setDisconnecting] = useState(false);

  if (!session?.user) return null;

  if (!amazonConnected) {
    return (
      <button
        type="button"
        onClick={onConnectAmazon}
        className="rounded-lg border border-teal-500/60 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 hover:text-teal-200 transition-colors"
      >
        Connect Amazon account
      </button>
    );
  }

  const title = accountTitle?.trim() || "Amazon";

  async function handleDisconnectAmazon() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/settings/amazon-account", {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        onAmazonDisconnected?.();
      }
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5 text-right min-w-0 max-w-[min(100%,18rem)]">
      <span
        className="text-sm font-semibold text-slate-100 leading-snug truncate w-full"
        title={title}
      >
        {title}
      </span>
      <button
        type="button"
        disabled={disconnecting}
        onClick={handleDisconnectAmazon}
        className="text-[11px] text-slate-400 underline underline-offset-2 decoration-slate-500 hover:text-teal-200 self-end disabled:opacity-50"
      >
        {disconnecting ? "Disconnecting…" : "Disconnect Amazon"}
      </button>
    </div>
  );
}

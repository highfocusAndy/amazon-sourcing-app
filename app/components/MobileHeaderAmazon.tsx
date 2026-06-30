"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { AmazonAccountModal } from "@/app/settings/AmazonAccountModal";

/** Compact Amazon link/CTA for the mobile dashboard top bar (md+ uses page header). */
export function MobileHeaderAmazon() {
  const { data: session } = useSession();
  const [amazonStatus, setAmazonStatus] = useState<{ connected: boolean; title: string | null }>({
    connected: false,
    title: null,
  });
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/settings/amazon-account")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.connected) {
          const title =
            (data.storeName as string | undefined)?.trim() ||
            (data.connectionLabel as string | undefined) ||
            (data.emailMasked as string | undefined) ||
            "Amazon linked";
          setAmazonStatus({ connected: true, title });
        } else {
          setAmazonStatus({ connected: false, title: null });
        }
      })
      .catch(() => {
        setAmazonStatus({ connected: false, title: null });
      });
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    refresh();
  }, [refresh, session?.user]);

  if (!session?.user) return null;

  if (!amazonStatus.connected) {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          title="Connect your Amazon seller account"
          className="shrink-0 rounded border border-teal-500/55 bg-teal-500/10 px-1 py-0.5 text-[9px] font-semibold leading-none text-teal-300 shadow-sm hover:bg-teal-500/20 hover:text-teal-200 sm:px-1.5 sm:py-0.5 sm:text-[10px]"
        >
          <span className="sm:hidden">Amazon</span>
          <span className="hidden sm:inline">Connect Amazon</span>
        </button>
        {modalOpen ? (
          <AmazonAccountModal
            onClose={() => {
              setModalOpen(false);
              refresh();
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        title="Manage Amazon seller account"
        className="flex max-w-[5.5rem] shrink-0 flex-col items-end gap-0 text-right"
      >
        <span className="truncate text-[10px] font-semibold leading-tight text-teal-200/90">
          {amazonStatus.title ?? "Amazon"}
        </span>
        <span className="text-[9px] leading-tight text-slate-400 underline underline-offset-1 decoration-slate-500">
          manage
        </span>
      </button>
      {modalOpen ? (
        <AmazonAccountModal
          onClose={() => {
            setModalOpen(false);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}

"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { AmazonAccountModal } from "@/app/settings/AmazonAccountModal";

/** Compact Amazon link/CTA for the mobile dashboard top bar (md+ uses page header). */
export function MobileHeaderAmazon() {
  const { data: session } = useSession();
  const [amazonConnected, setAmazonConnected] = useState(false);
  const [amazonTitle, setAmazonTitle] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(() => {
    if (!session?.user) {
      setAmazonConnected(false);
      setAmazonTitle(null);
      return;
    }
    fetch("/api/settings/amazon-account")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.connected) {
          setAmazonConnected(true);
          const title =
            (data.storeName as string | undefined)?.trim() ||
            (data.connectionLabel as string | undefined) ||
            (data.emailMasked as string | undefined) ||
            "Amazon linked";
          setAmazonTitle(title);
        } else {
          setAmazonConnected(false);
          setAmazonTitle(null);
        }
      })
      .catch(() => {
        setAmazonConnected(false);
        setAmazonTitle(null);
      });
  }, [session?.user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!session?.user) return null;

  if (!amazonConnected) {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          title="Connect your Amazon seller account"
          className="shrink-0 rounded-md border border-teal-500/55 bg-teal-500/10 px-2 py-1 text-[10px] font-semibold leading-none text-teal-300 shadow-sm hover:bg-teal-500/20 hover:text-teal-200"
        >
          Connect Amazon
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
    <span
      className="max-w-[5.5rem] shrink-0 truncate text-right text-[10px] font-semibold leading-tight text-teal-200/90"
      title={amazonTitle ?? "Amazon connected"}
    >
      {amazonTitle ?? "Amazon"}
    </span>
  );
}

"use client";

import { useState } from "react";
import { PromoCodeModal } from "./PromoCodeModal";

export function PromoCodeNavButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lp-b text-sm font-medium text-slate-400 transition hover:text-amber-300"
      >
        Promo code
      </button>
      <PromoCodeModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

"use client";

import { useEffect, useState } from "react";

type ListUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  trialEndsAt: string | null;
  promoAccessUntil: string | null;
  subscriptionStatus: string;
  subscriptionPlan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId?: string | null;
  amazonAccount: { amazonStoreName: string | null; sellerId: string | null; updatedAt?: string } | null;
  promoRedemptions: { redeemedAt: string; promoCode: { code: string } }[];
  monthlyUsage: { metric: string; used: number; limit: number | null }[];
  lastActiveAt: string | null;
  monthlyUsageTotals?: { mtd: number };
};

type DetailPayload = {
  usageByPeriod: Record<string, Record<string, { used: number; limit: number | null; updatedAt: string }>>;
  user: {
    monthlyUsageFlat: Array<{
      periodKey: string;
      metric: string;
      used: number;
      limit: number | null;
      updatedAt: string;
    }>;
  } & ListUser;
};

function fmtDt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ManageUserDrawer({
  user,
  open,
  onClose,
  accessLabel,
  onSuccess,
}: {
  user: ListUser | null;
  open: boolean;
  onClose: () => void;
  accessLabel: { label: string; tone: string };
  onSuccess: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [extendDays, setExtendDays] = useState("30");
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!open || !user?.id) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    void fetch(`/api/admin/users/${user.id}`)
      .then((r) => r.json())
      .then(
        (d: {
          ok?: boolean;
          user?: DetailPayload["user"];
          usageByPeriod?: DetailPayload["usageByPeriod"];
        }) => {
          if (d.ok && d.user && d.usageByPeriod) {
            setDetail({ user: d.user, usageByPeriod: d.usageByPeriod });
          } else {
            setDetail(null);
          }
        },
      )
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [open, user?.id]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3400);
  }

  async function patch(action: "extend_access" | "revoke_access" | "set_plan", extra?: Record<string, unknown>) {
    if (!user) return;
    setWorking(true);
    try {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action, ...extra }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string; promoAccessUntil?: string };
      if (d.ok) {
        showToast("Updated", true);
        await onSuccess();
      } else {
        showToast(d.error ?? "Error", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setWorking(false);
    }
  }

  if (!open || !user) return null;

  const periods =
    detail?.usageByPeriod
      ? Object.keys(detail.usageByPeriod).sort().reverse()
      : [];

  const u = detail?.user ?? user;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/[0.06] bg-[#0b0e14] shadow-[-24px_0_64px_rgba(0,0,0,0.85)]">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Manage user</p>
            <h2 className="mt-1 truncate text-lg font-semibold tracking-tight text-white">{user.email}</h2>
            {user.name ? <p className="truncate text-xs text-slate-500">{user.name}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            Close
          </button>
        </div>

        {toast ? (
          <div
            className={`mx-5 mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${
              toast.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            {toast.msg}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${accessLabel.tone}`}>
              {accessLabel.label}
            </span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
              Plan · {user.subscriptionPlan}
            </span>
            {user.subscriptionStatus !== "none" ? (
              <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-200">
                Stripe · {user.subscriptionStatus}
              </span>
            ) : null}
          </div>

          <section className="mt-6 space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Account</h3>
            <dl className="grid grid-cols-1 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-xs">
              <div className="flex justify-between gap-2 border-b border-white/[0.04] pb-2">
                <dt className="text-slate-500">Joined</dt>
                <dd className="font-medium tabular-nums text-slate-200">{fmtDt(user.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.04] pb-2">
                <dt className="text-slate-500">Last activity</dt>
                <dd className="font-medium tabular-nums text-slate-200">{fmtDt(user.lastActiveAt)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.04] pb-2">
                <dt className="text-slate-500">Trial ends</dt>
                <dd className="font-medium tabular-nums text-slate-200">{fmtDt(user.trialEndsAt)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.04] pb-2">
                <dt className="text-slate-500">Promo access until</dt>
                <dd className="font-medium tabular-nums text-slate-200">{fmtDt(user.promoAccessUntil)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">IDs</dt>
                <dd className="max-w-[55%] break-all text-right font-mono text-[10px] text-slate-400">
                  {user.stripeCustomerId ?? "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Amazon seller</h3>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-xs">
              {user.amazonAccount?.sellerId ? (
                <>
                  <p className="font-medium text-slate-100">{user.amazonAccount.amazonStoreName ?? "Linked account"}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">Seller {user.amazonAccount.sellerId}</p>
                  {user.amazonAccount.updatedAt ? (
                    <p className="mt-2 text-[10px] text-slate-500">OAuth row updated · {fmtDt(user.amazonAccount.updatedAt)}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-slate-500">Not linked</p>
              )}
            </div>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Promo history</h3>
            <ul className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs">
              {(u.promoRedemptions ?? []).length ? (
                (u.promoRedemptions ?? []).map((pr) => (
                  <li key={`${pr.redeemedAt}-${pr.promoCode.code}`} className="flex justify-between gap-2 border-b border-white/[0.04] py-2 last:border-0">
                    <span className="font-mono font-medium text-teal-200">{pr.promoCode.code}</span>
                    <span className="tabular-nums text-slate-500">{fmtDt(pr.redeemedAt)}</span>
                  </li>
                ))
              ) : (
                <li className="py-3 text-center text-slate-500">No redemptions recorded</li>
              )}
            </ul>
          </section>

          <section className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Usage history</h3>
              {loadingDetail ? <span className="text-[10px] text-slate-600">Loading…</span> : null}
            </div>
            <div className="space-y-2">
              {periods.length ? (
                periods.slice(0, 6).map((pk) => (
                  <div key={pk} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{pk}</p>
                    <ul className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-slate-300">
                      {Object.entries(detail!.usageByPeriod[pk]).map(([m, row]) => (
                        <li key={m} className="flex justify-between gap-2">
                          <span className="text-slate-500">{m}</span>
                          <span className="tabular-nums">
                            {row.used}
                            {row.limit != null ? `/${row.limit}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-white/[0.08] px-3 py-8 text-center text-xs text-slate-500">
                  {loadingDetail ? "Loading usage snapshots…" : "No historic usage buckets yet"}
                </p>
              )}
            </div>
          </section>

          <section className="mt-8 space-y-3 border-t border-white/[0.06] pt-6">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Admin actions</h3>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-teal-500/[0.04] px-3 py-3">
              <input
                type="number"
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                min={1}
                max={3650}
                className="w-16 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-teal-400/60"
              />
              <span className="text-xs text-slate-500">days</span>
              <button
                type="button"
                disabled={working}
                onClick={() => void patch("extend_access", { days: Number(extendDays) })}
                className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
              >
                Extend access
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => void patch("set_plan", { plan: user.subscriptionPlan === "pro" ? "starter" : "pro" })}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/[0.05]"
              >
                Toggle plan ({user.subscriptionPlan === "pro" ? "→ starter" : "→ pro"})
              </button>
            </div>
            <button
              type="button"
              disabled={working}
              onClick={() => {
                if (confirm("Revoke promo/trial clocks for this user?")) void patch("revoke_access");
              }}
              className="w-full rounded-lg border border-rose-500/35 bg-rose-500/[0.08] px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/15 disabled:opacity-50"
            >
              Revoke extended access (promo/trial timestamps)
            </button>
          </section>
        </div>
      </aside>
    </>
  );
}

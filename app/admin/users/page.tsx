"use client";

import { useEffect, useState } from "react";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  trialEndsAt: string | null;
  promoAccessUntil: string | null;
  subscriptionStatus: string;
  subscriptionPlan: string;
  stripeCustomerId: string | null;
  amazonAccount: { amazonStoreName: string | null; sellerId: string | null } | null;
  promoRedemptions: { redeemedAt: string; promoCode: { code: string } }[];
  monthlyUsage: { metric: string; used: number; limit: number | null }[];
};

function accessStatus(user: UserRow): { label: string; color: string } {
  const now = Date.now();
  if (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing") {
    return { label: `Stripe ${user.subscriptionPlan}`, color: "text-teal-400" };
  }
  if (user.promoAccessUntil && new Date(user.promoAccessUntil).getTime() > now) {
    return { label: "Promo active", color: "text-cyan-400" };
  }
  if (user.trialEndsAt && new Date(user.trialEndsAt).getTime() > now) {
    return { label: "Trial", color: "text-yellow-400" };
  }
  return { label: "No access", color: "text-rose-400" };
}

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    void fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d: { users: UserRow[] }) => { setUsers(d.users); setLoading(false); });
  }, []);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function doAction(userId: string, action: string, extra?: Record<string, unknown>) {
    setWorking(true);
    try {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, ...extra }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string; promoAccessUntil?: string };
      if (d.ok) {
        showToast("Done!", true);
        setUsers((prev) =>
          prev.map((u) => {
            if (u.id !== userId) return u;
            if (action === "extend_access" && d.promoAccessUntil) return { ...u, promoAccessUntil: d.promoAccessUntil };
            if (action === "revoke_access") return { ...u, promoAccessUntil: null, trialEndsAt: null };
            return u;
          }),
        );
      } else {
        showToast(d.error ?? "Error", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setWorking(false);
      setActionUserId(null);
    }
  }

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Users</h1>
          <p className="mt-0.5 text-sm text-slate-400">{users.length} total</p>
        </div>
        <input
          type="search"
          placeholder="Search by email or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
        />
      </div>

      {toast && (
        <div className={`mb-4 rounded-lg px-4 py-2 text-sm font-medium ${toast.ok ? "bg-teal-900/60 text-teal-300" : "bg-rose-900/60 text-rose-300"}`}>
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Trial ends</th>
                <th className="px-4 py-3">Promo until</th>
                <th className="px-4 py-3">Amazon</th>
                <th className="px-4 py-3">This month</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {filtered.map((user) => {
                const status = accessStatus(user);
                const totalUsage = user.monthlyUsage.reduce((s, m) => s + m.used, 0);
                return (
                  <tr key={user.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-200">{user.email}</p>
                      {user.name && <p className="text-xs text-slate-500">{user.name}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${status.color}`}>{status.label}</span>
                      <p className="text-xs text-slate-500">{user.subscriptionPlan}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fmt(user.trialEndsAt)}</td>
                    <td className="px-4 py-3 text-slate-400">{fmt(user.promoAccessUntil)}</td>
                    <td className="px-4 py-3">
                      {user.amazonAccount?.amazonStoreName ? (
                        <span className="text-slate-300">{user.amazonAccount.amazonStoreName}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {totalUsage > 0 ? (
                        <div className="text-xs text-slate-300">
                          {user.monthlyUsage.map((m) => (
                            <div key={m.metric}>{m.metric}: {m.used}{m.limit ? `/${m.limit}` : ""}</div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-600 text-xs">No usage</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fmt(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      {actionUserId === user.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={extendDays}
                            onChange={(e) => setExtendDays(e.target.value)}
                            className="w-16 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-100 outline-none"
                            min={1}
                            max={3650}
                          />
                          <span className="text-xs text-slate-400">days</span>
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void doAction(user.id, "extend_access", { days: Number(extendDays) })}
                            className="rounded bg-teal-600 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                          >
                            Extend
                          </button>
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => { if (confirm("Revoke all access?")) void doAction(user.id, "revoke_access"); }}
                            className="rounded bg-rose-700 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
                          >
                            Revoke
                          </button>
                          <button
                            type="button"
                            onClick={() => setActionUserId(null)}
                            className="text-xs text-slate-500 hover:text-slate-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActionUserId(user.id)}
                          className="rounded border border-slate-600 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          Manage
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

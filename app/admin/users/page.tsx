"use client";

import { ManageUserDrawer } from "@/app/admin/ManageUserDrawer";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";


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
  amazonAccount: {
    amazonStoreName: string | null;
    sellerId: string | null;
    updatedAt?: string;
  } | null;
  promoRedemptions: { redeemedAt: string; promoCode: { code: string } }[];
  monthlyUsage: { metric: string; used: number; limit: number | null }[];
  lastActiveAt: string | null;
  monthlyUsageTotals?: { mtd: number };
};

type SortKey =
  | "email"
  | "access"
  | "plan"
  | "trialEnd"
  | "mtd"
  | "joined"
  | "amazon"
  | "lastActive";

function accessClassification(user: UserRow): {
  label: string;
  toneClass: string;
  sortBucket: number;
} {
  const now = Date.now();
  const trialOk = user.trialEndsAt && new Date(user.trialEndsAt).getTime() > now;
  const promoOk = user.promoAccessUntil && new Date(user.promoAccessUntil).getTime() > now;
  const sub = user.subscriptionStatus;

  if (sub === "active" || sub === "trialing") {
    return {
      label: sub === "trialing" ? "Trialing (Stripe)" : "Active subscriber",
      toneClass:
        sub === "trialing"
          ? "border-indigo-500/35 bg-indigo-500/[0.12] text-indigo-100"
          : "border-emerald-500/40 bg-emerald-500/[0.12] text-emerald-50",
      sortBucket: 5,
    };
  }
  if (promoOk) {
    return {
      label: "Promo access",
      toneClass: "border-cyan-500/35 bg-cyan-500/[0.12] text-cyan-100",
      sortBucket: 4,
    };
  }
  if (trialOk) {
    return {
      label: "Signup trial",
      toneClass: "border-amber-500/35 bg-amber-500/[0.12] text-amber-100",
      sortBucket: 3,
    };
  }
  return {
    label: "No workspace access",
    toneClass: "border-rose-500/35 bg-rose-500/[0.1] text-rose-100",
    sortBucket: 1,
  };
}

function planBadge(plan: string) {
  const p = plan.toLowerCase();
  if (p === "pro") return "border-violet-500/35 bg-violet-500/10 text-violet-100";
  return "border-slate-500/35 bg-slate-700/55 text-slate-100";
}

function fmtIso(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtJoined(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [drawerUser, setDrawerUser] = useState<UserRow | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "joined",
    dir: "desc",
  });

  const loadUsers = useCallback(async (): Promise<UserRow[]> => {
    try {
      const r = await fetch("/api/admin/users");
      const d = (await r.json()) as { users?: UserRow[] };
      const list = d.users ?? [];
      setUsers(list);
      return list;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadUsers();
  }, [loadUsers]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;

    arr.sort((a, b) => {
      switch (sort.key) {
        case "email":
          return a.email.localeCompare(b.email) * dir;
        case "joined":
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        case "trialEnd":
          return (
            (new Date(a.trialEndsAt ?? 0).getTime() - new Date(b.trialEndsAt ?? 0).getTime()) * dir
          );
        case "plan":
          return a.subscriptionPlan.localeCompare(b.subscriptionPlan) * dir;
        case "amazon": {
          const xa = Boolean(a.amazonAccount?.sellerId);
          const xb = Boolean(b.amazonAccount?.sellerId);
          return (Number(xa) - Number(xb)) * dir || a.email.localeCompare(b.email);
        }
        case "mtd":
          return (
            ((a.monthlyUsageTotals?.mtd ?? 0) - (b.monthlyUsageTotals?.mtd ?? 0)) * dir ||
            a.email.localeCompare(b.email)
          );
        case "lastActive": {
          const ta = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
          const tb = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
          return (ta - tb) * dir || a.email.localeCompare(b.email);
        }
        case "access":
          return (
            (accessClassification(a).sortBucket - accessClassification(b).sortBucket) * dir ||
            a.email.localeCompare(b.email)
          );
        default:
          return 0;
      }
    });

    return arr;
  }, [filtered, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
  }

  function SortButton({ column, children }: { column: SortKey; children: ReactNode }) {
    const active = sort.key === column;
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className={`group inline-flex items-center gap-1 text-left uppercase tracking-[0.12em] transition hover:text-slate-200 ${
          active ? "text-white" : "text-slate-500"
        }`}
      >
        {children}
        <span className={`text-[10px] font-normal ${active ? "text-teal-300" : "text-slate-600"}`}>
          {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    );
  }

  const drawerClassification = drawerUser ? accessClassification(drawerUser) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Users</h1>
          <p className="mt-1 text-sm text-slate-500">
            {users.length.toLocaleString()} identity records · Stripe + promo + quotas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Email or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[200px] flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none ring-teal-500/0 transition focus:border-teal-400/55 focus:ring-2 focus:ring-teal-500/35"
          />
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadUsers().then(() => showToast("Synced", true));
            }}
            className="rounded-xl border border-white/[0.1] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 hover:bg-white/[0.04]"
          >
            Refresh
          </button>
          <Link
            href="/admin"
            className="rounded-xl border border-white/[0.1] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:bg-white/[0.04]"
          >
            Overview
          </Link>
        </div>
      </div>

      {toast ? (
        <div
          className={`rounded-xl border px-4 py-2 text-sm ${toast.ok ? "border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-50" : "border-rose-500/35 bg-rose-500/[0.08] text-rose-50"}`}
        >
          {toast.msg}
        </div>
      ) : null}

      <ManageUserDrawer
        open={Boolean(drawerUser)}
        user={drawerUser}
        onClose={() => setDrawerUser(null)}
        accessLabel={{
          label: drawerClassification?.label ?? "—",
          tone: drawerClassification?.toneClass ?? "border-slate-700 text-slate-300",
        }}
        onSuccess={async () => {
          const list = await loadUsers();
          setDrawerUser((prev) => (prev ? list.find((u) => u.id === prev.id) ?? prev : null));
        }}
      />

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-white/[0.06] py-28 text-sm text-slate-500">
          Loading directory…
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#080a0f]/80 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.85)] backdrop-blur">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-[13px]">
              <thead className="border-b border-white/[0.06] bg-white/[0.02] [&_button]:leading-tight">
                <tr className="font-semibold text-[10px] text-slate-500">
                  <th className="px-4 py-3 align-bottom">
                    <SortButton column="email">Identity</SortButton>
                  </th>
                  <th className="px-3 py-3 align-bottom">
                    <SortButton column="access">Billing state</SortButton>
                  </th>
                  <th className="px-3 py-3 align-bottom">
                    <SortButton column="plan">Plan</SortButton>
                  </th>
                  <th className="px-3 py-3 align-bottom">
                    <SortButton column="amazon">Marketplace OAuth</SortButton>
                  </th>
                  <th className="px-3 py-3 align-bottom text-right tabular-nums">
                    <SortButton column="mtd">Usage MTD</SortButton>
                  </th>
                  <th className="px-3 py-3 align-bottom">
                    <SortButton column="lastActive">Last active</SortButton>
                  </th>
                  <th className="px-3 py-3 align-bottom">
                    <SortButton column="trialEnd">Trial end</SortButton>
                  </th>
                  <th className="px-3 py-3 align-bottom">
                    <SortButton column="joined">Joined</SortButton>
                  </th>
                  <th className="px-4 py-3 align-bottom text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {sorted.map((user) => {
                  const acl = accessClassification(user);
                  const mtd = user.monthlyUsageTotals?.mtd ?? user.monthlyUsage.reduce((s, m) => s + m.used, 0);
                  return (
                    <tr key={user.id} className="group/row transition-colors hover:bg-white/[0.025]">
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate font-semibold text-slate-100">{user.email}</p>
                        {user.name ? <p className="truncate text-xs text-slate-600">{user.name}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${acl.toneClass}`}
                        >
                          {acl.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${planBadge(user.subscriptionPlan)}`}
                        >
                          {user.subscriptionPlan}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {user.amazonAccount?.sellerId ? (
                          <div className="max-w-[160px]">
                            <span className="block truncate text-[12px] text-slate-100">
                              {user.amazonAccount.amazonStoreName ?? user.amazonAccount.sellerId.slice(0, 8)}
                            </span>
                            <span className="truncate font-mono text-[10px] text-slate-600">
                              {user.amazonAccount.sellerId}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-right tabular-nums">
                        <span className={`font-semibold ${mtd === 0 ? "text-slate-600" : "text-teal-200"}`}>{mtd}</span>
                        {mtd > 0 ? (
                          <div className="mt-2 flex flex-wrap justify-end gap-1">
                            {user.monthlyUsage.slice(0, 3).map((m) => (
                              <span
                                key={m.metric}
                                className="rounded border border-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-500"
                              >
                                {m.metric}:{m.used}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top text-xs tabular-nums text-slate-400">{fmtIso(user.lastActiveAt)}</td>
                      <td className="px-3 py-3 align-top text-xs tabular-nums text-slate-400">
                        {user.trialEndsAt ? fmtIso(user.trialEndsAt) : "—"}
                      </td>
                      <td className="px-3 py-3 align-top text-xs tabular-nums text-slate-500">{fmtJoined(user.createdAt)}</td>
                      <td className="px-4 py-3 text-right align-top">
                        <button
                          type="button"
                          onClick={() => setDrawerUser(user)}
                          className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 text-[11px] font-semibold text-teal-100 opacity-95 transition hover:border-teal-400 hover:bg-teal-500/[0.2] group-hover:opacity-100"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-14 text-center text-sm text-slate-600">
                      No records match filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

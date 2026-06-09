"use client";

import React, { useEffect, useState } from "react";

type PromoRow = {
  id: string;
  code: string;
  label: string | null;
  grantsDays: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: string | null;
  active: boolean;
  allowRepeatRedemption: boolean;
  createdAt: string;
  _count: { redemptions: number };
  redemptions: { redeemedAt: string; user: { email: string } }[];
};

type EditForm = {
  label: string;
  grantsDays: string;
  maxRedemptions: string;
  expiresAt: string;
  allowRepeatRedemption: boolean;
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toDateInputValue(d: string | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  code: "",
  label: "",
  grantsDays: "30",
  maxRedemptions: "",
  expiresAt: "",
  allowRepeatRedemption: false,
};

export default function AdminPromosPage() {
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    label: "",
    grantsDays: "",
    maxRedemptions: "",
    expiresAt: "",
    allowRepeatRedemption: false,
  });
  const [editWorking, setEditWorking] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/promos")
      .then((r) => r.json())
      .then((d: { promos: PromoRow[] }) => { setPromos(d.promos); setLoading(false); });
  }, []);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function startEdit(promo: PromoRow) {
    setEditingId(promo.id);
    setEditForm({
      label: promo.label ?? "",
      grantsDays: String(promo.grantsDays),
      maxRedemptions: promo.maxRedemptions !== null ? String(promo.maxRedemptions) : "",
      expiresAt: toDateInputValue(promo.expiresAt),
      allowRepeatRedemption: promo.allowRepeatRedemption,
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(promo: PromoRow) {
    const grantsDays = Number(editForm.grantsDays);
    if (!Number.isFinite(grantsDays) || grantsDays < 1) {
      showToast("Grant days must be a positive number", false);
      return;
    }
    setEditWorking(true);
    try {
      const r = await fetch("/api/admin/promos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: promo.id,
          label: editForm.label || null,
          grantsDays,
          maxRedemptions: editForm.maxRedemptions ? Number(editForm.maxRedemptions) : null,
          expiresAt: editForm.expiresAt || null,
          allowRepeatRedemption: editForm.allowRepeatRedemption,
        }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) {
        setPromos((prev) =>
          prev.map((p) =>
            p.id === promo.id
              ? {
                  ...p,
                  label: editForm.label || null,
                  grantsDays,
                  maxRedemptions: editForm.maxRedemptions ? Number(editForm.maxRedemptions) : null,
                  expiresAt: editForm.expiresAt ? new Date(editForm.expiresAt).toISOString() : null,
                  allowRepeatRedemption: editForm.allowRepeatRedemption,
                }
              : p,
          ),
        );
        setEditingId(null);
        showToast("Promo updated!", true);
      } else {
        showToast(d.error ?? "Error", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setEditWorking(false);
    }
  }

  async function createPromo() {
    setWorking(true);
    try {
      const r = await fetch("/api/admin/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          label: form.label || undefined,
          grantsDays: Number(form.grantsDays),
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
          expiresAt: form.expiresAt || null,
          allowRepeatRedemption: form.allowRepeatRedemption,
        }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string; promo?: PromoRow };
      if (d.ok && d.promo) {
        setPromos((prev) => [d.promo!, ...prev]);
        setForm(EMPTY_FORM);
        setShowCreate(false);
        showToast("Promo code created!", true);
      } else {
        showToast(d.error ?? "Error", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setWorking(false);
    }
  }

  async function toggleActive(promo: PromoRow) {
    const r = await fetch("/api/admin/promos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: promo.id, active: !promo.active }),
    });
    const d = (await r.json()) as { ok?: boolean };
    if (d.ok) {
      setPromos((prev) => prev.map((p) => (p.id === promo.id ? { ...p, active: !p.active } : p)));
    }
  }

  async function deletePromo(promo: PromoRow) {
    if (!confirm(`Delete promo code "${promo.code}"? This cannot be undone.`)) return;
    const r = await fetch(`/api/admin/promos?id=${promo.id}`, { method: "DELETE" });
    const d = (await r.json()) as { ok?: boolean };
    if (d.ok) {
      setPromos((prev) => prev.filter((p) => p.id !== promo.id));
      showToast("Promo deleted.", true);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Promo Codes</h1>
          <p className="mt-0.5 text-sm text-slate-400">{promos.length} total</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 transition-colors"
        >
          + New Promo Code
        </button>
      </div>

      {toast && (
        <div className={`mb-4 rounded-lg px-4 py-2 text-sm font-medium ${toast.ok ? "bg-teal-900/60 text-teal-300" : "bg-rose-900/60 text-rose-300"}`}>
          {toast.msg}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-teal-700/50 bg-slate-800/60 p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-100">Create Promo Code</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Code *</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="SUMMER2026"
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Partner access"
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Grant days *</label>
              <input
                type="number"
                value={form.grantsDays}
                onChange={(e) => setForm((f) => ({ ...f, grantsDays: e.target.value }))}
                min={1}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Max redemptions</label>
              <input
                type="number"
                value={form.maxRedemptions}
                onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
                placeholder="Unlimited"
                min={1}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Expires at</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.allowRepeatRedemption}
                  onChange={(e) => setForm((f) => ({ ...f, allowRepeatRedemption: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-500 accent-teal-500"
                />
                Allow repeat redemption
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void createPromo()}
              disabled={working || !form.code.trim() || !form.grantsDays}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
            >
              {working ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); }}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Grant</th>
                <th className="px-4 py-3">Redemptions</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Options</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {promos.map((promo) => (
                <React.Fragment key={promo.id}>
                  <tr className={`hover:bg-slate-800/40 transition-colors ${editingId === promo.id ? "bg-slate-800/60" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold text-teal-300">{promo.code}</p>
                      {promo.label && <p className="text-xs text-slate-500">{promo.label}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{promo.grantsDays}d</td>
                    <td className="px-4 py-3">
                      <span className="text-slate-200">{promo._count.redemptions}</span>
                      {promo.maxRedemptions !== null && (
                        <span className="text-slate-500"> / {promo.maxRedemptions}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fmt(promo.expiresAt)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {promo.allowRepeatRedemption ? "Repeat OK" : "One-time"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${promo.active ? "text-teal-400" : "text-slate-500"}`}>
                        {promo.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fmt(promo.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => (editingId === promo.id ? cancelEdit() : startEdit(promo))}
                          className="rounded px-2.5 py-1 text-xs font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          {editingId === promo.id ? "Cancel" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleActive(promo)}
                          className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                            promo.active
                              ? "border border-slate-600 text-slate-400 hover:bg-slate-700"
                              : "bg-teal-700 text-white hover:bg-teal-600"
                          }`}
                        >
                          {promo.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deletePromo(promo)}
                          className="rounded px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-900/40 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingId === promo.id && (
                    <tr>
                      <td colSpan={8} className="bg-slate-800/80 px-4 py-4 border-t border-teal-700/30">
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">Grant days *</label>
                            <input
                              type="number"
                              value={editForm.grantsDays}
                              onChange={(e) => setEditForm((f) => ({ ...f, grantsDays: e.target.value }))}
                              min={1}
                              className="w-full rounded-lg border border-teal-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-400"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">Label</label>
                            <input
                              type="text"
                              value={editForm.label}
                              onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                              placeholder="Partner access"
                              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-teal-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">Max redemptions</label>
                            <input
                              type="number"
                              value={editForm.maxRedemptions}
                              onChange={(e) => setEditForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
                              placeholder="Unlimited"
                              min={1}
                              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-teal-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">Expires at</label>
                            <input
                              type="date"
                              value={editForm.expiresAt}
                              onChange={(e) => setEditForm((f) => ({ ...f, expiresAt: e.target.value }))}
                              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                            />
                          </div>
                          <div className="flex items-end pb-1">
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                              <input
                                type="checkbox"
                                checked={editForm.allowRepeatRedemption}
                                onChange={(e) => setEditForm((f) => ({ ...f, allowRepeatRedemption: e.target.checked }))}
                                className="h-4 w-4 rounded border-slate-500 accent-teal-500"
                              />
                              Allow repeat
                            </label>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void saveEdit(promo)}
                            disabled={editWorking || !editForm.grantsDays}
                            className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
                          >
                            {editWorking ? "Saving…" : "Save changes"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg border border-slate-600 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {promos.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">No promo codes yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

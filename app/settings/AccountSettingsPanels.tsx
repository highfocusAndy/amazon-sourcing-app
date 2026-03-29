"use client";

import { useState } from "react";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { PasskeysSection } from "./PasskeysSection";
import { ManagePasskeySection } from "./ManagePasskeySection";

export type AccountSection = "change-password" | "add-passkey" | "change-passkey";

const MENU_ITEMS: { id: AccountSection; label: string; icon: string }[] = [
  { id: "change-password", label: "Change password", icon: "🔑" },
  { id: "add-passkey", label: "Add passkey", icon: "🔐" },
  { id: "change-passkey", label: "Manage passkeys", icon: "🔄" },
];

export function AccountSettingsPanels() {
  const [section, setSection] = useState<AccountSection>("change-password");

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left panel: menu */}
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white/60 backdrop-blur">
        <nav className="p-3" aria-label="Account settings">
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Account
          </p>
          <ul className="space-y-0.5">
            {MENU_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    section === item.id
                      ? "bg-teal-500/15 text-teal-700 border border-teal-500/30"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="text-base" aria-hidden>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Right panel: selected action content - aligned to top */}
      <div className="flex min-w-0 flex-1 flex-col overflow-auto bg-slate-50/50 px-6 pb-6 pt-4">
        <div className="mx-auto w-full max-w-xl">
          {section === "change-password" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
              <p className="mt-1 text-sm text-slate-600">
                Update your password. You will stay signed in.
              </p>
              <ChangePasswordForm className="mt-4" />
            </div>
          )}

          {section === "add-passkey" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <h2 className="text-lg font-semibold text-slate-900">Add passkey</h2>
              <p className="mt-1 text-sm text-slate-600">
                Sign in with a passkey (fingerprint, face, or device PIN) instead of your password.
              </p>
              <PasskeysSection className="mt-4" />
            </div>
          )}

          {section === "change-passkey" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <h2 className="text-lg font-semibold text-slate-900">Manage passkeys</h2>
              <p className="mt-1 text-sm text-slate-600">
                Remove a passkey from this account (for example if you lost a device). Your password still works.
              </p>
              <ManagePasskeySection className="mt-4" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

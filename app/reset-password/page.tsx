import Link from "next/link";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50/30 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50">
        <h1 className="text-center text-xl font-bold tracking-tight text-slate-900">
          Reset password
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Set a new password for your account
        </p>
        <ResetPasswordForm />
      </div>
    </div>
  );
}

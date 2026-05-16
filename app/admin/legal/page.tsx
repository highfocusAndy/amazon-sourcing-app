"use client";

import { useEffect, useState, useCallback } from "react";

type LegalDoc = {
  slug: string;
  title: string;
  contentHtml: string;
  updatedAt: string;
} | null;

type DocState = {
  slug: string;
  label: string;
  previewPath: string;
  defaultTitle: string;
  placeholder: string;
};

const DOCS: DocState[] = [
  {
    slug: "tos",
    label: "Terms of Service",
    previewPath: "/terms",
    defaultTitle: "Terms of Service",
    placeholder: `<h2>1. Acceptance of Terms</h2>\n<p>By using this service, you agree to these terms...</p>\n\n<h2>2. Description of Service</h2>\n<p>...</p>`,
  },
  {
    slug: "privacy",
    label: "Privacy Policy",
    previewPath: "/privacy",
    defaultTitle: "Privacy Policy",
    placeholder: `<h2>1. Information We Collect</h2>\n<p>We collect information you provide...</p>\n\n<h2>2. How We Use Information</h2>\n<p>...</p>`,
  },
];

function StatusChip({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return null;
  const styles = {
    saving: "border-slate-600 bg-slate-700 text-slate-300",
    saved: "border-teal-500/40 bg-teal-500/10 text-teal-300",
    error: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  }[status];
  const label = { saving: "Saving…", saved: "Saved", error: "Error saving" }[status];
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${styles}`}>
      {label}
    </span>
  );
}

function DocEditor({ doc }: { doc: DocState }) {
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState(doc.defaultTitle);
  const [content, setContent] = useState("");
  const [hasSaved, setHasSaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/legal/${doc.slug}`)
      .then((r) => r.json() as Promise<{ content: LegalDoc }>)
      .then(({ content: c }) => {
        if (c) {
          setTitle(c.title);
          setContent(c.contentHtml);
          setLastSaved(c.updatedAt);
          setHasSaved(true);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [doc.slug]);

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/admin/legal/${doc.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, contentHtml: content }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = (await res.json()) as { content: { updatedAt: string } };
      setLastSaved(data.content.updatedAt);
      setHasSaved(true);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    }
  }, [doc.slug, title, content]);

  const handleReset = useCallback(async () => {
    if (!confirm(`Reset "${doc.label}" to the static default? The custom content will be deleted.`)) return;
    try {
      await fetch(`/api/admin/legal/${doc.slug}`, { method: "DELETE" });
      setTitle(doc.defaultTitle);
      setContent("");
      setHasSaved(false);
      setLastSaved(null);
    } catch {
      // ignore
    }
  }, [doc.slug, doc.label, doc.defaultTitle]);

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent shadow-[0_20px_50px_-32px_rgba(0,0,0,0.8)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {doc.label}
          </span>
          {hasSaved ? (
            <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-300">
              Custom content active
            </span>
          ) : (
            <span className="rounded-full border border-slate-600 bg-white/[0.02] px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              Showing static default
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={saveStatus} />
          {lastSaved && (
            <span className="text-[11px] text-slate-600">
              Saved {new Date(lastSaved).toLocaleDateString()} {new Date(lastSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <a
            href={doc.previewPath}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            Preview ↗
          </a>
          {hasSaved && (
            <button
              type="button"
              onClick={() => void handleReset()}
              className="rounded-lg border border-rose-500/25 bg-rose-500/5 px-3 py-1.5 text-[12px] font-medium text-rose-400 transition hover:bg-rose-500/10"
            >
              Reset to default
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saveStatus === "saving" || !content.trim()}
            className="rounded-lg bg-teal-500 px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save & publish
          </button>
        </div>
      </div>

      {/* Page title input */}
      <div className="border-b border-white/[0.05] px-5 py-3">
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
          Page title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30"
          placeholder="Document title"
        />
      </div>

      {/* Content textarea */}
      <div className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
            Content (HTML)
          </label>
          <span className="text-[10px] text-slate-600">
            Use standard HTML tags: &lt;h2&gt;, &lt;p&gt;, &lt;strong&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;a href&gt;
          </span>
        </div>
        {!loaded ? (
          <div className="h-[520px] animate-pulse rounded-xl bg-white/[0.03]" />
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={28}
            placeholder={doc.placeholder}
            className="w-full resize-y rounded-xl border border-white/[0.08] bg-[#07090d] px-4 py-3 font-mono text-[12.5px] leading-relaxed text-slate-300 placeholder-slate-700 outline-none focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20"
            spellCheck={false}
          />
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
          When saved, this HTML replaces the live {doc.label} page immediately. The static default is preserved as code fallback. Click{" "}
          <strong className="text-slate-500">Preview ↗</strong> to see the published page.
        </p>
      </div>
    </div>
  );
}

export default function LegalAdminPage() {
  const [activeTab, setActiveTab] = useState<"tos" | "privacy">("tos");
  const activeDoc = DOCS.find((d) => d.slug === activeTab)!;

  return (
    <div className="space-y-8">
      <header className="border-b border-white/[0.06] pb-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Admin
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-[11px] font-medium text-slate-500">Legal Content</span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-white sm:text-[1.75rem]">
          Legal Content Manager
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
          Edit the Terms of Service and Privacy Policy pages. Changes are published instantly to live users.
          Leave a document empty to show the static default.
        </p>
      </header>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 w-fit">
        {DOCS.map((d) => (
          <button
            key={d.slug}
            type="button"
            onClick={() => setActiveTab(d.slug as "tos" | "privacy")}
            className={`rounded-lg px-4 py-1.5 text-[13px] transition-all duration-150 ${
              activeTab === d.slug
                ? "bg-white/[0.1] font-semibold text-white ring-1 ring-teal-500/25 shadow-[0_12px_38px_-14px_rgb(45_212_191/0.22)]"
                : "font-medium text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <DocEditor key={activeDoc.slug} doc={activeDoc} />
    </div>
  );
}

"use client";
export function PageHead({ title, sub, art }: { title: string; sub?: string; art?: React.ReactNode }) {
  return (
    <div className="card mb-6 flex items-center justify-between gap-4 overflow-hidden p-6">
      <div>
        <h1 className="text-xl font-extrabold sm:text-2xl">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-slate-500">{sub}</p>}
      </div>
      {art && <div className="hidden w-44 shrink-0 sm:block">{art}</div>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="card grid place-items-center p-10 text-sm text-slate-500">{text}</div>;
}

export function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    open: "bg-brand-100 text-brand-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    completed: "bg-emerald-100 text-emerald-700",
  };
  return <span className={`badge ${map[s] || "bg-slate-100 text-slate-600"}`}>{s}</span>;
}

export function Spinner() {
  return <div className="grid place-items-center p-10"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" /></div>;
}

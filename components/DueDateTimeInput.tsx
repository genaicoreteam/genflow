"use client";
import { useEffect, useState } from "react";
import { Ampm, isoToLocalParts, localPartsToInputValue } from "@/lib/date";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/**
 * Due-date/time picker that always shows 12-hour AM/PM controls (native
 * datetime-local inputs otherwise follow the browser/OS locale, which is
 * often 24-hour). `value` is the stored due_at (UTC ISO string or null);
 * `onChange` receives the same "YYYY-MM-DDTHH:mm" local-time string a native
 * datetime-local input would produce, so existing callers that do
 * `new Date(v).toISOString()` keep working unchanged.
 */
export default function DueDateTimeInput({
  value, onChange, disabled, compact,
}: {
  value: string | null; onChange: (v: string) => void; disabled?: boolean; compact?: boolean;
}) {
  const [parts, setParts] = useState(() => isoToLocalParts(value));

  useEffect(() => { setParts(isoToLocalParts(value)); }, [value]);

  function update(next: Partial<{ date: string; hour: string; minute: string; ampm: Ampm }>) {
    const merged = { ...parts, ...next };
    setParts(merged);
    onChange(localPartsToInputValue(merged.date, merged.hour, merged.minute, merged.ampm));
  }

  const sizeCls = compact ? "!px-1.5 !py-1 text-xs" : "";

  return (
    <div className="flex flex-wrap items-center gap-1">
      <input type="date" className={`input !w-auto ${sizeCls}`} disabled={disabled}
        value={parts.date} onChange={(e) => update({ date: e.target.value })} />
      <select className={`input !w-auto ${sizeCls}`} disabled={disabled || !parts.date}
        value={parts.hour} onChange={(e) => update({ hour: e.target.value })}>
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <select className={`input !w-auto ${sizeCls}`} disabled={disabled || !parts.date}
        value={parts.minute} onChange={(e) => update({ minute: e.target.value })}>
        {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select className={`input !w-auto ${sizeCls}`} disabled={disabled || !parts.date}
        value={parts.ampm} onChange={(e) => update({ ampm: e.target.value as Ampm })}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
      {parts.date && !disabled && (
        <button type="button" title="Clear due date" className="text-slate-400 hover:text-slate-600"
          onClick={() => update({ date: "" })}>✕</button>
      )}
    </div>
  );
}

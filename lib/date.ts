const pad = (n: number) => String(n).padStart(2, "0");

export type Ampm = "AM" | "PM";

/** Break a stored due_at (UTC ISO string) into local date + 12-hour time parts. */
export function isoToLocalParts(iso: string | null | undefined) {
  if (!iso) return { date: "", hour: "12", minute: "00", ampm: "PM" as Ampm };
  const d = new Date(iso);
  const h24 = d.getHours();
  const ampm: Ampm = h24 >= 12 ? "PM" : "AM";
  const hour = pad(h24 % 12 === 0 ? 12 : h24 % 12);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour,
    minute: pad(d.getMinutes()),
    ampm,
  };
}

/**
 * Local date + 12-hour time parts -> the same "YYYY-MM-DDTHH:mm" local-time string a
 * native <input type="datetime-local"> produces, so existing `new Date(v).toISOString()`
 * call sites keep working unchanged.
 */
export function localPartsToInputValue(date: string, hour: string, minute: string, ampm: Ampm) {
  if (!date) return "";
  let h = parseInt(hour, 10) % 12;
  if (ampm === "PM") h += 12;
  return `${date}T${pad(h)}:${minute}`;
}

/** Format a stored due_at (UTC ISO string) for read-only display, always 12-hour AM/PM. */
export function formatDueAt(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

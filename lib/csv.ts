export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : filename + ".csv");
}

export function downloadDoc(filename: string, title: string, bodyHtml: string) {
  const html = `<html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:Calibri,Arial,sans-serif">${bodyHtml}</body></html>`;
  const blob = new Blob([html], { type: "application/msword" });
  triggerDownload(blob, filename.endsWith(".doc") ? filename : filename + ".doc");
}

export function downloadText(filename: string, text: string) {
  triggerDownload(new Blob([text], { type: "text/plain" }), filename);
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text || "");
    alert("Task ID copied to clipboard");
  } catch {
    alert("Copy failed — your browser blocked clipboard access.");
  }
}

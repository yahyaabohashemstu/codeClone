/**
 * Trigger a client-side download of in-memory text content as a file.
 * Used to save analysis exports (.txt/.json) without a server round-trip.
 */
export function downloadText(filename: string, content: string, mimeType = "text/plain"): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer revocation so the download has a chance to start in all browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

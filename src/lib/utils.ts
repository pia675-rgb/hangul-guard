import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(filename: string, text: string, mime: string) {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export async function fetchLocalZipBlob(): Promise<Blob> {
  const zipRes = await fetch("/EnglishGuard-Local.zip", { cache: "no-store" }).catch(() => null);
  if (zipRes?.ok) {
    const ctype = zipRes.headers.get("content-type") ?? "";
    if (!ctype.includes("text/html") && !ctype.includes("javascript")) {
      const blob = await zipRes.blob();
      if (blob.size > 1000) return blob;
    }
  }

  const b64Res = await fetch("/EnglishGuard-Local.b64.txt", { cache: "no-store" });
  if (!b64Res.ok) throw new Error("zip missing");
  const b64 = (await b64Res.text()).replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "application/zip" });
}

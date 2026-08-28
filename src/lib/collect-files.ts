import { isSupportedName } from "@/lib/scan";

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (file: File) => void, err?: (error: Error) => void) => void;
  createReader?: () => {
    readEntries: (ok: (entries: FsEntry[]) => void, err?: (error: Error) => void) => void;
  };
};

async function filesFromEntry(entry: FsEntry): Promise<File[]> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file!(resolve, reject);
    });
    return [file];
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const collected: FsEntry[] = [];
    for (;;) {
      const batch = await new Promise<FsEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (batch.length === 0) break;
      collected.push(...batch);
    }
    const nested = await Promise.all(collected.map(filesFromEntry));
    return nested.flat();
  }
  return [];
}

export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []);
  if (items.length && items.some((item) => typeof item.webkitGetAsEntry === "function")) {
    const entries = items
      .map((item) => item.webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => Boolean(entry));
    const nested = await Promise.all(entries.map((entry) => filesFromEntry(entry as unknown as FsEntry)));
    const files = nested.flat();
    if (files.length) return files;
  }
  return Array.from(dt.files ?? []);
}

export function partitionSupported(files: File[]): { supported: File[]; skipped: number } {
  const supported = files.filter((f) => isSupportedName(f.name));
  return { supported, skipped: files.length - supported.length };
}

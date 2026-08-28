import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Languages,
  LoaderCircle,
  Presentation,
  Shield,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { filesFromDataTransfer, partitionSupported } from "@/lib/collect-files";
import { highlightHangul } from "@/lib/hangul";
import { copy, type Lang } from "@/lib/i18n";
import { scanFile, type FileScanResult } from "@/lib/scan";
import { englishSummary, toCsv, toJson } from "@/lib/scan/report";
import { buildSampleFiles } from "@/lib/scan/samples";
import { cn, downloadText, formatBytes } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

type Filter = "all" | "flagged" | "clear" | "error";

function Home() {
  const [lang, setLang] = useState<Lang>("ko");
  const [results, setResults] = useState<FileScanResult[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [dragOver, setDragOver] = useState(false);
  const [scanning, setScanning] = useState<{ current: string; index: number; total: number } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [pickerReady, setPickerReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = copy[lang];

  useEffect(() => {
    const saved = window.localStorage.getItem("hangul-guard-lang");
    if (saved === "en" || saved === "ko") setLang(saved);
    setPickerReady(true);
  }, []);

  const switchLang = (next: Lang) => {
    setLang(next);
    window.localStorage.setItem("hangul-guard-lang", next);
  };

  const runScan = useCallback(
    async (files: File[]) => {
      const { supported, skipped } = partitionSupported(files);
      if (skipped > 0) toast(t.unsupported);
      if (!supported.length) return;
      for (let i = 0; i < supported.length; i += 1) {
        const file = supported[i];
        setScanning({ current: file.name, index: i + 1, total: supported.length });
        const result = await scanFile(file);
        setResults((prev) => {
          const without = prev.filter((r) => r.fileName !== result.fileName || r.fileSize !== result.fileSize);
          return [result, ...without];
        });
      }
      setScanning(null);
    },
    [t.unsupported],
  );

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const files = await filesFromDataTransfer(event.dataTransfer);
    await runScan(files);
  };

  const stats = useMemo(() => {
    const flagged = results.filter((r) => r.status === "flagged").length;
    const clear = results.filter((r) => r.status === "clear").length;
    const errors = results.filter((r) => r.status === "error").length;
    const chars = results.reduce((n, r) => n + r.hangulCount, 0);
    return { flagged, clear, errors, chars };
  }, [results]);

  const visible = results.filter((r) => (filter === "all" ? true : r.status === filter));

  const exportCsv = () => {
    if (!results.length) return;
    downloadText("hangul-guard-report.csv", toCsv(results), "text/csv;charset=utf-8");
  };
  const exportJson = () => {
    if (!results.length) return;
    downloadText("hangul-guard-report.json", toJson(results), "application/json");
  };
  const copySum = async () => {
    if (!results.length) return;
    const text = englishSummary(results);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      downloadText("hangul-guard-summary.txt", text, "text/plain;charset=utf-8");
    }
    setCopied(true);
    toast(t.copied);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="relative min-h-dvh overflow-x-hidden">
      <div className="paper-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="rise-in max-w-xl">
            <div className="mb-3 flex items-center gap-2 text-primary">
              <Shield className="size-5" strokeWidth={1.75} />
              <span className="text-xs font-medium tracking-[0.16em] uppercase">{t.appName}</span>
            </div>
            <h1 className="font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
              {t.tagline}
            </h1>
            <p className="mt-3 max-w-prose text-sm text-muted-foreground">{t.privacy}</p>
          </div>
          <div className="rise-in rise-in-1 flex items-center gap-1 self-start rounded-full bg-card p-1 shadow-border">
            <Languages className="ml-2 size-3.5 text-muted-foreground" />
            <button
              type="button"
              className={cn(
                "h-9 rounded-full px-3 text-xs font-medium transition-colors duration-[var(--motion-quick)]",
                lang === "ko" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => switchLang("ko")}
            >
              {t.langKo}
            </button>
            <button
              type="button"
              className={cn(
                "h-9 rounded-full px-3 text-xs font-medium transition-colors duration-[var(--motion-quick)]",
                lang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => switchLang("en")}
            >
              {t.langEn}
            </button>
          </div>
        </header>

        <section
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "rise-in rise-in-2 rounded-xl bg-card p-2 shadow-border transition-[box-shadow] duration-[var(--motion-fast)]",
            dragOver && "shadow-border-hover",
          )}
        >
          <div
            className={cn(
              "flex flex-col items-center gap-5 rounded-lg border border-dashed border-border px-4 py-10 text-center sm:py-14",
              dragOver && "border-primary bg-muted/60",
            )}
          >
            <div className="flex size-14 items-center justify-center rounded-md bg-secondary text-primary">
              {scanning ? (
                <LoaderCircle className="size-6 animate-spin" />
              ) : (
                <Upload className="size-6" strokeWidth={1.75} />
              )}
            </div>
            <div>
              <p className="font-display text-xl font-medium tracking-tight">
                {scanning ? `${t.scanning} ${scanning.index} ${t.of} ${scanning.total}` : dragOver ? t.dropActive : t.dropTitle}
              </p>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {scanning ? scanning.current : t.dropHint}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button type="button" onClick={() => inputRef.current?.click()} disabled={Boolean(scanning)}>
                <FolderOpen />
                {t.browse}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(scanning)}
                onClick={async () => {
                  const samples = await buildSampleFiles();
                  toast(t.sampleNote);
                  await runScan(samples);
                }}
              >
                {t.trySamples}
              </Button>
            </div>
            <ul className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              <FormatChip icon={FileText} label="PDF" />
              <FormatChip icon={FileText} label="Word" />
              <FormatChip icon={FileSpreadsheet} label="Excel" />
              <FormatChip icon={Presentation} label="PowerPoint" />
            </ul>
            {pickerReady ? (
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.docx,.docm,.dotx,.dotm,.xlsx,.xlsm,.xltx,.xltm,.pptx,.pptm,.potx,.potm,.doc,.xls,.ppt"
                onChange={(e) => {
                  const list = e.target.files;
                  if (list?.length) void runScan(Array.from(list));
                  e.target.value = "";
                }}
              />
            ) : null}
          </div>
        </section>

        {results.length > 0 && (
          <section className="rise-in flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t.flagged} value={stats.flagged} tone={stats.flagged ? "flag" : "default"} />
              <Stat label={t.clear} value={stats.clear} tone="ok" />
              <Stat label={t.errors} value={stats.errors} tone={stats.errors ? "flag" : "default"} />
              <Stat label={t.chars} value={stats.chars} />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1 rounded-full bg-card p-1 shadow-border">
                {(["all", "flagged", "clear", "error"] as Filter[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={cn(
                      "h-9 rounded-full px-3 text-xs font-medium transition-colors duration-[var(--motion-quick)]",
                      filter === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {key === "all" ? t.filterAll : key === "flagged" ? t.filterFlagged : key === "clear" ? t.filterClear : t.filterError}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download />
                  {t.exportCsv}
                </Button>
                <Button variant="outline" size="sm" onClick={exportJson}>
                  <Download />
                  {t.exportJson}
                </Button>
                <Button variant="outline" size="sm" onClick={copySum}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? t.copied : t.copySummary}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setResults([])}>
                  <Trash2 />
                  {t.reset}
                </Button>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {visible.length === 0 && (
                <li className="rounded-lg bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-border">
                  {t.noMatch}
                </li>
              )}
              {visible.map((file) => (
                <FileCard key={file.id} file={file} t={t} onRemove={() => setResults((prev) => prev.filter((r) => r.id !== file.id))} />
              ))}
            </ul>
          </section>
        )}

        {results.length === 0 && !scanning && (
          <section className="rise-in rise-in-3 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-card p-5 shadow-border">
              <h2 className="font-display text-lg font-medium">{t.emptyTitle}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t.emptyBody}</p>
            </div>
            <div className="rounded-lg bg-card p-5 shadow-border">
              <h2 className="font-display text-lg font-medium">{t.whatTitle}</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {t.whatItems.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <p className="rise-in rise-in-4 text-xs leading-relaxed text-muted-foreground">{t.limitation} {t.footer}</p>
      </div>
      <Toaster position="bottom-center" richColors={false} />
    </main>
  );
}

function FormatChip({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
      <Icon className="size-3.5" strokeWidth={1.75} />
      {label}
    </li>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "flag" | "ok";
}) {
  return (
    <div className="rounded-lg bg-card px-4 py-3 shadow-border">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-3xl font-medium tabular-nums tracking-tight",
          tone === "flag" && "text-destructive",
          tone === "ok" && "text-ok",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FileCard({
  file,
  t,
  onRemove,
}: {
  file: FileScanResult;
  t: (typeof copy)[Lang];
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? file.findings : file.findings.slice(0, 3);
  const extra = file.findings.length - shown.length;

  return (
    <li className="rounded-lg bg-card p-4 shadow-border sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{file.fileName}</p>
            <span
              className={cn(
                "stamp",
                file.status === "flagged" && "text-destructive",
                file.status === "clear" && "text-ok",
                file.status === "error" && "text-muted-foreground",
              )}
            >
              {file.status === "flagged" ? t.stampHangul : file.status === "clear" ? t.stampClear : t.stampError}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {file.ext.toUpperCase()} · {formatBytes(file.fileSize)}
            {file.status === "flagged" ? ` · ${file.findings.length} ${t.findings} · ${file.hangulCount} ${t.chars}` : null}
            {file.status === "error" ? ` · ${file.error ?? t.scanFail}` : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="relative size-11 shrink-0 text-muted-foreground transition-colors hover:text-foreground after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2"
          aria-label={t.remove}
        >
          <X className="mx-auto size-4" />
        </button>
      </div>
      {file.findings.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {shown.map((finding) => (
            <li key={finding.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={finding.severity === "high" ? "flag" : finding.severity === "medium" ? "outline" : "default"}>
                  {t.kind[finding.kind] ?? finding.kind}
                </Badge>
                <span className="text-xs text-muted-foreground">{finding.location}</span>
              </div>
              <p className="mt-1.5 font-mono text-sm leading-relaxed">
                {highlightHangul(finding.snippet).map((part, i) =>
                  part.hangul ? (
                    <mark key={i} className="rounded-sm bg-mark px-0.5 text-mark-foreground">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      {file.findings.length > 3 && (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-primary"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t.less : `+${extra} ${t.more}`}
        </button>
      )}
      {file.truncated && <p className="mt-2 text-xs text-muted-foreground">{t.truncated}</p>}
    </li>
  );
}

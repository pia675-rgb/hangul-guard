import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const dist = join(root, "local-dist");
mkdirSync(dist, { recursive: true });

const js = readFileSync(join(dist, "app.js"), "utf8");
const cssPath = join(dist, "app.css");
let css = "";
try {
  css = readFileSync(cssPath, "utf8");
} catch {
  css = "";
}

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>English Guard</title>
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${js}</script>
  </body>
</html>
`;

writeFileSync(join(dist, "EnglishGuard.html"), html);
copyFileSync(join(import.meta.dirname, "사용설명.txt"), join(dist, "사용설명.txt"));

const zipPath = join(root, "EnglishGuard-Local.zip");
const py = `
import os, zipfile
out = ${JSON.stringify(zipPath)}
files = [
  (${JSON.stringify(join(dist, "EnglishGuard.html"))}, "EnglishGuard.html"),
  (${JSON.stringify(join(dist, "사용설명.txt"))}, "사용설명.txt"),
]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for full, name in files:
        z.write(full, name)
print("Wrote", out, "bytes", os.path.getsize(out))
`;
const packed = spawnSync("python3", ["-c", py], { stdio: "inherit" });
if (packed.status !== 0) process.exit(packed.status ?? 1);

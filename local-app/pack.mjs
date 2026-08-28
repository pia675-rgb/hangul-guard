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

function escapeInline(code, tag) {
  return code.replace(new RegExp(`<\\/${tag}`, "gi"), `<\\/${tag}`);
}

const shim = `
window.process = window.process || { env: { NODE_ENV: "production" } };
if (!window.process.env) window.process.env = { NODE_ENV: "production" };
if (!window.process.env.NODE_ENV) window.process.env.NODE_ENV = "production";
window.onerror = function (msg) {
  var root = document.getElementById("root");
  if (!root || root.getAttribute("data-ready") === "1") return;
  root.innerHTML = '<div style="max-width:40rem;margin:12vh auto;padding:0 1.5rem;font-family:Malgun Gothic,Apple SD Gothic Neo,Segoe UI,sans-serif;color:#1c1b16">'
    + '<p style="letter-spacing:.16em;text-transform:uppercase;font-size:12px;color:#1c3d5a">English Guard</p>'
    + '<h1 style="font-size:1.6rem;font-weight:600">화면을 열지 못했습니다</h1>'
    + '<p style="color:#6b675c;line-height:1.55">Chrome 또는 Edge로 EnglishGuard.html을 다시 열어 주세요. Internet Explorer는 지원하지 않습니다.</p>'
    + '<pre style="white-space:pre-wrap;background:#ece8dd;padding:12px 14px;border-radius:12px;font-size:12px">' + String(msg) + "</pre></div>";
};
`;

const wrappedJs = `${shim}
try {
${js}
  var readyRoot = document.getElementById("root");
  if (readyRoot) readyRoot.setAttribute("data-ready", "1");
} catch (err) {
  window.onerror(err && err.message ? err.message : err);
  throw err;
}
`;

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>English Guard</title>
    <style>${escapeInline(css, "style")}</style>
  </head>
  <body>
    <div id="root">
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Malgun Gothic,Apple SD Gothic Neo,Segoe UI,sans-serif;color:#6b675c;background:#f3f1ea">
        English Guard 불러오는 중…
      </div>
    </div>
    <script>${escapeInline(wrappedJs, "script")}</script>
  </body>
</html>
`;

writeFileSync(join(dist, "EnglishGuard.html"), html);
copyFileSync(join(import.meta.dirname, "사용설명.txt"), join(dist, "사용설명.txt"));
copyFileSync(join(import.meta.dirname, "EnglishGuard-open.bat"), join(dist, "EnglishGuard-open.bat"));

const zipPath = join(root, "EnglishGuard-Local.zip");
const py = `
import os, zipfile, shutil, base64
out = ${JSON.stringify(zipPath)}
files = [
  (${JSON.stringify(join(dist, "EnglishGuard.html"))}, "EnglishGuard.html"),
  (${JSON.stringify(join(dist, "사용설명.txt"))}, "사용설명.txt"),
  (${JSON.stringify(join(dist, "EnglishGuard-open.bat"))}, "EnglishGuard-open.bat"),
]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for full, name in files:
        z.write(full, name)
public_dir = ${JSON.stringify(join(root, "public"))}
os.makedirs(public_dir, exist_ok=True)
public_zip = os.path.join(public_dir, "EnglishGuard-Local.zip")
shutil.copyfile(out, public_zip)
b64_path = os.path.join(public_dir, "EnglishGuard-Local.b64.txt")
with open(out, "rb") as f:
    open(b64_path, "w", encoding="ascii").write(base64.b64encode(f.read()).decode("ascii"))
artifacts = ${JSON.stringify(join(root, "artifacts"))}
os.makedirs(artifacts, exist_ok=True)
shutil.copyfile(out, os.path.join(artifacts, "EnglishGuard-Local.zip"))
print("Wrote", out, "bytes", os.path.getsize(out))
print("Copied", public_zip)
`;
const packed = spawnSync("python3", ["-c", py], { stdio: "inherit" });
if (packed.status !== 0) process.exit(packed.status ?? 1);

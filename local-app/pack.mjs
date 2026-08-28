import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const dist = join(root, "local-dist");
mkdirSync(dist, { recursive: true });

for (const name of ["EnglishGuard.bat", "start.ps1", "start.sh", "사용설명.txt"]) {
  copyFileSync(join(import.meta.dirname, name), join(dist, name));
}
chmodSync(join(dist, "start.sh"), 0o755);

const zipPath = join(root, "EnglishGuard-Local.zip");
const py = `
import os, zipfile
root = ${JSON.stringify(dist)}
out = ${JSON.stringify(zipPath)}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirnames, filenames in os.walk(root):
        for name in filenames:
            full = os.path.join(dirpath, name)
            z.write(full, os.path.relpath(full, root))
print("Wrote", out)
`;
const packed = spawnSync("python3", ["-c", py], { stdio: "inherit" });
if (packed.status !== 0) process.exit(packed.status ?? 1);

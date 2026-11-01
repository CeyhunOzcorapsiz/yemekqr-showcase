import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm run setup ile çalıştırın.");
function npm(dir, args) {
  const r = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: path.join(root, dir),
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
if (!existsSync(path.join(root, "backend/.env")))
  writeFileSync(
    path.join(root, "backend/.env"),
    'DATABASE_URL="file:./dev.db"\nJWT_SECRET="' +
      randomBytes(48).toString("hex") +
      '"\n',
  );
for (const dir of ["backend", "frontend"])
  npm(dir, ["ci", "--no-audit", "--no-fund"]);
const envText = readFileSync(path.join(root, "backend/.env"), "utf8");
const db = envText.match(/^DATABASE_URL=["\']?file:([^"\'\r\n]+)/m);
if (db) {
  const target = path.resolve(root, "backend/prisma", db[1]);
  if (!existsSync(target)) writeFileSync(target, "");
}
npm("backend", ["run", "prisma:generate"]);
npm("backend", ["exec", "prisma", "migrate", "deploy"]);
console.log(
  "Kurulum hazır. npm run dev ile açın. Demo verisi için npm run seed --prefix backend.",
);

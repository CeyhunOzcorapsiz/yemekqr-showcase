import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] || "dev";
const children = [];
function start(cwd, args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: path.join(root, cwd),
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on("error", (e) => {
    console.error(e.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (code) stop(code);
  });
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
if (mode === "start")
  start("backend", ["dist/index.js"], { NODE_ENV: "production" });
else {
  start("backend", ["--watch", "-r", "ts-node/register", "src/index.ts"], {
    NODE_ENV: "development",
  });
  start("frontend", ["node_modules/vite/bin/vite.js"]);
}

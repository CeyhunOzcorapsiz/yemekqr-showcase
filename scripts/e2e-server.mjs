import { spawnSync, spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
const cwd = new URL("../backend/", import.meta.url);
for (const suffix of ["", "-journal", "-wal", "-shm"])
  rmSync(new URL("prisma/e2e.db" + suffix, cwd), { force: true });
writeFileSync(new URL("prisma/e2e.db", cwd), "");
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: "file:./e2e.db",
  JWT_SECRET: "e2e-only-random-secret-not-for-production",
  PORT: "4100",
  HOST: "127.0.0.1",
  FRONTEND_URL: "http://127.0.0.1:4100",
  ML_SERVICE_URL: "http://127.0.0.1:8100",
  ML_SERVICE_TOKEN: "e2e-only-internal-service-token",
  ML_MODE: "mock",
  GEMINI_API_KEY: "",
};
const migrate = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { cwd, env, stdio: "inherit" },
);
if (migrate.status !== 0) process.exit(migrate.status || 1);
const server = spawn(
  process.execPath,
  ["-r", "ts-node/register", "src/index.ts"],
  { cwd, env, stdio: "inherit" },
);
const ml = spawn(
  process.env.PYTHON || "python",
  [
    "-m",
    "uvicorn",
    "main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8100",
    "--app-dir",
    "ml-service",
  ],
  { cwd: new URL("../", import.meta.url), env, stdio: "inherit" },
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.kill();
  ml.kill();
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, stop);
for (const child of [server, ml]) {
  child.on("error", (error) => {
    console.error(error.message);
    stop();
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    stop();
    process.exitCode = code || 0;
  });
}

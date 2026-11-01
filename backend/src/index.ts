import "dotenv/config";
import { createApp } from "./app";
import { prisma } from "./db";
import { config } from "./config";
import { assertProductionDatabaseSafe } from "./production";
async function main() {
  await prisma.$queryRaw`SELECT 1`;
  if (config.production) await assertProductionDatabaseSafe();
  const port = Number(process.env.PORT || 4000);
  const server = createApp().listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log("YemekQR hazır: http://localhost:" + port),
  );
  server.requestTimeout = 45_000;
  let closing = false;
  function close() {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => process.exit(1), 10_000);
    timer.unref();
    server.close(async () => {
      await prisma.$disconnect();
      clearTimeout(timer);
      process.exit(0);
    });
  }
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}
main().catch(async (error) => {
  console.error(
    error instanceof Error ? error.message : "Başlangıç başarısız.",
  );
  await prisma.$disconnect();
  process.exitCode = 1;
});

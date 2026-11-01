import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 15000,
    // Testler gerçek dev veritabanına değil, her koşuda sıfırdan kurulan
    // ayrı bir SQLite dosyasına (prisma/test.db) çalışır. globalSetup
    // migration'ları uygular; env burada set edilir ki db.ts import
    // edilmeden önce geçerli olsun.
    env: {
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret",
    },
    globalSetup: "./test/globalSetup.ts",
    // Testler aynı SQLite dosyasını paylaştığı için tek süreçte koşmalı.
    fileParallelism: false,
  },
});

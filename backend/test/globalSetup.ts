import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Her test koşusunda temiz bir test veritabanı: eski dosyayı sil,
// migration'ları uygula.
export default function setup() {
  const dbPath = path.join(__dirname, "../prisma/test.db");
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  fs.writeFileSync(dbPath, "");
  execSync("npx prisma migrate deploy", {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}

from contextlib import closing
"""Consistent SQLite backup and restore; never overwrite an existing target."""
import argparse
import pathlib
import sqlite3
from datetime import datetime, timezone
root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("action", choices=["backup", "restore", "check"])
parser.add_argument("--source", type=pathlib.Path)
parser.add_argument("--target", type=pathlib.Path)
args = parser.parse_args()
source = (args.source or root / "backend/prisma/dev.db").resolve()
if not source.is_file():
    parser.error("Kaynak veritabanı bulunamadı.")
with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as db:
    if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or db.execute("PRAGMA foreign_key_check").fetchall():
        parser.error("Kaynak bütünlük kontrolünden geçemedi.")
    if args.action == "check":
        print("Bütünlük ve ilişkiler sağlam.")
    else:
        target = args.target or (root / ".backups" / ("yemekqr-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".db") if args.action == "backup" else None)
        if target is None:
            parser.error("Geri yükleme için --target ile yeni dosya belirtin.")
        target = target.resolve()
        if target.exists():
            parser.error("Hedef mevcut; üzerine yazılmadı. Yeni bir hedef seçin.")
        target.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(target)) as output:
            db.backup(output)
            if output.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                parser.error("Kopya bütünlük kontrolünü geçemedi.")
        print(str(target))

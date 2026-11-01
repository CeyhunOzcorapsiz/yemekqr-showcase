from contextlib import closing
import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "backend/prisma/migrations").glob("*/migration.sql"))

class DatabaseTests(unittest.TestCase):
    def test_existing_records_migrate_and_backup_roundtrip(self):
        cache = ROOT / ".cache"
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as folder:
            source = pathlib.Path(folder) / "source.db"
            with closing(sqlite3.connect(source)) as db:
                db.executescript(MIGRATIONS[0].read_text(encoding="utf-8"))
                db.execute("INSERT INTO Restaurant(id,name) VALUES('r','Lokanta')")
                db.execute("INSERT INTO Product(id,restaurantId,name,category,price) VALUES('p','r','Mercimek','Çorba',60.05)")
                db.execute("INSERT INTO 'Order'(id,restaurantId,totalAmount,qrCodeValue) VALUES('o','r',120.10,'test')")
                db.execute("INSERT INTO OrderItem(id,orderId,productId,quantity,unitPrice) VALUES('i','o','p',2,60.05)")
                db.commit()
                for migration in MIGRATIONS[1:]:
                    db.executescript(migration.read_text(encoding="utf-8"))
                self.assertEqual(db.execute("SELECT price FROM Product").fetchone()[0],6005)
                self.assertEqual(db.execute("SELECT productName,unitPrice FROM OrderItem").fetchone(),("Mercimek",6005))
                self.assertEqual(db.execute("SELECT totalAmount,paymentStatus FROM 'Order'").fetchone(),(12010,"unpaid"))
                self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(),[])
                plan=db.execute("EXPLAIN QUERY PLAN SELECT * FROM 'Order' WHERE restaurantId='r' AND createdAt >= '2026-01-01' AND createdAt < '2027-01-01'").fetchall()
                self.assertTrue(any("Order_restaurantId_createdAt_idx" in row[-1] for row in plan))
            backup=pathlib.Path(folder)/"backup.db"
            restored=pathlib.Path(folder)/"restored.db"
            for action,src,target in [("backup",source,backup),("restore",backup,restored)]:
                result=subprocess.run([sys.executable,str(ROOT/"scripts/database.py"),action,"--source",str(src),"--target",str(target)],capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)
            with closing(sqlite3.connect(restored)) as db:
                self.assertEqual(db.execute("SELECT totalAmount FROM 'Order'").fetchone()[0],12010)
            again=subprocess.run([sys.executable,str(ROOT/"scripts/database.py"),"restore","--source",str(backup),"--target",str(restored)],capture_output=True)
            self.assertNotEqual(again.returncode,0)

    def test_email_collision_rolls_back_new_migration(self):
        with closing(sqlite3.connect(":memory:")) as db:
            for migration in MIGRATIONS[:2]:
                db.executescript(migration.read_text(encoding="utf-8"))
            db.execute("INSERT INTO Restaurant(id,name) VALUES('r','Lokanta')")
            for key,email in [("a","Case@test.com"),("b","case@test.com")]:
                db.execute("INSERT INTO User(id,restaurantId,name,email,passwordHash) VALUES(?, 'r', 'User', ?, 'hash')",(key,email))
            db.commit()
            with self.assertRaises(sqlite3.IntegrityError):
                db.executescript(MIGRATIONS[2].read_text(encoding="utf-8"))
            db.rollback()
            columns=[row[1] for row in db.execute("PRAGMA table_info(User)")]
            self.assertNotIn("active",columns)
            self.assertEqual(db.execute("SELECT count(*) FROM User").fetchone()[0],2)

if __name__ == "__main__":
    unittest.main()

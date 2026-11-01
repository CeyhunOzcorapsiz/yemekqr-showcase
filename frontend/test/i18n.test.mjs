import {test,afterEach} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";
import {english} from "../src/i18n/catalog.ts";
import {setLanguage,t} from "../src/i18n/core.ts";
import {productName,receiptName,categoryName} from "../src/i18n/content.ts";
import {formatTL,formatDate} from "../src/utils/money.ts";
afterEach(()=>setLanguage("tr"));
test("catalog, interpolation, existing notifications and locale formatting",()=>{
 for(const [key,value] of Object.entries(english))assert.ok(key.trim()&&value.trim());
 setLanguage("en");assert.equal(t("Giriş yap"),"Sign in");assert.equal(t("En az {count} karakter girin.",{count:8}),"Enter at least 8 characters.");assert.match(formatTL(6050),/60\.50/);assert.match(formatDate("2026-11-01T10:00:00Z"),/01\/11\/2026/);
 setLanguage("tr");assert.equal(t("Menu saved."),"Menü kaydedildi.");assert.match(formatTL(6050),/60,50/);
});
test("translated content and historical names are separate from proper names",()=>{
 setLanguage("en");assert.equal(productName({name:"Mercimek Çorbası",nameEn:"Lentil soup"}),"Lentil soup");assert.equal(categoryName("Çorba"),"Soup");assert.equal(receiptName({productName:"Eski ad",productNameEn:"Historical name"}),"Historical name");assert.equal(productName({name:"House special"}),"House special");
});
test("all static UI text and accessible attributes use translation functions",()=>{
 const allowed=new Set(["YemekQR","Türkçe","English","58 mm","80 mm"]);const misses=[];
 function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const filename=path.join(folder,entry.name);if(entry.isDirectory())walk(filename);else if(filename.endsWith(".tsx")){const ast=ts.createSourceFile(filename,fs.readFileSync(filename,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(n){if(ts.isJsxText(n)){const value=n.text.replace(/\s+/g," ").trim();if(/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(value)&&!allowed.has(value))misses.push(filename+": "+value);}if(ts.isJsxAttribute(n)&&["aria-label","placeholder","alt","title"].includes(n.name.text)&&n.initializer&&ts.isStringLiteral(n.initializer))misses.push(filename+": "+n.initializer.text);ts.forEachChild(n,visit);}visit(ast);}}}
 walk(fileURLToPath(new URL("../src/",import.meta.url)));assert.deepEqual(misses,[]);
});


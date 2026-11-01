import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTLToKurus } from "../src/utils/money.ts";
test("Para metni tamamen doğrulanır ve kuruş kaybı oluşmaz",()=>{
  assert.equal(parseTLToKurus("12,50"),1250);
  assert.equal(parseTLToKurus("12.50"),1250);
  assert.equal(parseTLToKurus("0.01"),1);
  assert.equal(parseTLToKurus("1000000"),100000000);
  for(const value of ["12abc","1.234,50","Infinity","0.005","-1","1e3","1000001",""])assert.ok(Number.isNaN(parseTLToKurus(value)),value);
});

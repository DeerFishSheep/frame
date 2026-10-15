import assert from "node:assert/strict";
import test from "node:test";
import { resourceCopyText } from "../lib/resource-copy";

test("copying a resource returns only its original URL even when an extraction code is available", () => {
  for (const url of [
    "https://public.example.test/s/sample?pwd=original#section",
    "http://public.example.test/s/sample",
    `magnet:?xt=urn:btih:${"a".repeat(40)}&dn=Public%20sample`,
    `ed2k://|file|Public-sample.txt|123|${"b".repeat(32)}|/`,
  ]) {
    const item = { url, title: "公开测试资料", source: "fixture", extractionCode: "not-in-the-url" };
    const copied = resourceCopyText(item);
    assert.equal(copied, url);
    assert.equal(copied.includes("not-in-the-url"), false);
    assert.equal(copied.includes("提取码"), false);
    assert.equal(copied.includes("\n"), false);
  }
});

test("copying preserves URL encoding, query order, casing and embedded codes without rewriting", () => {
  const url = "https://public.example.test/s/AbC%2fDeF?second=2&first=%E8%B5%84%E6%96%99&pwd=A%2Bb#Original";
  assert.equal(resourceCopyText({ url }), url);
});

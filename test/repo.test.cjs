const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRepo } = require("../scripts/create-repo.cjs");

test("Homebrew manifest describes the released IPK bytes", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "journaal-repo-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const ipk = path.join(directory, "nl.kapoko.latestnews_1.4.16_all.ipk");
  fs.writeFileSync(ipk, "test package");
  const app = {
    id: "nl.kapoko.latestnews", version: "1.4.16", title: "Laatste Journaal",
    type: "web", largeIcon: "largeIcon.png",
  };
  const { manifest } = createRepo(app, ipk, "kapoko/webos-latest-news", "v1.4.16", "main").packages[0];
  assert.equal(manifest.ipkSize, 12);
  assert.equal(manifest.ipkHash.sha256, crypto.createHash("sha256").update("test package").digest("hex"));
  assert.equal(manifest.ipkUrl, "https://github.com/kapoko/webos-latest-news/releases/download/v1.4.16/nl.kapoko.latestnews_1.4.16_all.ipk");
  assert.equal(manifest.rootRequired, false);
  assert.equal(manifest.type, "web");
  assert.throws(() => createRepo(app, ipk, "kapoko/webos-latest-news", "v1.0.0", "main"), /Release tag/);
  assert.throws(() => createRepo(app, "wrong.ipk", "kapoko/webos-latest-news", "v1.4.16", "main"), /Expected package/);
});

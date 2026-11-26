const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const serverPath = path.resolve(__dirname, "../downloads/revisian-mcp.cjs");

function callMcp(requests) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "revisian-mcp-test-"));
  const source = path.join(dir, "source.json");
  writeFileSync(source, JSON.stringify({
    version: 1,
    kind: "revisian-mcp-source",
    entry: "photosynthesis",
    notes: [
      {
        id: "photosynthesis",
        title: "Photosynthesis",
        subject: "Biology",
        kind: "note",
        shortened: false,
        text: "## Chlorophyll\nPlants use chlorophyll for photosynthesis. Read [the study guide](https://example.org/guide). Also see https://example.net/facts."
      },
      {
        id: "respiration",
        title: "Cell respiration",
        subject: "Biology",
        kind: "note",
        shortened: false,
        text: "Mitochondria release energy through respiration."
      }
    ]
  }));

  const input = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    ...requests.map((params, index) => ({ jsonrpc: "2.0", id: index + 2, method: params.method, params: params.params }))
  ].map(JSON.stringify).join("\n") + "\n";

  try {
    const run = spawnSync(process.execPath, [serverPath, source], { input, encoding: "utf8", timeout: 15000 });
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr);
    return run.stdout.trim().split("\n").map((line) => JSON.parse(line));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("MCP offers typo-tolerant ranked search and link listing within the selected export", () => {
  const responses = callMcp([
    { method: "tools/list", params: {} },
    { method: "tools/call", params: { name: "search_notes", arguments: { query: "photosynthsis", limit: 5 } } },
    { method: "tools/call", params: { name: "list_links", arguments: { id: "photosynthesis", limit: 10 } } }
  ]);

  const listedTools = responses.find((response) => response.id === 2).result.tools.map((tool) => tool.name);
  assert.ok(listedTools.includes("list_links"));

  const searchPayload = JSON.parse(responses.find((response) => response.id === 3).result.content[0].text);
  assert.equal(searchPayload.items[0].id, "photosynthesis");
  assert.match(searchPayload.items[0].preview, /chlorophyll|photosynthesis/i);
  assert.ok(searchPayload.items[0].score > 0);

  const linksPayload = JSON.parse(responses.find((response) => response.id === 4).result.content[0].text);
  assert.deepEqual(linksPayload.items.map((item) => item.url), [
    "https://example.org/guide",
    "https://example.net/facts"
  ]);
});

test("MCP search ranks an exact title above a content-only match", () => {
  const responses = callMcp([
    { method: "tools/call", params: { name: "search_notes", arguments: { query: "respiration", limit: 5 } } }
  ]);
  const payload = JSON.parse(responses.find((response) => response.id === 2).result.content[0].text);
  assert.equal(payload.items[0].id, "respiration");
});

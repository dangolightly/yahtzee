const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
let child;
let baseUrl;

before(async () => {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "ignore"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server startup timed out")), 5000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("Server exited before startup")); });
    child.stdout.on("data", () => { clearTimeout(timer); resolve(); });
  });
});

after(async () => {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
});

async function post(route, body, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, expectedStatus);
  return response.json();
}

test("health, browser assets, and installed app launch are reachable", async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  for (const asset of ["/", "/index.html", "/styles.css?v=63", "/app.js?v=68", "/sw.js?v=68", "/icon.svg"]) {
    assert.equal((await fetch(`${baseUrl}${asset}`)).status, 200, asset);
  }
  const manifestUrl = `${baseUrl}/manifest.webmanifest`;
  const manifest = await (await fetch(manifestUrl)).json();
  const launch = new URL(manifest.start_url, manifestUrl);
  assert.equal(launch.pathname, "/");
  assert.equal((await fetch(launch)).status, 200);
  assert.equal(new URL(manifest.scope, manifestUrl).pathname, "/");
  const worker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const assets = JSON.parse(worker.match(/const APP_ASSETS = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  for (const asset of assets) {
    assert.equal((await fetch(new URL(asset, baseUrl))).status, 200, asset);
  }
});

test("project files, env files, and traversal requests are never public", async () => {
  for (const route of ["/server.js", "/package.json", "/README.md", "/railway.json", "/ai-runtime.env", "/ai-runtime.local.env", "/ai-runtime.defaults.env", "/.git/config", "/%2e%2e/server.js", "/..%5cai-runtime.env", "/%61i-runtime.env"]) {
    // Do not read or print any private response body.
    assert.equal((await fetch(`${baseUrl}${route}`)).status, 404, route);
  }
});

test("two players can join, complete a game, and receive the same scorecard", async () => {
  const host = "deployment-test-host";
  const guest = "deployment-test-guest";
  const waiting = await post("/api/profile", { clientId: host, name: "Test Host" });
  await post("/api/profile", { clientId: guest, name: "Test Guest" });
  const joined = await post("/api/lobby/join", { clientId: guest, gameId: waiting.game.id });
  assert.equal(joined.game.status, "active");
  await post("/api/action", { clientId: guest, type: "roll" }, 409);
  const categories = ["ones", "twos", "threes", "fours", "fives", "sixes", "threeKind", "fourKind", "fullHouse", "smallStraight", "largeStraight", "chance", "yahtzee"];
  let snapshot;
  for (const categoryKey of categories) {
    for (const clientId of [host, guest]) {
      const rolled = await post("/api/action", { clientId, type: "roll" });
      assert.equal(rolled.state.rollsLeft, 2);
      const held = await post("/api/action", { clientId, type: "toggleHold", index: 0 });
      assert.equal(held.state.held[0], true);
      const rerolled = await post("/api/action", { clientId, type: "roll" });
      assert.equal(rerolled.state.dice[0], rolled.state.dice[0]);
      snapshot = await post("/api/action", { clientId, type: "takeScore", categoryKey });
    }
  }
  assert.equal(snapshot.game.status, "completed");
  assert.equal(Object.keys(snapshot.state.players[0].scores).length, 13);
  const hostView = await (await fetch(`${baseUrl}/api/session?clientId=${host}`)).json();
  assert.deepEqual(hostView.state, snapshot.state);
  await post("/api/action", { clientId: host, type: "roll" }, 409);
});

test("an occupied platform PORT fails instead of silently using another port", async () => {
  const port = new URL(baseUrl).port;
  const second = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: port },
    stdio: "ignore",
  });
  try {
    const [code] = await Promise.race([
      once(second, "exit"),
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Occupied PORT did not fail")), 5000);
        timer.unref();
        second.once("exit", () => clearTimeout(timer));
      }),
    ]);
    assert.notEqual(code, 0);
  } finally {
    if (second.exitCode === null) second.kill();
  }
});

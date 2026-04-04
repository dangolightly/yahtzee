const http = require("http");
const fs = require("fs");
const path = require("path");

const DEFAULT_PORT = Number(process.env.PORT || 4173);
const SESSION_TIMEOUT_MS = 3 * 60 * 1000;
const root = __dirname;

const categories = [
  { key: "ones", section: "upper" },
  { key: "twos", section: "upper" },
  { key: "threes", section: "upper" },
  { key: "fours", section: "upper" },
  { key: "fives", section: "upper" },
  { key: "sixes", section: "upper" },
  { key: "threeKind", section: "lower" },
  { key: "fourKind", section: "lower" },
  { key: "fullHouse", section: "lower" },
  { key: "smallStraight", section: "lower" },
  { key: "largeStraight", section: "lower" },
  { key: "yahtzee", section: "lower" },
  { key: "chance", section: "lower" },
];

const upperKeys = ["ones", "twos", "threes", "fours", "fives", "sixes"];
const faceToUpperKey = {
  1: "ones",
  2: "twos",
  3: "threes",
  4: "fours",
  5: "fives",
  6: "sixes",
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function createPlayer(name) {
  return { name, scores: {}, yahtzeeBonus: 0 };
}

function createGameState(playerNames = ["Player 1", "Player 2"]) {
  return {
    players: playerNames.map((name) => createPlayer(name)),
    currentPlayer: 0,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rollsLeft: 3,
    turnStarted: false,
  };
}

function createLobby() {
  return {
    slots: [null, null],
    state: createGameState(),
    notice: "Waiting for Player 1.",
  };
}

const lobby = createLobby();

function getCounts(dice) {
  return dice.reduce((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function getUniqueSortedDice(dice) {
  return [...new Set(dice)].sort((left, right) => left - right);
}

function getYahtzeeFace(dice) {
  return dice.length === 5 && dice.every((value) => value === dice[0]) ? dice[0] : null;
}

function isBonusYahtzeeEligible(player, dice) {
  return getYahtzeeFace(dice) !== null && player.scores.yahtzee === 50;
}

function getForcedUpperCategory(player, dice) {
  if (!isBonusYahtzeeEligible(player, dice)) {
    return null;
  }

  const upperKey = faceToUpperKey[getYahtzeeFace(dice)];
  return upperKey in player.scores ? null : upperKey;
}

function isJokerActive(player, dice) {
  return isBonusYahtzeeEligible(player, dice) && getForcedUpperCategory(player, dice) === null;
}

function getOpenCategories(player, dice) {
  const openCategories = categories.filter((category) => !(category.key in player.scores));
  const forcedUpperCategory = getForcedUpperCategory(player, dice);
  if (!forcedUpperCategory) {
    return openCategories;
  }

  return openCategories.filter((category) => category.key === forcedUpperCategory);
}

function scoreCategory(categoryKey, dice, player = null) {
  const counts = getCounts(dice);
  const values = Object.values(counts);
  const total = dice.reduce((sum, value) => sum + value, 0);
  const jokerActive = player ? isJokerActive(player, dice) : false;

  switch (categoryKey) {
    case "ones":
      return dice.filter((value) => value === 1).length;
    case "twos":
      return dice.filter((value) => value === 2).length * 2;
    case "threes":
      return dice.filter((value) => value === 3).length * 3;
    case "fours":
      return dice.filter((value) => value === 4).length * 4;
    case "fives":
      return dice.filter((value) => value === 5).length * 5;
    case "sixes":
      return dice.filter((value) => value === 6).length * 6;
    case "threeKind":
      return values.some((count) => count >= 3) ? total : 0;
    case "fourKind":
      return values.some((count) => count >= 4) ? total : 0;
    case "fullHouse":
      return jokerActive || (values.includes(2) && values.includes(3)) ? 25 : 0;
    case "smallStraight": {
      const unique = getUniqueSortedDice(dice).join("");
      return jokerActive || ["1234", "2345", "3456"].some((sequence) => unique.includes(sequence)) ? 30 : 0;
    }
    case "largeStraight": {
      const unique = getUniqueSortedDice(dice).join("");
      return jokerActive || unique === "12345" || unique === "23456" ? 40 : 0;
    }
    case "yahtzee":
      return values.some((count) => count === 5) ? 50 : 0;
    case "chance":
      return total;
    default:
      return 0;
  }
}

function getPlayerTotals(player) {
  const upperSubtotal = upperKeys.reduce((sum, key) => sum + (player.scores[key] || 0), 0);
  const lowerSubtotal = categories
    .filter((category) => category.section === "lower")
    .reduce((sum, category) => sum + (player.scores[category.key] || 0), 0);
  const bonus = upperSubtotal >= 63 ? 35 : 0;
  const yahtzeeBonusScore = (player.yahtzeeBonus || 0) * 100;
  return {
    upperSubtotal,
    lowerSubtotal,
    bonus,
    yahtzeeBonusScore,
    grandTotal: upperSubtotal + lowerSubtotal + bonus + yahtzeeBonusScore,
    filled: Object.keys(player.scores).length,
  };
}

function isGameOver() {
  return lobby.state.players.every((player) => getPlayerTotals(player).filled === categories.length);
}

function getWinnerSummary() {
  const [first, second] = lobby.state.players.map(getPlayerTotals);
  if (first.grandTotal === second.grandTotal) {
    return {
      isTie: true,
      footer: `Tie game at ${first.grandTotal}.`,
    };
  }

  const winnerIndex = first.grandTotal > second.grandTotal ? 0 : 1;
  const loserIndex = winnerIndex === 0 ? 1 : 0;
  const margin = Math.abs(first.grandTotal - second.grandTotal);
  const winnerName = lobby.state.players[winnerIndex].name;
  const loserName = lobby.state.players[loserIndex].name;
  return {
    isTie: false,
    footer: `${winnerName} takes the crown by ${margin} over ${loserName}.`,
  };
}

function getSeatNames() {
  return lobby.slots.map((slot, index) => (slot ? slot.name : `Player ${index + 1}`));
}

function resetLobbyState() {
  lobby.state = createGameState(getSeatNames());
}

function occupiedCount() {
  return lobby.slots.filter(Boolean).length;
}

function assignedIndex(clientId) {
  return lobby.slots.findIndex((slot) => slot && slot.clientId === clientId);
}

function phaseForLobby() {
  if (occupiedCount() < 2) {
    return "waiting";
  }

  return isGameOver() ? "completed" : "active";
}

function touchSlot(index) {
  if (index >= 0 && lobby.slots[index]) {
    lobby.slots[index].lastSeen = Date.now();
  }
}

function setWaitingNotice(message) {
  lobby.notice = message;
}

function removePlayer(index, reason) {
  const remainingIndex = index === 0 ? 1 : 0;
  const remaining = lobby.slots[remainingIndex];
  lobby.slots[index] = null;

  if (!remaining) {
    resetLobbyState();
    setWaitingNotice("Waiting for Player 1.");
    return;
  }

  const winnerName = lobby.state.players[remainingIndex].name;
  resetLobbyState();
  setWaitingNotice(`${winnerName} wins by default. Waiting for another player.${reason ? ` ${reason}` : ""}`);
}

function sweepExpiredSessions() {
  const cutoff = Date.now() - SESSION_TIMEOUT_MS;
  lobby.slots.forEach((slot, index) => {
    if (slot && slot.lastSeen < cutoff) {
      removePlayer(index, "Opponent timed out.");
    }
  });
}

function snapshotFor(clientId) {
  sweepExpiredSessions();
  const playerIndex = assignedIndex(clientId);
  const role = playerIndex === 0 ? "player1" : playerIndex === 1 ? "player2" : occupiedCount() >= 2 ? "blocked" : "unassigned";
  let message = "";

  if (role === "blocked") {
    message = "Two players are already in this game. Waiting for an open seat.";
  } else if (phaseForLobby() === "waiting") {
    message = lobby.notice;
  } else if (isGameOver()) {
    message = getWinnerSummary().footer;
  }

  return {
    ok: true,
    role,
    playerIndex: playerIndex >= 0 ? playerIndex : null,
    lobby: {
      phase: phaseForLobby(),
      occupied: occupiedCount(),
      message,
      timeoutMs: SESSION_TIMEOUT_MS,
    },
    state: lobby.state,
  };
}

function claimSeat(clientId) {
  sweepExpiredSessions();

  let index = assignedIndex(clientId);
  if (index >= 0) {
    touchSlot(index);
    return snapshotFor(clientId);
  }

  index = lobby.slots.findIndex((slot) => !slot);
  if (index === -1) {
    return snapshotFor(clientId);
  }

  lobby.slots[index] = {
    clientId,
    name: lobby.state.players[index]?.name || `Player ${index + 1}`,
    lastSeen: Date.now(),
  };
  lobby.state.players[index].name = lobby.slots[index].name;

  if (occupiedCount() === 2) {
    resetLobbyState();
    setWaitingNotice("");
  } else {
    resetLobbyState();
    setWaitingNotice(`Waiting for Player ${index === 0 ? 2 : 1}.`);
  }

  return snapshotFor(clientId);
}

function renamePlayer(clientId, name) {
  const index = assignedIndex(clientId);
  if (index === -1) {
    return false;
  }

  const nextName = String(name || "").trim().slice(0, 24) || `Player ${index + 1}`;
  lobby.slots[index].name = nextName;
  lobby.state.players[index].name = nextName;
  if (phaseForLobby() === "waiting") {
    setWaitingNotice(`Waiting for Player ${index === 0 ? 2 : 1}.`);
  }
  touchSlot(index);
  return true;
}

function randomDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function ensureActiveTurn(clientId) {
  const index = assignedIndex(clientId);
  if (index === -1 || phaseForLobby() !== "active" || index !== lobby.state.currentPlayer || isGameOver()) {
    return false;
  }

  touchSlot(index);
  return true;
}

function rollFor(clientId) {
  if (!ensureActiveTurn(clientId) || lobby.state.rollsLeft === 0) {
    return false;
  }

  lobby.state.dice = lobby.state.dice.map((value, index) => (lobby.state.held[index] ? value : randomDie()));
  lobby.state.rollsLeft -= 1;
  lobby.state.turnStarted = true;
  return true;
}

function toggleHoldFor(clientId, index) {
  if (!ensureActiveTurn(clientId) || !lobby.state.turnStarted || lobby.state.rollsLeft === 3) {
    return false;
  }

  if (!Number.isInteger(index) || index < 0 || index > 4) {
    return false;
  }

  lobby.state.held[index] = !lobby.state.held[index];
  return true;
}

function advanceTurn() {
  lobby.state.currentPlayer = lobby.state.currentPlayer === 0 ? 1 : 0;
  lobby.state.dice = [1, 1, 1, 1, 1];
  lobby.state.held = [false, false, false, false, false];
  lobby.state.rollsLeft = 3;
  lobby.state.turnStarted = false;
}

function takeScoreFor(clientId, categoryKey) {
  if (!ensureActiveTurn(clientId) || !lobby.state.turnStarted) {
    return false;
  }

  const player = lobby.state.players[lobby.state.currentPlayer];
  if (categoryKey in player.scores || !getOpenCategories(player, lobby.state.dice).some((category) => category.key === categoryKey)) {
    return false;
  }

  if (isBonusYahtzeeEligible(player, lobby.state.dice)) {
    player.yahtzeeBonus += 1;
  }

  player.scores[categoryKey] = scoreCategory(categoryKey, lobby.state.dice, player);
  advanceTurn();
  return true;
}

function resetForCurrentSeats() {
  resetLobbyState();
  if (occupiedCount() < 2) {
    setWaitingNotice(`Waiting for Player ${lobby.slots[0] ? 2 : 1}.`);
  } else {
    setWaitingNotice("");
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function parseJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 64) {
        reject(new Error("Request too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/session") {
    const clientId = url.searchParams.get("clientId");
    if (!clientId) {
      sendJson(response, 400, { ok: false, error: "Missing clientId" });
      return true;
    }

    const index = assignedIndex(clientId);
    if (index >= 0) {
      touchSlot(index);
    }
    sendJson(response, 200, snapshotFor(clientId));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/session/claim") {
    try {
      const body = await parseJson(request);
      if (!body.clientId) {
        sendJson(response, 400, { ok: false, error: "Missing clientId" });
        return true;
      }

      sendJson(response, 200, claimSeat(String(body.clientId)));
      return true;
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
      return true;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/action") {
    try {
      const body = await parseJson(request);
      const clientId = String(body.clientId || "");
      const type = String(body.type || "");
      if (!clientId || !type) {
        sendJson(response, 400, { ok: false, error: "Missing action payload" });
        return true;
      }

      let success = false;
      if (type === "rename") {
        success = renamePlayer(clientId, body.name);
      } else if (type === "roll") {
        success = rollFor(clientId);
      } else if (type === "toggleHold") {
        success = toggleHoldFor(clientId, Number(body.index));
      } else if (type === "takeScore") {
        success = takeScoreFor(clientId, String(body.categoryKey || ""));
      } else if (type === "newGame") {
        if (assignedIndex(clientId) !== -1) {
          touchSlot(assignedIndex(clientId));
          resetForCurrentSeats();
          success = true;
        }
      }

      if (!success) {
        sendJson(response, 409, { ok: false, error: "Action rejected", snapshot: snapshotFor(clientId) });
        return true;
      }

      sendJson(response, 200, snapshotFor(clientId));
      return true;
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
      return true;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, mode: "online", occupied: occupiedCount() });
    return true;
  }

  return false;
}

function serveStatic(url, response) {
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalizedPath = path.normalize(requestPath).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(root, normalizedPath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(data);
  });
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    const handled = await handleApi(request, response, url);
    if (!handled) {
      sendJson(response, 404, { ok: false, error: "Not found" });
    }
    return;
  }

  serveStatic(url, response);
}

function startServer(port) {
  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error.message || "Server error");
    });
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      startServer(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, () => {
    console.log(`Yahtzee Cabin running at http://localhost:${port}`);
  });
}

setInterval(sweepExpiredSessions, 15_000).unref();

startServer(DEFAULT_PORT);

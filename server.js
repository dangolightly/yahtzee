const http = require("http");
const fs = require("fs");
const path = require("path");

const DEFAULT_PORT = Number(process.env.PORT || 4173);
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const COMPLETED_GAME_TTL_MS = 10 * 60 * 1000;
const DISCONNECT_GRACE_MS = 12 * 1000;
const MAX_WAITING_GAMES = 10;
const OPENAI_BASE_URL = String(process.env.CP_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_API_KEY = String(process.env.CP_OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = String(process.env.CP_OPENAI_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
const AI_TIMEOUT_MS = Math.max(1_000, Number(process.env.CP_AI_TIMEOUT_MS) || 20_000);
const root = __dirname;

const categories = [
  { key: "ones", label: "Ones", section: "upper" },
  { key: "twos", label: "Twos", section: "upper" },
  { key: "threes", label: "Threes", section: "upper" },
  { key: "fours", label: "Fours", section: "upper" },
  { key: "fives", label: "Fives", section: "upper" },
  { key: "sixes", label: "Sixes", section: "upper" },
  { key: "threeKind", label: "3-kind", section: "lower" },
  { key: "fourKind", label: "4-kind", section: "lower" },
  { key: "fullHouse", label: "Full house", section: "lower" },
  { key: "smallStraight", label: "Sm straight", section: "lower" },
  { key: "largeStraight", label: "Lg straight", section: "lower" },
  { key: "yahtzee", label: "Yahtzee", section: "lower" },
  { key: "chance", label: "Chance", section: "lower" },
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

const games = new Map();
const profiles = new Map();

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

function createSeat(clientId, name) {
  return {
    clientId,
    name,
    lastSeen: Date.now(),
    disconnectRequestedAt: null,
  };
}

function normalizeName(name, fallback = "Player") {
  return String(name || "").trim().slice(0, 24) || fallback;
}

function hasProvidedName(name) {
  return String(name || "").trim().length > 0;
}

function formatUniqueWaitingName(baseName, suffix) {
  const suffixText = String(suffix);
  return `${baseName.slice(0, Math.max(0, 24 - suffixText.length))}${suffixText}`;
}

function generateGameId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createGame(hostClientId, hostName) {
  const gameId = generateGameId();
  const seat = createSeat(hostClientId, hostName);
  const game = {
    id: gameId,
    status: "waiting",
    players: [seat, null],
    state: createGameState([hostName, "Challenger"]),
    notice: `${hostName} is waiting for a challenger.`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
  };
  games.set(gameId, game);
  return game;
}

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

function isGameOver(game) {
  return game.state.players.every((player) => getPlayerTotals(player).filled === categories.length);
}

function getWinnerSummary(game) {
  const [first, second] = game.state.players.map(getPlayerTotals);
  if (first.grandTotal === second.grandTotal) {
    return {
      isTie: true,
      footer: `Tie game at ${first.grandTotal}.`,
    };
  }

  const winnerIndex = first.grandTotal > second.grandTotal ? 0 : 1;
  const loserIndex = winnerIndex === 0 ? 1 : 0;
  const margin = Math.abs(first.grandTotal - second.grandTotal);
  const winnerName = game.state.players[winnerIndex].name;
  const loserName = game.state.players[loserIndex].name;
  return {
    isTie: false,
    footer: `${winnerName} takes the crown by ${margin} over ${loserName}.`,
  };
}

function touchGame(game) {
  game.updatedAt = Date.now();
}

function touchSeat(game, playerIndex) {
  const seat = game.players[playerIndex];
  if (seat) {
    seat.lastSeen = Date.now();
    seat.disconnectRequestedAt = null;
    touchGame(game);
  }
}

function syncGameNames(game) {
  game.state.players.forEach((player, index) => {
    const fallback = index === 0 ? "Player 1" : game.status === "waiting" ? "Challenger" : `Player ${index + 1}`;
    player.name = game.players[index]?.name || player.name || fallback;
  });
}

function findMembership(clientId) {
  for (const game of games.values()) {
    const playerIndex = game.players.findIndex((seat) => seat && seat.clientId === clientId);
    if (playerIndex >= 0) {
      return { game, playerIndex };
    }
  }

  return null;
}

function getWaitingGames() {
  return [...games.values()]
    .filter((game) => game.status === "waiting" && game.players[0])
    .sort((left, right) => left.createdAt - right.createdAt);
}

function getUniqueWaitingName(name, excludeClientId = null) {
  const baseName = normalizeName(name, "Player");
  const reservedNames = new Set(
    getWaitingGames()
      .filter((game) => game.players[0] && game.players[0].clientId !== excludeClientId)
      .map((game) => game.players[0].name.toLowerCase()),
  );

  if (!reservedNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (suffix < 10_000) {
    const candidate = formatUniqueWaitingName(baseName, suffix);
    if (!reservedNames.has(candidate.toLowerCase())) {
      return candidate;
    }
    suffix += 1;
  }

  return formatUniqueWaitingName(baseName, Date.now() % 10_000);
}

function listWaitingGames(clientId) {
  return getWaitingGames()
    .filter((game) => !game.players[0].disconnectRequestedAt)
    .filter((game) => !clientId || game.players[0].clientId !== clientId)
    .slice(0, MAX_WAITING_GAMES)
    .map((game) => ({
      id: game.id,
      hostName: game.players[0].name,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
    }));
}

function buildLobbyMessage(clientId, membership) {
  if (!membership) {
    return "Enter your name to see the challenger list.";
  }

  const { game, playerIndex } = membership;
  if (game.status === "waiting") {
    return playerIndex === 0 ? "Choose a challenger or wait to be picked." : "Game on.";
  }

  if (game.status === "completed") {
    return game.notice || getWinnerSummary(game).footer;
  }

  if (isGameOver(game)) {
    return getWinnerSummary(game).footer;
  }

  return `${game.state.players[game.state.currentPlayer].name} is up.`;
}

function buildSnapshot(clientId) {
  sweepExpiredGames();
  const membership = findMembership(clientId);
  const waitingGames = listWaitingGames(clientId);
  const profileName = profiles.get(clientId) || "";

  if (!membership) {
    return {
      ok: true,
      role: "unassigned",
      playerIndex: null,
      profileName,
      lobby: {
        phase: "lobby",
        message: buildLobbyMessage(clientId, null),
        timeoutMs: SESSION_TIMEOUT_MS,
        waitingGames,
        currentGameId: null,
      },
      game: null,
      state: createGameState(),
    };
  }

  const { game, playerIndex } = membership;
  touchSeat(game, playerIndex);
  syncGameNames(game);

  return {
    ok: true,
    role: playerIndex === 0 ? "player1" : "player2",
    playerIndex,
    profileName: profileName || game.players[playerIndex]?.name || "",
    lobby: {
      phase: game.status,
      message: buildLobbyMessage(clientId, membership),
      timeoutMs: SESSION_TIMEOUT_MS,
      waitingGames,
      currentGameId: game.id,
    },
    game: {
      id: game.id,
      status: game.status,
      players: game.state.players.map((player, index) => ({
        name: player.name,
        connected: Boolean(game.players[index]),
      })),
    },
    state: game.state,
  };
}

function cleanupCompletedGames() {
  const cutoff = Date.now() - COMPLETED_GAME_TTL_MS;
  for (const [gameId, game] of games.entries()) {
    if (game.status === "completed" && game.completedAt && game.completedAt < cutoff) {
      games.delete(gameId);
    }
  }
}

function concludeByDefault(game, playerIndex, reason) {
  const otherIndex = playerIndex === 0 ? 1 : 0;
  const otherSeat = game.players[otherIndex];
  const leaverName = game.state.players[playerIndex].name;

  game.players[playerIndex] = null;

  if (!otherSeat) {
    games.delete(game.id);
    return;
  }

  const winnerName = game.state.players[otherIndex].name;
  game.status = "completed";
  game.completedAt = Date.now();
  game.notice = `${winnerName} wins by default. ${leaverName} ${reason}.`;
  touchGame(game);
}

function markClientDisconnected(clientId) {
  const membership = findMembership(clientId);
  if (!membership) {
    return false;
  }

  const seat = membership.game.players[membership.playerIndex];
  if (!seat || membership.game.status === "completed") {
    return false;
  }

  seat.disconnectRequestedAt = Date.now();
  touchGame(membership.game);
  return true;
}

function sweepExpiredGames() {
  const cutoff = Date.now() - SESSION_TIMEOUT_MS;
  const disconnectCutoff = Date.now() - DISCONNECT_GRACE_MS;

  for (const [gameId, game] of games.entries()) {
    if (game.status === "completed") {
      game.players = game.players.map((seat) => (seat && seat.lastSeen >= cutoff ? seat : null));
      if (!game.players[0] && !game.players[1]) {
        games.delete(gameId);
      }
      continue;
    }

    if (game.status === "waiting") {
      if (!game.players[0] || game.players[0].lastSeen < cutoff || (game.players[0].disconnectRequestedAt && game.players[0].disconnectRequestedAt < disconnectCutoff)) {
        games.delete(gameId);
      }
      continue;
    }

    game.players.forEach((seat, index) => {
      if (!seat || game.status !== "active") {
        return;
      }

      if (seat.disconnectRequestedAt && seat.disconnectRequestedAt < disconnectCutoff) {
        concludeByDefault(game, index, "left the game");
        return;
      }

      if (seat.lastSeen < cutoff) {
        concludeByDefault(game, index, "timed out");
      }
    });
  }

  cleanupCompletedGames();
}

function ensureAvailable(clientId) {
  const membership = findMembership(clientId);
  if (!membership) {
    return null;
  }

  if (membership.game.status === "completed") {
    membership.game.players[membership.playerIndex] = null;
    if (!membership.game.players[0] && !membership.game.players[1]) {
      games.delete(membership.game.id);
    }
    return null;
  }

  return membership;
}

function createLobbyGame(clientId, name) {
  return acceptProfileName(clientId, name);
}

function joinLobbyGame(clientId, gameId, name) {
  sweepExpiredGames();
  const membership = ensureAvailable(clientId);
  if (!membership || membership.game.status !== "waiting" || membership.playerIndex !== 0) {
    return { ok: false, error: "Enter your name first.", snapshot: buildSnapshot(clientId) };
  }

  const game = games.get(gameId);
  if (!game || game.status !== "waiting" || !game.players[0] || game.players[0].disconnectRequestedAt || game.players[1] || game.id === membership.game.id) {
    return { ok: false, error: "That challenger is no longer available.", snapshot: buildSnapshot(clientId) };
  }

  const challengerName = membership.game.players[0].name || normalizeName(name, "Player 2");
  profiles.set(clientId, challengerName);
  games.delete(membership.game.id);
  game.players[1] = createSeat(clientId, challengerName);
  game.status = "active";
  game.notice = "";
  game.completedAt = null;
  game.state = createGameState([game.players[0].name, challengerName]);
  touchGame(game);
  return { ok: true, snapshot: buildSnapshot(clientId) };
}

function leaveCurrentGame(clientId) {
  sweepExpiredGames();
  const membership = findMembership(clientId);
  if (!membership) {
    return { ok: true, snapshot: buildSnapshot(clientId) };
  }

  const { game, playerIndex } = membership;
  if (game.status === "waiting") {
    games.delete(game.id);
    return { ok: true, snapshot: buildSnapshot(clientId) };
  }

  if (game.status === "completed") {
    game.players[playerIndex] = null;
    if (!game.players[0] && !game.players[1]) {
      games.delete(game.id);
    }
    return { ok: true, snapshot: buildSnapshot(clientId) };
  }

  concludeByDefault(game, playerIndex, "left the game");
  return { ok: true, snapshot: buildSnapshot(clientId) };
}

function acceptProfileName(clientId, name) {
  sweepExpiredGames();
  if (!hasProvidedName(name)) {
    return { ok: false, error: "Enter your name first.", snapshot: buildSnapshot(clientId) };
  }

  const membership = ensureAvailable(clientId);
  if (!membership) {
    const nextName = getUniqueWaitingName(name, clientId);
    profiles.set(clientId, nextName);
    createGame(clientId, nextName);
    return { ok: true, snapshot: buildSnapshot(clientId) };
  }

  if (membership.game.status === "waiting") {
    const nextName = getUniqueWaitingName(name, clientId);
    profiles.set(clientId, nextName);
    membership.game.players[0].name = nextName;
    membership.game.state.players[0].name = nextName;
    membership.game.notice = `${nextName} is waiting for a challenger.`;
    touchSeat(membership.game, 0);
    return { ok: true, snapshot: buildSnapshot(clientId) };
  }

  const nextName = normalizeName(name, "Player");
  profiles.set(clientId, nextName);
  membership.game.players[membership.playerIndex].name = nextName;
  membership.game.state.players[membership.playerIndex].name = nextName;
  touchSeat(membership.game, membership.playerIndex);
  return { ok: true, snapshot: buildSnapshot(clientId) };
}

function ensureActiveTurn(clientId) {
  const membership = findMembership(clientId);
  if (!membership) {
    return null;
  }

  const { game, playerIndex } = membership;
  if (game.status !== "active" || playerIndex !== game.state.currentPlayer || isGameOver(game)) {
    return null;
  }

  touchSeat(game, playerIndex);
  return membership;
}

function randomDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function rollFor(clientId) {
  const membership = ensureActiveTurn(clientId);
  if (!membership || membership.game.state.rollsLeft === 0) {
    return false;
  }

  membership.game.state.dice = membership.game.state.dice.map((value, index) => (
    membership.game.state.held[index] ? value : randomDie()
  ));
  membership.game.state.rollsLeft -= 1;
  membership.game.state.turnStarted = true;
  touchGame(membership.game);
  return true;
}

function toggleHoldFor(clientId, index) {
  const membership = ensureActiveTurn(clientId);
  if (!membership || !membership.game.state.turnStarted || membership.game.state.rollsLeft === 3) {
    return false;
  }

  if (!Number.isInteger(index) || index < 0 || index > 4) {
    return false;
  }

  membership.game.state.held[index] = !membership.game.state.held[index];
  touchGame(membership.game);
  return true;
}

function advanceTurn(game) {
  game.state.currentPlayer = game.state.currentPlayer === 0 ? 1 : 0;
  game.state.dice = [1, 1, 1, 1, 1];
  game.state.held = [false, false, false, false, false];
  game.state.rollsLeft = 3;
  game.state.turnStarted = false;
}

function takeScoreFor(clientId, categoryKey) {
  const membership = ensureActiveTurn(clientId);
  if (!membership || !membership.game.state.turnStarted) {
    return false;
  }

  const game = membership.game;
  const player = game.state.players[game.state.currentPlayer];
  if (categoryKey in player.scores || !getOpenCategories(player, game.state.dice).some((category) => category.key === categoryKey)) {
    return false;
  }

  if (isBonusYahtzeeEligible(player, game.state.dice)) {
    player.yahtzeeBonus += 1;
  }

  player.scores[categoryKey] = scoreCategory(categoryKey, game.state.dice, player);
  advanceTurn(game);
  touchGame(game);
  if (isGameOver(game)) {
    game.status = "completed";
    game.completedAt = Date.now();
    game.notice = getWinnerSummary(game).footer;
  }
  return true;
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

function getCategoryLabel(categoryKey) {
  return categories.find((category) => category.key === categoryKey)?.label || String(categoryKey || "score");
}

function normalizeFunLine(line) {
  const cleaned = String(line || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!cleaned) {
    return "";
  }

  const words = cleaned.split(" ").filter(Boolean).slice(0, 6);
  if (!words.length) {
    return "";
  }

  const clipped = words.join(" ").replace(/[.!?]+$/, "");
  return clipped ? `${clipped}.` : "";
}

function fallbackFunLine(points) {
  if (points >= 40) {
    return "Dice just hired your hype manager.";
  }

  if (points >= 25) {
    return "That move scared the probability gods.";
  }

  if (points >= 12) {
    return "Solid score, snack break earned soon.";
  }

  if (points > 0) {
    return "Messy, but your comeback is brewing.";
  }

  return "Bold scratch, future-you says thank you.";
}

async function generateFunLine(categoryKey, points) {
  const safePoints = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  const fallbackLine = fallbackFunLine(safePoints);
  if (!OPENAI_API_KEY) {
    return { line: fallbackLine, source: "fallback" };
  }

  const categoryLabel = getCategoryLabel(categoryKey);
  const playSummary = `${safePoints} points in the ${categoryLabel} position`;
  const userPrompt = `I am playing Yahtzee, I just played ${playSummary}, provide me one funny sentence, you are limited to 6 words, about that play, if it was a great play, then celebrate with humor, if it was a lame play, then something funny and encouraging.`;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 1,
        max_tokens: 40,
        messages: [
          {
            role: "system",
            content: "Write one family-friendly funny Yahtzee reaction. Return exactly one sentence, 6 words maximum. No emojis. No quotes.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || "AI request failed");
    }

    const candidate = payload?.choices?.[0]?.message?.content;
    const normalized = normalizeFunLine(candidate);
    if (normalized) {
      return { line: normalized, source: "ai" };
    }

    return { line: fallbackLine, source: "fallback" };
  } catch {
    return { line: fallbackLine, source: "fallback" };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/session") {
    const clientId = String(url.searchParams.get("clientId") || "");
    if (!clientId) {
      sendJson(response, 400, { ok: false, error: "Missing clientId" });
      return true;
    }

    sendJson(response, 200, buildSnapshot(clientId));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/session/claim") {
    try {
      const body = await parseJson(request);
      const clientId = String(body.clientId || "");
      if (!clientId) {
        sendJson(response, 400, { ok: false, error: "Missing clientId" });
        return true;
      }

      sendJson(response, 200, buildSnapshot(clientId));
      return true;
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
      return true;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/profile") {
    try {
      const body = await parseJson(request);
      const clientId = String(body.clientId || "");
      if (!clientId) {
        sendJson(response, 400, { ok: false, error: "Missing clientId" });
        return true;
      }

      const result = acceptProfileName(clientId, body.name);
      if (!result.ok) {
        sendJson(response, 409, result);
        return true;
      }

      sendJson(response, 200, result.snapshot);
      return true;
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
      return true;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/lobby/create") {
    try {
      const body = await parseJson(request);
      const clientId = String(body.clientId || "");
      if (!clientId) {
        sendJson(response, 400, { ok: false, error: "Missing clientId" });
        return true;
      }

      const result = createLobbyGame(clientId, body.name || profiles.get(clientId));
      if (!result.ok) {
        sendJson(response, 409, result);
        return true;
      }

      sendJson(response, 200, result.snapshot);
      return true;
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
      return true;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/lobby/join") {
    try {
      const body = await parseJson(request);
      const clientId = String(body.clientId || "");
      const gameId = String(body.gameId || "").toUpperCase();
      if (!clientId || !gameId) {
        sendJson(response, 400, { ok: false, error: "Missing join payload" });
        return true;
      }

      const result = joinLobbyGame(clientId, gameId, body.name || profiles.get(clientId));
      if (!result.ok) {
        sendJson(response, 409, result);
        return true;
      }

      sendJson(response, 200, result.snapshot);
      return true;
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
      return true;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/lobby/leave") {
    try {
      const body = await parseJson(request);
      const clientId = String(body.clientId || "");
      if (!clientId) {
        sendJson(response, 400, { ok: false, error: "Missing clientId" });
        return true;
      }

      const result = leaveCurrentGame(clientId);
      sendJson(response, 200, result.snapshot);
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
      if (type === "roll") {
        success = rollFor(clientId);
      } else if (type === "toggleHold") {
        success = toggleHoldFor(clientId, Number(body.index));
      } else if (type === "takeScore") {
        success = takeScoreFor(clientId, String(body.categoryKey || ""));
      } else if (type === "newGame") {
        success = leaveCurrentGame(clientId).ok;
      }

      if (!success) {
        sendJson(response, 409, { ok: false, error: "Action rejected", snapshot: buildSnapshot(clientId) });
        return true;
      }

      sendJson(response, 200, buildSnapshot(clientId));
      return true;
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
      return true;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/fun-line") {
    try {
      const body = await parseJson(request);
      const categoryKey = String(body.categoryKey || "");
      const points = Number(body.points);
      if (!categoryKey || !Number.isFinite(points)) {
        sendJson(response, 400, { ok: false, error: "Missing play payload" });
        return true;
      }

      const funLine = await generateFunLine(categoryKey, points);
      sendJson(response, 200, { ok: true, line: funLine.line, source: funLine.source });
      return true;
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
      return true;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      waitingGames: getWaitingGames().length,
      totalGames: games.size,
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/session/disconnect") {
    try {
      const body = await parseJson(request);
      const clientId = String(body.clientId || "");
      if (!clientId) {
        sendJson(response, 400, { ok: false, error: "Missing clientId" });
        return true;
      }

      markClientDisconnected(clientId);
      sendJson(response, 200, { ok: true });
      return true;
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
      return true;
    }
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

setInterval(sweepExpiredGames, 15_000).unref();

startServer(DEFAULT_PORT);

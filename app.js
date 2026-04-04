const STORAGE_KEY = "yahtzee-state-v2";
const CLIENT_ID_KEY = "yahtzee-client-id-v2";
const PROFILE_NAME_KEY = "yahtzee-profile-name-v1";
const SESSION_POLL_MS = 4000;

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

const els = {
  playerOneInput: document.querySelector("#player-one-input"),
  playerTwoInput: document.querySelector("#player-two-input"),
  playerOneChip: document.querySelector("#player-one-chip"),
  playerTwoChip: document.querySelector("#player-two-chip"),
  playerOneSeatTag: document.querySelector("#player-one-seat-tag"),
  playerTwoSeatTag: document.querySelector("#player-two-seat-tag"),
  playerOneTotal: document.querySelector("#player-one-total"),
  playerTwoTotal: document.querySelector("#player-two-total"),
  playerOneHeading: document.querySelector("#player-one-heading"),
  playerTwoHeading: document.querySelector("#player-two-heading"),
  newGameButton: document.querySelector("#new-game-button"),
  rollButton: document.querySelector("#roll-button"),
  lobbyPanel: document.querySelector("#lobby-panel"),
  displayNameInput: document.querySelector("#display-name-input"),
  createGameButton: document.querySelector("#create-game-button"),
  leaveGameButton: document.querySelector("#leave-game-button"),
  lobbyCopy: document.querySelector("#lobby-copy"),
  queueList: document.querySelector("#queue-list"),
  sessionBanner: document.querySelector("#session-banner"),
  installWarning: document.querySelector("#install-warning"),
  winnerBanner: document.querySelector("#winner-banner"),
  winnerConfetti: document.querySelector("#winner-confetti"),
  winnerTitle: document.querySelector("#winner-title"),
  winnerCopy: document.querySelector("#winner-copy"),
  diceGrid: document.querySelector("#dice-grid"),
  scoreboardBody: document.querySelector("#scoreboard-body"),
  scoreboardFooter: document.querySelector("#scoreboard-footer"),
  dieTemplate: document.querySelector("#die-template"),
};

const isOfflineInstallBlocked = !window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";

function createPlayer(name) {
  return { name, scores: {}, yahtzeeBonus: 0 };
}

function createNewState(playerNames = ["Player 1", "Player 2"]) {
  return {
    players: playerNames.map((name) => createPlayer(name)),
    currentPlayer: 0,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rollsLeft: 3,
    turnStarted: false,
  };
}

function normalizeDice(dice) {
  if (!Array.isArray(dice) || dice.length !== 5) {
    return [1, 1, 1, 1, 1];
  }

  return dice.map((value) => {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 1 && numeric <= 6 ? numeric : 1;
  });
}

function normalizeHeld(held) {
  if (!Array.isArray(held) || held.length !== 5) {
    return [false, false, false, false, false];
  }

  return held.map(Boolean);
}

function clampRolls(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 3 ? numeric : 3;
}

function normalizeState(raw) {
  if (!raw || !Array.isArray(raw.players) || raw.players.length !== 2) {
    return createNewState();
  }

  return {
    ...createNewState(),
    ...raw,
    players: raw.players.map((player, index) => ({
      name: String(player.name || `Player ${index + 1}`).slice(0, 24),
      scores: typeof player.scores === "object" && player.scores ? player.scores : {},
      yahtzeeBonus: Number.isInteger(player.yahtzeeBonus) && player.yahtzeeBonus >= 0 ? player.yahtzeeBonus : 0,
    })),
    dice: normalizeDice(raw.dice),
    held: normalizeHeld(raw.held),
    rollsLeft: clampRolls(raw.rollsLeft),
    currentPlayer: raw.currentPlayer === 1 ? 1 : 0,
    turnStarted: Boolean(raw.turnStarted),
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createNewState();
  } catch {
    return createNewState();
  }
}

function saveState() {
  if (session.mode === "offline") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function getOrCreateClientId() {
  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(CLIENT_ID_KEY, nextId);
  return nextId;
}

function loadProfileName() {
  return String(window.localStorage.getItem(PROFILE_NAME_KEY) || "").slice(0, 24);
}

function saveProfileName(name) {
  window.localStorage.setItem(PROFILE_NAME_KEY, String(name || "").slice(0, 24));
}

function updateInputValue(element, value) {
  if (document.activeElement !== element) {
    element.value = value;
  }
}

let state = loadState();

const session = {
  clientId: getOrCreateClientId(),
  profileName: loadProfileName(),
  mode: "offline",
  role: null,
  playerIndex: null,
  phase: "offline",
  notice: "",
  pollHandle: null,
  reconnecting: false,
  waitingGames: [],
  currentGameId: null,
};

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

function getCurrentPlayer() {
  return state.players[state.currentPlayer];
}

function isGameOver() {
  return state.players.every((player) => getPlayerTotals(player).filled === categories.length);
}

function getWinnerSummary() {
  const [first, second] = state.players.map(getPlayerTotals);
  if (first.grandTotal === second.grandTotal) {
    return {
      isTie: true,
      title: "Photo finish",
      copy: `Dead even at ${first.grandTotal}. Split the snacks and play another.`,
      footer: `Tie game at ${first.grandTotal}.`,
    };
  }

  const winnerIndex = first.grandTotal > second.grandTotal ? 0 : 1;
  const loserIndex = winnerIndex === 0 ? 1 : 0;
  const margin = Math.abs(first.grandTotal - second.grandTotal);
  const winnerName = state.players[winnerIndex].name;
  const loserName = state.players[loserIndex].name;
  const winnerScore = winnerIndex === 0 ? first.grandTotal : second.grandTotal;
  const bonusHits = state.players[winnerIndex].yahtzeeBonus || 0;
  return {
    isTie: false,
    title: `${winnerName} takes the crown`,
    copy: `${winnerName} posts ${winnerScore} and wins by ${margin} over ${loserName}.${bonusHits > 0 ? ` Bonus Yahtzees: ${bonusHits}.` : ""}`,
    footer: `${winnerName} takes the crown by ${margin} over ${loserName}.`,
  };
}

function isOnlineMode() {
  return session.mode === "online";
}

function canCurrentClientAct() {
  return !isOnlineMode() || (session.playerIndex === state.currentPlayer && session.phase === "active");
}

function renderNotice() {
  const messages = [];

  if (isOnlineMode() && session.notice) {
    messages.push(session.notice);
  }

  if (isOfflineInstallBlocked) {
    messages.push("This LAN address is not a secure install origin on iPhone. It can preview the game, but Add to Home Screen will not work offline until the app is hosted on HTTPS.");
  }

  if (messages.length > 0) {
    els.installWarning.hidden = false;
    els.installWarning.textContent = messages.join(" ");
  } else {
    els.installWarning.hidden = true;
    els.installWarning.textContent = "";
  }
}

function renderLobby() {
  if (!isOnlineMode()) {
    els.lobbyPanel.hidden = true;
    els.queueList.innerHTML = "";
    return;
  }

  els.lobbyPanel.hidden = false;
  updateInputValue(els.displayNameInput, session.profileName);

  const hasName = Boolean(session.profileName.trim());
  els.createGameButton.disabled = !hasName || session.role !== "unassigned";
  els.leaveGameButton.hidden = session.role === "unassigned";
  els.leaveGameButton.disabled = session.role === "unassigned";

  if (session.phase === "lobby") {
    els.lobbyCopy.textContent = "Pick a name, open a table, or join a waiting challenger queue below.";
  } else if (session.phase === "waiting") {
    els.lobbyCopy.textContent = `${state.players[0].name} is waiting for a challenger at table ${session.currentGameId}.`;
  } else if (session.phase === "active") {
    els.lobbyCopy.textContent = `Table ${session.currentGameId} is live: ${state.players[0].name} vs ${state.players[1].name}.`;
  } else if (session.phase === "completed") {
    els.lobbyCopy.textContent = session.notice || `Table ${session.currentGameId} is complete.`;
  } else {
    els.lobbyCopy.textContent = session.notice || "Connecting to the live lobby...";
  }

  if (session.waitingGames.length === 0) {
    els.queueList.innerHTML = '<p class="queue-empty">No open tables right now.</p>';
    return;
  }

  els.queueList.innerHTML = session.waitingGames.map((game) => `
    <div class="queue-card${game.isMine ? " is-mine" : ""}">
      <div>
        <strong>${game.hostName}</strong>
        <span>Table ${game.id}</span>
      </div>
      <button class="secondary-button compact-button" type="button" data-join-game="${game.id}" ${(!hasName || session.role !== "unassigned" || game.isMine) ? "disabled" : ""}>
        ${game.isMine ? "Your Table" : "Join"}
      </button>
    </div>
  `).join("");
}

function renderDice() {
  els.diceGrid.innerHTML = "";
  state.dice.forEach((value, index) => {
    const fragment = els.dieTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".die");
    const valueEl = fragment.querySelector(".die-value");
    button.dataset.index = String(index);
    button.disabled = !state.turnStarted || state.rollsLeft === 3 || isGameOver() || !canCurrentClientAct();
    button.classList.toggle("is-held", state.held[index]);
    button.setAttribute("aria-pressed", state.held[index] ? "true" : "false");
    valueEl.textContent = String(value);
    els.diceGrid.appendChild(fragment);
  });
}

function renderScoreCell(category, playerIndex, rowIndex) {
  const player = state.players[playerIndex];
  if (category.key in player.scores) {
    return `<td class="score-cell"><span class="score-value">${player.scores[category.key]}</span></td>`;
  }

  const canScore = playerIndex === state.currentPlayer
    && state.turnStarted
    && !isGameOver()
    && canCurrentClientAct()
    && getOpenCategories(player, state.dice).some((openCategory) => openCategory.key === category.key);

  if (!canScore) {
    return '<td class="score-cell"><span class="score-open">Open</span></td>';
  }

  const preview = scoreCategory(category.key, state.dice, player);
  const staggerClass = rowIndex % 2 === 0 ? "stagger-right" : "stagger-left";
  const buttonLabel = preview > 0 ? String(preview) : "Scratch";
  const buttonClass = preview > 0 ? "score-button is-active" : "score-button is-scratch";
  return `
    <td class="score-cell ${staggerClass}">
      <button class="${buttonClass}" type="button" data-score-category="${category.key}">${buttonLabel}</button>
    </td>
  `;
}

function renderCategoryRows(sectionName, sectionKey) {
  const rows = categories
    .filter((category) => category.section === sectionKey)
    .map((category) => {
      const rowIndex = categories.findIndex((entry) => entry.key === category.key);
      return `
      <tr>
        <td class="category-label">${category.label}</td>
        ${renderScoreCell(category, 0, rowIndex)}
        ${renderScoreCell(category, 1, rowIndex)}
      </tr>
    `;
    })
    .join("");

  return `
    <tr class="section-row">
      <td colspan="3">${sectionName}</td>
    </tr>
    ${rows}
  `;
}

function renderScoreboard() {
  els.scoreboardBody.innerHTML = `${renderCategoryRows("Upper section", "upper")}${renderCategoryRows("Lower section", "lower")}`;

  const totals = state.players.map(getPlayerTotals);
  els.scoreboardFooter.innerHTML = `
    <tr class="totals-row">
      <td>Upper subtotal</td>
      <td>${totals[0].upperSubtotal}</td>
      <td>${totals[1].upperSubtotal}</td>
    </tr>
    <tr class="totals-row">
      <td>Upper bonus</td>
      <td>${totals[0].bonus}</td>
      <td>${totals[1].bonus}</td>
    </tr>
    <tr class="totals-row">
      <td>Lower subtotal</td>
      <td>${totals[0].lowerSubtotal}</td>
      <td>${totals[1].lowerSubtotal}</td>
    </tr>
    <tr class="totals-row">
      <td>Yahtzee bonus</td>
      <td>${totals[0].yahtzeeBonusScore}</td>
      <td>${totals[1].yahtzeeBonusScore}</td>
    </tr>
    <tr class="totals-row">
      <td>Grand total</td>
      <td>${totals[0].grandTotal}</td>
      <td>${totals[1].grandTotal}</td>
    </tr>
    ${isGameOver() ? `
    <tr class="winner-row">
      <td colspan="3">${getWinnerSummary().footer}</td>
    </tr>` : ""}
  `;
}

function renderStatus() {
  const totals = state.players.map(getPlayerTotals);
  const ownedSeat = isOnlineMode() ? session.playerIndex : null;
  const turnSeat = state.currentPlayer + 1;
  const online = isOnlineMode();

  updateInputValue(els.playerOneInput, state.players[0].name);
  updateInputValue(els.playerTwoInput, state.players[1].name);
  els.playerOneHeading.textContent = `${state.players[0].name} (${totals[0].grandTotal})`;
  els.playerTwoHeading.textContent = `${state.players[1].name} (${totals[1].grandTotal})`;
  els.playerOneTotal.textContent = String(totals[0].grandTotal);
  els.playerTwoTotal.textContent = String(totals[1].grandTotal);
  els.playerOneChip.classList.toggle("is-active", state.currentPlayer === 0);
  els.playerTwoChip.classList.toggle("is-active", state.currentPlayer === 1);
  els.playerOneChip.classList.toggle("is-owned", ownedSeat === 0);
  els.playerTwoChip.classList.toggle("is-owned", ownedSeat === 1);
  els.playerOneSeatTag.hidden = ownedSeat !== 0;
  els.playerTwoSeatTag.hidden = ownedSeat !== 1;

  els.playerOneInput.disabled = online;
  els.playerTwoInput.disabled = online;
  els.newGameButton.disabled = online ? !(session.phase === "active" || session.phase === "completed") : false;
  els.rollButton.disabled = state.rollsLeft === 0 || isGameOver() || !canCurrentClientAct();
  els.rollButton.textContent = `Roll (${isGameOver() ? 0 : state.rollsLeft})`;

  if (online) {
    let bannerText = "";
    if (session.role === "player1" || session.role === "player2") {
      bannerText = `You are ${state.players[session.playerIndex].name} at table ${session.currentGameId}. Turn: Player ${turnSeat}.`;
    } else {
      bannerText = session.reconnecting ? "Trying to reconnect to the live lobby..." : (session.notice || "Connecting to the live lobby...");
    }

    els.sessionBanner.hidden = false;
    els.sessionBanner.textContent = bannerText;
  } else {
    els.sessionBanner.hidden = true;
    els.sessionBanner.textContent = "";
  }

  renderNotice();

  if (isGameOver()) {
    const winnerSummary = getWinnerSummary();
    els.winnerBanner.hidden = false;
    els.winnerBanner.classList.add("is-live");
    els.winnerBanner.classList.toggle("is-tie", winnerSummary.isTie);
    els.winnerConfetti.textContent = winnerSummary.isTie ? "✨ 🤝 ✨" : "🎉 🏆 🎉";
    els.winnerTitle.textContent = winnerSummary.title;
    els.winnerCopy.textContent = winnerSummary.copy;
  } else {
    els.winnerBanner.hidden = true;
    els.winnerBanner.classList.remove("is-live");
    els.winnerBanner.classList.remove("is-tie");
    els.winnerConfetti.textContent = "🎉 ✨ 🎉";
    els.winnerTitle.textContent = "Winner";
    els.winnerCopy.textContent = "";
  }
}

function render() {
  renderLobby();
  renderStatus();
  renderDice();
  renderScoreboard();
  saveState();
}

function randomDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function advanceTurnLocal() {
  state.currentPlayer = state.currentPlayer === 0 ? 1 : 0;
  state.dice = [1, 1, 1, 1, 1];
  state.held = [false, false, false, false, false];
  state.rollsLeft = 3;
  state.turnStarted = false;
}

function rollDiceLocal() {
  if (state.rollsLeft === 0 || isGameOver()) {
    return;
  }

  state.dice = state.dice.map((value, index) => (state.held[index] ? value : randomDie()));
  state.rollsLeft -= 1;
  state.turnStarted = true;
  render();
}

function toggleHoldLocal(index) {
  if (!state.turnStarted || state.rollsLeft === 3 || isGameOver()) {
    return;
  }

  state.held[index] = !state.held[index];
  render();
}

function takeScoreLocal(categoryKey) {
  if (isGameOver() || !state.turnStarted) {
    return;
  }

  const player = getCurrentPlayer();
  if (categoryKey in player.scores || !getOpenCategories(player, state.dice).some((category) => category.key === categoryKey)) {
    return;
  }

  if (isBonusYahtzeeEligible(player, state.dice)) {
    player.yahtzeeBonus += 1;
  }

  player.scores[categoryKey] = scoreCategory(categoryKey, state.dice, player);
  advanceTurnLocal();
  render();
}

function updatePlayerNameLocal(playerIndex, value) {
  const nextName = value.trim() || `Player ${playerIndex + 1}`;
  state.players[playerIndex].name = nextName.slice(0, 24);
  render();
}

function resetGameLocal() {
  if (!window.confirm("Start a new game and clear the scorecard?")) {
    return;
  }

  state = createNewState(state.players.map((player) => player.name));
  render();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed: ${response.status}`);
    error.payload = payload;
    throw error;
  }

  return payload;
}

function applyOnlineSnapshot(snapshot) {
  session.mode = "online";
  session.role = snapshot.role;
  session.playerIndex = snapshot.playerIndex;
  session.phase = snapshot.lobby?.phase || "lobby";
  session.notice = snapshot.lobby?.message || "";
  session.reconnecting = false;
  session.waitingGames = snapshot.lobby?.waitingGames || [];
  session.currentGameId = snapshot.game?.id || snapshot.lobby?.currentGameId || null;
  if (typeof snapshot.profileName === "string") {
    session.profileName = snapshot.profileName.slice(0, 24);
    saveProfileName(session.profileName);
  }
  state = normalizeState(snapshot.state);
  render();
}

function startSessionPolling() {
  if (session.pollHandle) {
    return;
  }

  session.pollHandle = window.setInterval(() => {
    syncOnlineState().catch(() => {
      session.reconnecting = true;
      session.notice = "Trying to reconnect to the live lobby...";
      render();
    });
  }, SESSION_POLL_MS);
}

async function syncOnlineState() {
  const snapshot = await fetchJson(`/api/session?clientId=${encodeURIComponent(session.clientId)}`);
  applyOnlineSnapshot(snapshot);
}

async function submitProfileUpdate() {
  if (!isOnlineMode()) {
    return;
  }

  try {
    const snapshot = await fetchJson("/api/profile", {
      method: "POST",
      body: JSON.stringify({ clientId: session.clientId, name: session.profileName }),
    });
    applyOnlineSnapshot(snapshot);
  } catch (error) {
    session.notice = error.message || "Could not update your name.";
    render();
  }
}

async function createOnlineGame() {
  try {
    const snapshot = await fetchJson("/api/lobby/create", {
      method: "POST",
      body: JSON.stringify({ clientId: session.clientId, name: session.profileName }),
    });
    applyOnlineSnapshot(snapshot);
  } catch (error) {
    if (error.payload?.snapshot) {
      applyOnlineSnapshot(error.payload.snapshot);
    } else {
      session.notice = error.message || "Could not open a table.";
      render();
    }
  }
}

async function joinOnlineGame(gameId) {
  try {
    const snapshot = await fetchJson("/api/lobby/join", {
      method: "POST",
      body: JSON.stringify({ clientId: session.clientId, gameId, name: session.profileName }),
    });
    applyOnlineSnapshot(snapshot);
  } catch (error) {
    if (error.payload?.snapshot) {
      applyOnlineSnapshot(error.payload.snapshot);
    } else {
      session.notice = error.message || "Could not join that table.";
      render();
    }
  }
}

async function leaveOnlineGame() {
  try {
    const snapshot = await fetchJson("/api/lobby/leave", {
      method: "POST",
      body: JSON.stringify({ clientId: session.clientId }),
    });
    applyOnlineSnapshot(snapshot);
  } catch (error) {
    session.notice = error.message || "Could not leave the table.";
    render();
  }
}

async function submitOnlineAction(type, payload = {}) {
  try {
    const snapshot = await fetchJson("/api/action", {
      method: "POST",
      body: JSON.stringify({ clientId: session.clientId, type, ...payload }),
    });
    applyOnlineSnapshot(snapshot);
  } catch (error) {
    if (error.payload?.snapshot) {
      applyOnlineSnapshot(error.payload.snapshot);
    } else {
      session.notice = error.message || "Online action failed.";
      render();
    }
  }
}

async function tryEnableOnlineMode() {
  try {
    const snapshot = await fetchJson(`/api/session?clientId=${encodeURIComponent(session.clientId)}`);
    applyOnlineSnapshot(snapshot);
    startSessionPolling();
  } catch {
    session.mode = "offline";
    session.role = null;
    session.playerIndex = null;
    session.phase = "offline";
    session.notice = "";
    session.waitingGames = [];
    session.currentGameId = null;
    render();
  }
}

els.rollButton.addEventListener("click", () => {
  if (isOnlineMode()) {
    submitOnlineAction("roll");
    return;
  }

  rollDiceLocal();
});

els.newGameButton.addEventListener("click", () => {
  if (isOnlineMode()) {
    submitOnlineAction("newGame");
    return;
  }

  resetGameLocal();
});

els.createGameButton.addEventListener("click", () => {
  if (session.profileName.trim()) {
    createOnlineGame();
  }
});

els.leaveGameButton.addEventListener("click", () => {
  leaveOnlineGame();
});

els.displayNameInput.addEventListener("input", (event) => {
  session.profileName = String(event.target.value || "").slice(0, 24);
  saveProfileName(session.profileName);
  render();
});

els.displayNameInput.addEventListener("change", () => {
  submitProfileUpdate();
});

els.displayNameInput.addEventListener("blur", () => {
  submitProfileUpdate();
});

els.playerOneInput.addEventListener("change", (event) => {
  if (!isOnlineMode()) {
    updatePlayerNameLocal(0, event.target.value);
  }
});

els.playerTwoInput.addEventListener("change", (event) => {
  if (!isOnlineMode()) {
    updatePlayerNameLocal(1, event.target.value);
  }
});

els.playerOneInput.addEventListener("blur", (event) => {
  if (!isOnlineMode()) {
    updatePlayerNameLocal(0, event.target.value);
  }
});

els.playerTwoInput.addEventListener("blur", (event) => {
  if (!isOnlineMode()) {
    updatePlayerNameLocal(1, event.target.value);
  }
});

els.queueList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-join-game]");
  if (!button || button.disabled) {
    return;
  }

  joinOnlineGame(button.dataset.joinGame);
});

els.diceGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".die");
  if (!button) {
    return;
  }

  const index = Number(button.dataset.index);
  if (isOnlineMode()) {
    submitOnlineAction("toggleHold", { index });
    return;
  }

  toggleHoldLocal(index);
});

els.scoreboardBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-score-category]");
  if (!button) {
    return;
  }

  if (isOnlineMode()) {
    submitOnlineAction("takeScore", { categoryKey: button.dataset.scoreCategory });
    return;
  }

  takeScoreLocal(button.dataset.scoreCategory);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=26").then((registration) => {
      registration.update();
    }).catch(() => {
      // Service worker registration failure does not block gameplay.
    });
  });
}

render();
window.addEventListener("load", () => {
  tryEnableOnlineMode();
});

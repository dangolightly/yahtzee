const STORAGE_KEY = "yahtzee-state-v2";
const CLIENT_ID_KEY = "yahtzee-client-id-v2";
const PROFILE_NAME_KEY = "yahtzee-profile-name-v1";
const CHALLENGER_LIST_OPEN_KEY = "yahtzee-challenger-open-v1";
const TUTORIAL_DONE_KEY = "yahtzee-tutorial-done-v1";
const FUN_CONFIG_URL = "./yahtzee-fun-config.json";
const SESSION_POLL_MS = 4000;
const FUN_CONFIG_REFRESH_MS = 10_000;

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
  appShell: document.querySelector(".app-shell"),
  playerOneInput: document.querySelector("#player-one-input"),
  playerTwoInput: document.querySelector("#player-two-input"),
  playerOneChip: document.querySelector("#player-one-chip"),
  playerTwoChip: document.querySelector("#player-two-chip"),
  playerOneTotal: document.querySelector("#player-one-total"),
  playerTwoTotal: document.querySelector("#player-two-total"),
  playerOneHeading: document.querySelector("#player-one-heading"),
  playerTwoHeading: document.querySelector("#player-two-heading"),
  newGameButton: document.querySelector("#new-game-button"),
  rollButton: document.querySelector("#roll-button"),
  lobbyPanel: document.querySelector("#lobby-panel"),
  lobbyCopy: document.querySelector("#lobby-copy"),
  queueSection: document.querySelector("#queue-section"),
  queueList: document.querySelector("#queue-list"),
  funFlash: document.querySelector("#fun-flash"),
  funFlashText: document.querySelector("#fun-flash-text"),
  tutorialOverlay: document.querySelector("#tutorial-overlay"),
  tutorialBubble: document.querySelector("#tutorial-bubble"),
  tutorialStep: document.querySelector("#tutorial-step"),
  tutorialTitle: document.querySelector("#tutorial-title"),
  tutorialText: document.querySelector("#tutorial-text"),
  tutorialNext: document.querySelector("#tutorial-next"),
  tutorialSkip: document.querySelector("#tutorial-skip"),
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

function readLocalValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local storage is best-effort only.
  }
}

function saveState() {
  if (session.mode === "offline") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function readSessionValue(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Session storage is best-effort for per-window identity.
  }
}

function getOrCreateClientId() {
  const existing = readSessionValue(CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  writeSessionValue(CLIENT_ID_KEY, nextId);
  return nextId;
}

function loadProfileName() {
  return String(readSessionValue(PROFILE_NAME_KEY) || "").slice(0, 24);
}

function saveProfileName(name) {
  writeSessionValue(PROFILE_NAME_KEY, String(name || "").slice(0, 24));
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
  showChallengerList: readSessionValue(CHALLENGER_LIST_OPEN_KEY) === "1",
  disconnectSent: false,
  newGamePending: false,
  newGamePendingLabel: "",
};

const tutorialSteps = [
  {
    title: "Enter your name",
    text: "Type your name in Player 1.",
    target: () => els.playerOneChip,
  },
  {
    title: "Start a new game",
    text: "Tap New Game to open the Challenger List.",
    target: () => els.newGameButton,
  },
];

const tutorial = {
  dismissed: readLocalValue(TUTORIAL_DONE_KEY) === "1",
  active: false,
  stepIndex: 0,
};

const funMode = {
  config: null,
};

let completedResetHandle = null;
let completedResetPending = false;
let highlightedTutorialTarget = null;
let funFlashHandle = null;
let funConfigRefreshHandle = null;

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

function hasAcceptedName() {
  return isOnlineMode() && ["waiting", "active", "completed"].includes(session.phase);
}

function setChallengerListOpen(isOpen) {
  session.showChallengerList = Boolean(isOpen);
  writeSessionValue(CHALLENGER_LIST_OPEN_KEY, session.showChallengerList ? "1" : "0");
}

function isTutorialEligible() {
  return !tutorial.dismissed && isOnlineMode() && session.phase !== "active" && session.phase !== "completed";
}

function isDefaultWinActive() {
  return isOnlineMode() && session.phase === "completed" && !isGameOver();
}

function isOnlineCompletedState() {
  return isOnlineMode() && session.phase === "completed";
}

function clearCompletedResetTimer() {
  if (!completedResetHandle) {
    return;
  }

  window.clearTimeout(completedResetHandle);
  completedResetHandle = null;
}

function sendDisconnectSignal() {
  if (!isOnlineMode() || session.disconnectSent || !["waiting", "active"].includes(session.phase)) {
    return;
  }

  const payload = JSON.stringify({ clientId: session.clientId });
  session.disconnectSent = true;

  if (navigator.sendBeacon) {
    const body = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/session/disconnect", body);
    return;
  }

  fetch("/api/session/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Best-effort only during unload.
  });
}

function renderNotice() {
  const messages = [];

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
  const showLobby = isOnlineMode() && session.phase !== "active" && session.phase !== "completed";
  if (!showLobby) {
    els.lobbyPanel.hidden = true;
    els.queueSection.hidden = true;
    els.queueList.innerHTML = "";
    return;
  }

  els.lobbyPanel.hidden = false;
  const accepted = hasAcceptedName();
  const showingChallengerList = accepted && session.showChallengerList;
  els.queueSection.hidden = !showingChallengerList;

  if (!accepted) {
    els.lobbyCopy.textContent = session.notice || (session.reconnecting ? "Trying to reconnect..." : "");
    els.lobbyCopy.hidden = !els.lobbyCopy.textContent;
    els.queueList.innerHTML = "";
    return;
  }

  if (!showingChallengerList) {
    els.lobbyCopy.textContent = session.notice || (session.reconnecting
      ? "Trying to reconnect..."
      : "Tap New Game to open the Challenger List.");
    els.lobbyCopy.hidden = false;
    els.queueList.innerHTML = "";
    return;
  }

  if (session.waitingGames.length === 0) {
    els.lobbyCopy.textContent = session.notice
      || (session.reconnecting ? "Trying to reconnect..." : "Waiting for challengers. This list updates automatically.");
    els.lobbyCopy.hidden = false;
    els.queueList.innerHTML = '<p class="queue-empty">No challengers available yet. Waiting for one to appear...</p>';
    return;
  }

  els.lobbyCopy.textContent = session.notice
    || (session.reconnecting ? "Trying to reconnect..." : "Choose a challenger below.");
  els.lobbyCopy.hidden = false;

  els.queueList.innerHTML = session.waitingGames.map((game, index) => `
    <button class="queue-card" type="button" data-join-game="${game.id}">
      <div>
        <strong>${index + 1}. ${game.hostName}</strong>
        <span>Tap to accept this challenger.</span>
      </div>
    </button>
  `).join("");
}

function renderDice() {
  els.diceGrid.innerHTML = "";
  state.dice.forEach((value, index) => {
    const fragment = els.dieTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".die");
    const valueEl = fragment.querySelector(".die-value");
    const isOpenDie = !state.turnStarted;
    button.dataset.index = String(index);
    button.disabled = !state.turnStarted || state.rollsLeft === 3 || isGameOver() || !canCurrentClientAct();
    button.classList.toggle("is-held", state.held[index]);
    button.classList.toggle("is-open", isOpenDie);
    button.setAttribute("aria-pressed", state.held[index] ? "true" : "false");
    valueEl.textContent = isOpenDie ? "-" : String(value);
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

  const staggerClass = rowIndex % 2 === 0 ? "stagger-right" : "stagger-left";
  const buttonLabel = "Choose";
  const buttonClass = "score-button is-active";
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
  const ownedSeat = isOnlineMode() && session.phase === "active" ? session.playerIndex : null;
  const online = isOnlineMode();
  const accepted = hasAcceptedName();
  const isOnboardingFocus = online && !accepted;
  const isWaitingFocus = online && accepted && session.phase === "waiting";
  const isGuidedFocus = isOnboardingFocus || isWaitingFocus;
  const isActiveTurnMode = online && session.phase === "active";
  const nameReady = session.profileName.trim().length > 0;
  const rollsLeft = isGameOver() ? 0 : state.rollsLeft;
  const isOnlineActiveTurn = online && session.phase === "active" && ownedSeat !== null;
  const isMyTurn = isOnlineActiveTurn && ownedSeat === state.currentPlayer;
  const isDefaultCompleted = isDefaultWinActive();
  const isOnlineCompleted = isOnlineCompletedState();
  const playerOneLabel = online && !accepted ? session.profileName : state.players[0].name;
  const playerTwoLabel = online && !accepted ? "" : state.players[1].name;

  updateInputValue(els.playerOneInput, playerOneLabel);
  updateInputValue(els.playerTwoInput, playerTwoLabel);
  els.playerOneHeading.textContent = `${state.players[0].name} (${totals[0].grandTotal})`;
  els.playerTwoHeading.textContent = `${state.players[1].name} (${totals[1].grandTotal})`;
  els.playerOneTotal.textContent = String(totals[0].grandTotal);
  els.playerTwoTotal.textContent = String(totals[1].grandTotal);
  els.playerOneChip.classList.toggle("is-active", isActiveTurnMode ? false : state.currentPlayer === 0);
  els.playerTwoChip.classList.toggle("is-active", isActiveTurnMode ? false : state.currentPlayer === 1);
  els.playerOneChip.classList.toggle("is-owned", isActiveTurnMode ? false : ownedSeat === 0);
  els.playerTwoChip.classList.toggle("is-owned", isActiveTurnMode ? false : ownedSeat === 1);
  els.playerOneChip.classList.toggle("is-turn-ring", isActiveTurnMode && state.currentPlayer === 0);
  els.playerTwoChip.classList.toggle("is-turn-ring", isActiveTurnMode && state.currentPlayer === 1);
  els.playerOneChip.classList.toggle("is-awaiting-name", online && (!accepted || session.phase === "waiting"));
  els.playerOneChip.classList.toggle("is-dimmed", false);
  els.playerTwoChip.classList.toggle("is-dimmed", false);

  if (els.appShell) {
    els.appShell.classList.toggle("is-onboarding-focus", isOnboardingFocus);
    els.appShell.classList.toggle("is-waiting-focus", isWaitingFocus);
  }

  els.playerOneInput.placeholder = isOnboardingFocus ? "Enter name, hit New Game" : "";
  els.playerTwoInput.placeholder = "";
  els.playerOneInput.disabled = online && accepted;
  els.playerTwoInput.disabled = online;
  els.newGameButton.textContent = session.newGamePending ? (session.newGamePendingLabel || "Working...") : (online ? "New Game" : "New");
  els.newGameButton.disabled = online ? (session.newGamePending || (!accepted && !nameReady)) : false;
  els.newGameButton.classList.toggle("is-onboarding-primary", isGuidedFocus);
  els.newGameButton.classList.toggle("is-new-game-ready", online && !accepted && nameReady && !session.newGamePending);
  els.rollButton.disabled = state.rollsLeft === 0 || isGameOver() || !canCurrentClientAct();
  els.rollButton.classList.toggle("is-your-turn", isMyTurn);
  els.rollButton.classList.toggle("is-their-turn", isOnlineActiveTurn && !isMyTurn);
  els.rollButton.textContent = (isGameOver() || isOnlineCompleted)
    ? "Game Over"
    : isOnlineActiveTurn
    ? `${isMyTurn ? "Your" : "Their"} Roll (${rollsLeft})`
    : `Roll (${rollsLeft})`;

  els.sessionBanner.hidden = true;
  els.sessionBanner.textContent = "";

  renderNotice();

  if (isGameOver() || isOnlineCompleted) {
    const winnerSummary = isGameOver() ? getWinnerSummary() : {
      isTie: false,
      title: "Default Win",
      copy: `${session.notice || "Your opponent left the game."} Resetting in 30 seconds. Tap anywhere to continue now.`,
    };
    const winnerCopy = isOnlineCompleted && !isDefaultCompleted
      ? `${winnerSummary.copy} Resetting in 30 seconds. Tap anywhere to continue now.`
      : winnerSummary.copy;
    els.winnerBanner.hidden = false;
    els.winnerBanner.classList.add("is-live");
    els.winnerBanner.classList.toggle("is-resettable", isOnlineCompleted);
    els.winnerBanner.classList.toggle("is-tie", winnerSummary.isTie);
    els.winnerConfetti.textContent = winnerSummary.isTie ? "✨ 🤝 ✨" : "🎉 🏆 🎉";
    els.winnerTitle.textContent = winnerSummary.title;
    els.winnerCopy.textContent = winnerCopy;
    if (isOnlineCompleted && !completedResetHandle) {
      completedResetHandle = window.setTimeout(() => {
        completedResetHandle = null;
        resetCompletedOnlineState();
      }, 30_000);
    }
  } else {
    clearCompletedResetTimer();
    els.winnerBanner.hidden = true;
    els.winnerBanner.classList.remove("is-live");
    els.winnerBanner.classList.remove("is-resettable");
    els.winnerBanner.classList.remove("is-tie");
    els.winnerConfetti.textContent = "🎉 ✨ 🎉";
    els.winnerTitle.textContent = "Winner";
    els.winnerCopy.textContent = "";
  }
}

function isConfigEnabled(value, defaultValue = true) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  return !["off", "false", "0", "disabled", "no"].includes(normalized);
}

function getScoreFunConfig(categoryKey) {
  const raw = funMode.config?.scores?.[categoryKey];
  if (Array.isArray(raw)) {
    return { enabled: true, choices: raw };
  }

  if (raw && typeof raw === "object") {
    return {
      enabled: isConfigEnabled(raw.enabled, true),
      choices: Array.isArray(raw.choices) ? raw.choices : [],
    };
  }

  return { enabled: false, choices: [] };
}

function clearFunFlash() {
  if (funFlashHandle) {
    window.clearTimeout(funFlashHandle);
    funFlashHandle = null;
  }

  if (!els.funFlash) {
    return;
  }

  els.funFlash.hidden = true;
  els.funFlash.className = "fun-flash";
}

function triggerFunMoment(categoryKey) {
  if (!funMode.config || !els.funFlash || !isConfigEnabled(funMode.config?.enabled, true)) {
    return;
  }

  const scoreConfig = getScoreFunConfig(categoryKey);
  if (!scoreConfig.enabled) {
    return;
  }

  const choices = scoreConfig.choices.filter((choice) => isConfigEnabled(choice?.enabled, true));
  if (!choices.length) {
    return;
  }

  const choice = choices[Math.floor(Math.random() * choices.length)];
  const line = String(choice?.text || "").trim();
  if (!line) {
    return;
  }

  if (els.funFlashText) {
    els.funFlashText.textContent = line;
  }

  els.funFlash.hidden = false;
  els.funFlash.className = "fun-flash is-visible";

  if (funFlashHandle) {
    window.clearTimeout(funFlashHandle);
  }
  funFlashHandle = window.setTimeout(() => {
    clearFunFlash();
  }, 5000);
}

async function loadFunConfig() {
  try {
    const response = await fetch(FUN_CONFIG_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Fun config not available");
    }

    const payload = await response.json();
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid fun config");
    }

    funMode.config = payload;
  } catch {
    funMode.config = {
      enabled: false,
      scores: {},
    };
  }

  if (!isConfigEnabled(funMode.config?.enabled, true)) {
    clearFunFlash();
  }
}

function startFunConfigRefresh() {
  if (funConfigRefreshHandle) {
    return;
  }

  funConfigRefreshHandle = window.setInterval(() => {
    loadFunConfig();
  }, FUN_CONFIG_REFRESH_MS);
}

function clearTutorialHighlight() {
  if (!highlightedTutorialTarget) {
    return;
  }

  highlightedTutorialTarget.classList.remove("is-tutorial-focus");
  highlightedTutorialTarget = null;
}

function setTutorialHighlight(target) {
  if (highlightedTutorialTarget === target) {
    return;
  }

  clearTutorialHighlight();
  if (!target) {
    return;
  }

  target.classList.add("is-tutorial-focus");
  highlightedTutorialTarget = target;
}

function positionTutorialBubble(target) {
  if (!target || els.tutorialOverlay.hidden) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const bubbleRect = els.tutorialBubble.getBoundingClientRect();
  const spacing = 14;
  const viewportPadding = 10;
  const preferAbove = rect.bottom > window.innerHeight * 0.58;
  const topStart = preferAbove ? rect.top - bubbleRect.height - spacing : rect.bottom + spacing;
  const leftStart = rect.left + rect.width / 2 - bubbleRect.width / 2;
  const top = Math.max(viewportPadding, Math.min(topStart, window.innerHeight - bubbleRect.height - viewportPadding));
  const left = Math.max(viewportPadding, Math.min(leftStart, window.innerWidth - bubbleRect.width - viewportPadding));

  els.tutorialBubble.style.top = `${Math.round(top)}px`;
  els.tutorialBubble.style.left = `${Math.round(left)}px`;
  els.tutorialBubble.dataset.placement = preferAbove ? "top" : "bottom";
}

function dismissTutorial() {
  tutorial.dismissed = true;
  tutorial.active = false;
  tutorial.stepIndex = 0;
  writeLocalValue(TUTORIAL_DONE_KEY, "1");
}

function advanceTutorial() {
  if (!tutorial.active) {
    return;
  }

  if (tutorial.stepIndex >= tutorialSteps.length - 1) {
    dismissTutorial();
    render();
    return;
  }

  tutorial.stepIndex += 1;
  render();
}

function renderTutorial() {
  if (!isTutorialEligible()) {
    tutorial.active = false;
    tutorial.stepIndex = 0;
    els.tutorialOverlay.hidden = true;
    clearTutorialHighlight();
    return;
  }

  if (!tutorial.active) {
    tutorial.active = true;
    tutorial.stepIndex = 0;
  }

  if (tutorial.stepIndex === 0 && hasAcceptedName()) {
    tutorial.stepIndex = 1;
  }

  const step = tutorialSteps[tutorial.stepIndex] || tutorialSteps[0];
  const target = step.target();

  els.tutorialOverlay.hidden = false;
  els.tutorialStep.textContent = `Tip ${tutorial.stepIndex + 1} of ${tutorialSteps.length}`;
  els.tutorialTitle.textContent = step.title;
  els.tutorialText.textContent = step.text;
  els.tutorialNext.textContent = tutorial.stepIndex === tutorialSteps.length - 1 ? "Done" : "Next";
  setTutorialHighlight(target);

  window.requestAnimationFrame(() => {
    positionTutorialBubble(target);
  });
}

function render() {
  renderLobby();
  renderStatus();
  renderTutorial();
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

  triggerFunMoment(categoryKey);
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
  session.notice = session.phase === "completed" ? (snapshot.lobby?.message || "") : "";
  session.reconnecting = false;
  session.disconnectSent = false;
  session.waitingGames = snapshot.lobby?.waitingGames || [];
  session.currentGameId = snapshot.game?.id || snapshot.lobby?.currentGameId || null;
  if (["lobby", "active", "completed"].includes(session.phase)) {
    setChallengerListOpen(false);
  }
  if (typeof snapshot.profileName === "string") {
    const nextProfileName = snapshot.profileName.trim() ? snapshot.profileName.slice(0, 24) : session.profileName;
    session.profileName = nextProfileName;
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
    return false;
  }

  if (!session.profileName.trim() && !hasAcceptedName()) {
    render();
    return false;
  }

  try {
    const snapshot = await fetchJson("/api/profile", {
      method: "POST",
      body: JSON.stringify({ clientId: session.clientId, name: session.profileName }),
    });
    applyOnlineSnapshot(snapshot);
    return true;
  } catch (error) {
    if (error.payload?.snapshot) {
      applyOnlineSnapshot(error.payload.snapshot);
      session.notice = error.message || "Could not update your name.";
      render();
    } else {
      session.notice = error.message || "Could not update your name.";
      render();
    }
    return false;
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
      session.notice = error.message || "Could not challenge that player.";
      render();
    } else {
      session.notice = error.message || "Could not challenge that player.";
      render();
    }
  }
}

async function submitOnlineAction(type, payload = {}, options = {}) {
  try {
    const snapshot = await fetchJson("/api/action", {
      method: "POST",
      body: JSON.stringify({ clientId: session.clientId, type, ...payload }),
    });
    applyOnlineSnapshot(snapshot);
    if (typeof options.onSuccess === "function") {
      try {
        options.onSuccess();
      } catch {
        // Presentation-only callback; ignore failures.
      }
    }
    return true;
  } catch (error) {
    if (error.payload?.snapshot) {
      applyOnlineSnapshot(error.payload.snapshot);
    } else {
      session.notice = error.message || "Online action failed.";
      render();
    }
    return false;
  }
}

async function handleOnlineNewGameClick() {
  if (!isOnlineMode() || session.newGamePending) {
    return;
  }

  const accepted = hasAcceptedName();
  const trimmedName = session.profileName.trim();

  if (!accepted) {
    if (!trimmedName) {
      session.notice = "Enter your name first.";
      render();
      els.playerOneInput.focus();
      return;
    }

    session.newGamePending = true;
    session.newGamePendingLabel = "Opening...";
    session.notice = "";
    render();
    const profileAccepted = await submitProfileUpdate();
    session.newGamePending = false;
    session.newGamePendingLabel = "";
    if (profileAccepted && hasAcceptedName()) {
      setChallengerListOpen(true);
    }
    render();
    return;
  }

  if (session.phase === "active" || session.phase === "completed") {
    if (!window.confirm("Start a new game now? This will abandon the current game and give your challenger a default win.")) {
      return;
    }

    session.newGamePending = true;
    session.newGamePendingLabel = "Abandoning...";
    render();
    await submitOnlineAction("newGame");
    session.newGamePending = false;
    session.newGamePendingLabel = "";
    render();
    return;
  }

  setChallengerListOpen(true);
  session.notice = "";
  render();
}

async function resetCompletedOnlineState() {
  if (!isOnlineCompletedState() || completedResetPending) {
    return;
  }

  clearCompletedResetTimer();
  completedResetPending = true;

  try {
    const snapshot = await fetchJson("/api/lobby/leave", {
      method: "POST",
      body: JSON.stringify({ clientId: session.clientId }),
    });
    applyOnlineSnapshot(snapshot);
  } catch (error) {
    if (error.payload?.snapshot) {
      applyOnlineSnapshot(error.payload.snapshot);
      session.notice = error.message || "Could not reset the completed game.";
    } else {
      session.notice = error.message || "Could not reset the completed game.";
    }
    render();
  } finally {
    completedResetPending = false;
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
    session.disconnectSent = false;
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
    handleOnlineNewGameClick();
    return;
  }

  resetGameLocal();
});

els.playerOneInput.addEventListener("change", (event) => {
  if (isOnlineMode()) {
    if (!hasAcceptedName()) {
      session.profileName = String(event.target.value || "").slice(0, 24);
      saveProfileName(session.profileName);
      session.notice = "";
      render();
    }
    return;
  }

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
  if (isOnlineMode()) {
    if (!hasAcceptedName()) {
      session.profileName = String(event.target.value || "").slice(0, 24);
      saveProfileName(session.profileName);
      session.notice = "";
      render();
    }
    return;
  }

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
    const categoryKey = button.dataset.scoreCategory;
    submitOnlineAction("takeScore", { categoryKey }, {
      onSuccess: () => {
        triggerFunMoment(categoryKey);
      },
    });
    return;
  }

  takeScoreLocal(button.dataset.scoreCategory);
});

els.tutorialNext.addEventListener("click", (event) => {
  event.preventDefault();
  advanceTutorial();
});

els.tutorialSkip.addEventListener("click", (event) => {
  event.preventDefault();
  dismissTutorial();
  render();
});

window.addEventListener("resize", () => {
  if (!tutorial.active) {
    return;
  }

  const step = tutorialSteps[tutorial.stepIndex];
  if (!step) {
    return;
  }

  positionTutorialBubble(step.target());
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=59").then((registration) => {
      registration.update();
    }).catch(() => {
      // Service worker registration failure does not block gameplay.
    });
  });
}

window.addEventListener("beforeunload", () => {
  sendDisconnectSignal();
});

window.addEventListener("pagehide", (event) => {
  if (event.persisted) {
    return;
  }

  sendDisconnectSignal();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    loadFunConfig();
  }

  if (document.visibilityState === "hidden") {
    sendDisconnectSignal();
  }
});

document.addEventListener("pointerdown", () => {
  if (!isOnlineCompletedState()) {
    return;
  }

  resetCompletedOnlineState();
});

els.playerOneInput.addEventListener("input", (event) => {
  if (!isOnlineMode() || hasAcceptedName()) {
    return;
  }

  session.profileName = String(event.target.value || "").slice(0, 24);
  saveProfileName(session.profileName);
  session.notice = "";
  render();
});

els.playerOneInput.addEventListener("keydown", (event) => {
  if (!isOnlineMode() || hasAcceptedName() || event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  handleOnlineNewGameClick();
});

render();
window.addEventListener("load", () => {
  loadFunConfig();
  startFunConfigRefresh();
  tryEnableOnlineMode();
});

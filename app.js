const STORAGE_KEY = "yahtzee-state-v2";

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
  playerOneTotal: document.querySelector("#player-one-total"),
  playerTwoTotal: document.querySelector("#player-two-total"),
  playerOneHeading: document.querySelector("#player-one-heading"),
  playerTwoHeading: document.querySelector("#player-two-heading"),
  newGameButton: document.querySelector("#new-game-button"),
  rollButton: document.querySelector("#roll-button"),
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

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createNewState();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.players) || parsed.players.length !== 2) {
      return createNewState();
    }

    return {
      ...createNewState(),
      ...parsed,
      players: parsed.players.map((player, index) => ({
        name: String(player.name || `Player ${index + 1}`).slice(0, 24),
        scores: typeof player.scores === "object" && player.scores ? player.scores : {},
        yahtzeeBonus: Number.isInteger(player.yahtzeeBonus) && player.yahtzeeBonus >= 0 ? player.yahtzeeBonus : 0,
      })),
      dice: normalizeDice(parsed.dice),
      held: normalizeHeld(parsed.held),
      rollsLeft: clampRolls(parsed.rollsLeft),
      currentPlayer: parsed.currentPlayer === 1 ? 1 : 0,
      turnStarted: Boolean(parsed.turnStarted),
    };
  } catch {
    return createNewState();
  }
}

let state = loadState();

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  if (dice.length !== 5) {
    return null;
  }

  return dice.every((value) => value === dice[0]) ? dice[0] : null;
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

function getRoundNumber() {
  return Math.min(...state.players.map((player) => getPlayerTotals(player).filled)) + 1;
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

function getWinnerText() {
  return getWinnerSummary().footer;
}

function getAvailableScores() {
  const currentPlayer = getCurrentPlayer();
  return categories
    .filter((category) => getOpenCategories(currentPlayer, state.dice).some((openCategory) => openCategory.key === category.key))
    .map((category) => ({
      ...category,
      score: scoreCategory(category.key, state.dice, currentPlayer),
    }))
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
}

function getHintText() {
  if (isGameOver()) {
    return getWinnerText();
  }

  if (!state.turnStarted) {
    return "Roll to start the turn. Tap dice after the first roll to hold them.";
  }

  const forcedUpperCategory = getForcedUpperCategory(getCurrentPlayer(), state.dice);
  if (forcedUpperCategory) {
    const forcedLabel = categories.find((category) => category.key === forcedUpperCategory)?.label || forcedUpperCategory;
    return `Bonus Yahtzee: rules force this roll into ${forcedLabel}.`;
  }

  const best = getAvailableScores().slice(0, 2);
  return best.map((option) => `${option.label}: ${option.score}`).join("   |   ");
}

function randomDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function renderDice() {
  els.diceGrid.innerHTML = "";
  state.dice.forEach((value, index) => {
    const fragment = els.dieTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".die");
    const valueEl = fragment.querySelector(".die-value");
    button.dataset.index = String(index);
    button.disabled = !state.turnStarted || state.rollsLeft === 3 || isGameOver();
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

  const canScore = playerIndex === state.currentPlayer && state.turnStarted && !isGameOver() && getOpenCategories(player, state.dice).some((openCategory) => openCategory.key === category.key);
  if (!canScore) {
    return '<td class="score-cell"><span class="score-open">Open</span></td>';
  }

  const preview = scoreCategory(category.key, state.dice, player);
  const staggerClass = rowIndex % 2 === 0 ? "stagger-right" : "stagger-left";
  return `
    <td class="score-cell ${staggerClass}">
      <button class="score-button is-active" type="button" data-score-category="${category.key}">${preview}</button>
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

  els.playerOneInput.value = state.players[0].name;
  els.playerTwoInput.value = state.players[1].name;
  els.playerOneHeading.textContent = `${state.players[0].name} (${totals[0].grandTotal})`;
  els.playerTwoHeading.textContent = `${state.players[1].name} (${totals[1].grandTotal})`;
  els.playerOneTotal.textContent = String(totals[0].grandTotal);
  els.playerTwoTotal.textContent = String(totals[1].grandTotal);
  els.playerOneChip.classList.toggle("is-active", state.currentPlayer === 0);
  els.playerTwoChip.classList.toggle("is-active", state.currentPlayer === 1);
  els.rollButton.disabled = state.rollsLeft === 0 || isGameOver();
  els.rollButton.textContent = `Roll (${isGameOver() ? 0 : state.rollsLeft})`;

  if (isOfflineInstallBlocked) {
    els.installWarning.hidden = false;
    els.installWarning.textContent = "This LAN address is not a secure install origin on iPhone. It can preview the game, but Add to Home Screen will not work offline until the app is hosted on HTTPS.";
  } else {
    els.installWarning.hidden = true;
    els.installWarning.textContent = "";
  }

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
  renderStatus();
  renderDice();
  renderScoreboard();
  saveState();
}

function rollDice() {
  if (state.rollsLeft === 0 || isGameOver()) {
    return;
  }

  state.dice = state.dice.map((value, index) => (state.held[index] ? value : randomDie()));
  state.rollsLeft -= 1;
  state.turnStarted = true;
  render();
}

function toggleHold(index) {
  if (!state.turnStarted || state.rollsLeft === 3 || isGameOver()) {
    return;
  }

  state.held[index] = !state.held[index];
  render();
}

function advanceTurn() {
  state.currentPlayer = state.currentPlayer === 0 ? 1 : 0;
  state.dice = [1, 1, 1, 1, 1];
  state.held = [false, false, false, false, false];
  state.rollsLeft = 3;
  state.turnStarted = false;
}

function takeScore(categoryKey) {
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
  advanceTurn();
  render();
}

function updatePlayerName(playerIndex, value) {
  const nextName = value.trim() || `Player ${playerIndex + 1}`;
  state.players[playerIndex].name = nextName.slice(0, 24);
  render();
}

function resetGame() {
  if (!window.confirm("Start a new game and clear the scorecard?")) {
    return;
  }

  state = createNewState(state.players.map((player) => player.name));
  render();
}

els.rollButton.addEventListener("click", rollDice);
els.newGameButton.addEventListener("click", resetGame);
els.playerOneInput.addEventListener("change", (event) => updatePlayerName(0, event.target.value));
els.playerTwoInput.addEventListener("change", (event) => updatePlayerName(1, event.target.value));
els.playerOneInput.addEventListener("blur", (event) => updatePlayerName(0, event.target.value));
els.playerTwoInput.addEventListener("blur", (event) => updatePlayerName(1, event.target.value));

els.diceGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".die");
  if (!button) {
    return;
  }

  toggleHold(Number(button.dataset.index));
});

els.scoreboardBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-score-category]");
  if (!button) {
    return;
  }

  takeScore(button.dataset.scoreCategory);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=12").then((registration) => {
      registration.update();
    }).catch(() => {
      // Service worker registration failure does not block gameplay.
    });
  });
}

render();

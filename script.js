// Log a message to the console to ensure the script is linked correctly
console.log('JavaScript file is linked correctly.');

const gameGrid = document.querySelector('.game-grid');
const startScreen = document.querySelector('#start-screen');
const startButton = document.querySelector('#start-button');
const gameScreen = document.querySelector('#game-screen');
const gameTitle = document.querySelector('#game-title');
const homeButton = document.querySelector('#home-button');
const difficultyButtons = document.querySelectorAll('.difficulty-button');
const scoreDisplay = document.querySelector('#score-value');
const movesDisplay = document.querySelector('#moves-left');
const gameMessage = document.querySelector('#game-message');
const extraLifeButton = document.querySelector('#extra-life-button');
const restartButton = document.querySelector('#restart-button');
const levelValueDisplay = document.querySelector('#level-value');
const startLevelStatus = document.querySelector('.start-level-status');
const startBucket = document.querySelector('#start-bucket');
const bucketWater = document.querySelector('#bucket-water');
const LEVEL_PROGRESS_KEY = 'water-wash-level-progress';
const POINTS_PER_LEVEL = 200;
const effects = [
	{ symbol: '💧', className: 'water-drop' },
	{ symbol: '♨️', className: 'steam-vapor' },
	{ symbol: '❄️', className: 'ice-crystal' },
];
const levelProgress = loadLevelProgress();
let selectedCell = null;
let movesLeft = 20;
let moveLimit = 20;
let score = 0;
let roundPointsEarned = 0;
let roundPointsSpent = 0;
let gameOver = false;
let matchAnimationTimeout = null;

updateLevelDisplay();

startButton.addEventListener('click', function () {
	movesLeft = moveLimit;
	movesDisplay.textContent = movesLeft;
	updateExtraLifeButton();
	startScreen.hidden = true;
	gameScreen.hidden = false;
	gameTitle.focus();
});

extraLifeButton.addEventListener('click', function () {
	if (score < 10 || (gameOver && gameMessage.classList.contains('win'))) {
		return;
	}

	score -= 10;
	roundPointsSpent += 10;
	movesLeft += 1;
	scoreDisplay.textContent = score;
	movesDisplay.textContent = movesLeft;
	updateExtraLifeButton();

	if (gameOver) {
		gameOver = false;
		gameGrid.classList.remove('game-over');
		gameMessage.textContent = '';
		gameMessage.className = 'game-message';
		restartButton.hidden = true;
	}
});

homeButton.addEventListener('click', function () {
	restartGame();
	gameScreen.hidden = true;
	startScreen.hidden = false;
	startButton.focus();
});

difficultyButtons.forEach(function (button) {
	button.addEventListener('click', function () {
		moveLimit = Number(button.dataset.moves);
		difficultyButtons.forEach(function (difficultyButton) {
			difficultyButton.setAttribute('aria-pressed', difficultyButton === button);
		});
	});
});

function finishMove() {
	movesLeft -= 1;
	movesDisplay.textContent = movesLeft;
	let playerWon = false;

	const remainingYellowCells = gameGrid.querySelectorAll('.grid-cell:not(.matched)').length;
	if (remainingYellowCells === 0) {
		gameMessage.textContent = 'You win!';
		gameMessage.classList.add('win');
		gameOver = true;
		playerWon = true;
	} else if (movesLeft === 0) {
		gameMessage.textContent = 'You ran out of moves!';
		gameMessage.classList.add('fail');
		gameOver = true;
	}

	if (gameOver) {
		gameGrid.classList.add('game-over');
		restartButton.hidden = false;
	}

	updateExtraLifeButton();
	if (playerWon) {
		bankRoundPoints();
	}
}

function updateExtraLifeButton() {
	extraLifeButton.disabled = score < 10 || (gameOver && gameMessage.classList.contains('win'));
}

function loadLevelProgress() {
	const savedProgress = localStorage.getItem(LEVEL_PROGRESS_KEY);
	if (savedProgress === null) {
		return { level: 1, points: 0 };
	}

	let progress;
	try {
		progress = JSON.parse(savedProgress);
	} catch (error) {
		console.warn('Saved level progress was invalid and has been reset.', error);
		localStorage.removeItem(LEVEL_PROGRESS_KEY);
		return { level: 1, points: 0 };
	}

	if (
		!progress
		|| !Number.isInteger(progress.level)
		|| progress.level < 1
		|| !Number.isInteger(progress.points)
		|| progress.points < 0
		|| progress.points >= POINTS_PER_LEVEL
	) {
		console.warn('Saved level progress was invalid and has been reset.');
		localStorage.removeItem(LEVEL_PROGRESS_KEY);
		return { level: 1, points: 0 };
	}

	return progress;
}

function updateLevelDisplay() {
	levelValueDisplay.textContent = levelProgress.level;
	startLevelStatus.setAttribute('aria-label', `Level ${levelProgress.level}`);

	const waterHeight = (46 * levelProgress.points) / POINTS_PER_LEVEL;
	bucketWater.setAttribute('y', 78 - waterHeight);
	bucketWater.setAttribute('height', waterHeight);
	startBucket.setAttribute(
		'aria-label',
		`Bucket ${Math.round((levelProgress.points / POINTS_PER_LEVEL) * 100)}% full, ${levelProgress.points} of ${POINTS_PER_LEVEL} points toward the next level`,
	);
}

function bankRoundPoints() {
	levelProgress.points += Math.max(0, roundPointsEarned - roundPointsSpent);

	while (levelProgress.points >= POINTS_PER_LEVEL) {
		levelProgress.points -= POINTS_PER_LEVEL;
		levelProgress.level += 1;
	}

	updateLevelDisplay();
	localStorage.setItem(LEVEL_PROGRESS_KEY, JSON.stringify(levelProgress));
}

function wouldCreateMatch(row, column, symbol) {
	const directions = [
		{ rowStep: 0, columnStep: 1 },
		{ rowStep: 1, columnStep: 0 },
	];

	for (const direction of directions) {
		let matchingNeighbors = 0;

		for (const step of [-1, 1]) {
			let neighborRow = row + direction.rowStep * step;
			let neighborColumn = column + direction.columnStep * step;

			while (neighborRow >= 0 && neighborRow < 6 && neighborColumn >= 0 && neighborColumn < 7) {
				const neighborIndex = neighborRow * 7 + neighborColumn;
				const neighborCell = gameGrid.children[neighborIndex];

				if (!neighborCell || neighborCell.firstElementChild.textContent !== symbol) {
					break;
				}

				matchingNeighbors += 1;
				neighborRow += direction.rowStep * step;
				neighborColumn += direction.columnStep * step;
			}
		}

		if (matchingNeighbors >= 2) {
			return true;
		}
	}

	return false;
}

function getRandomEffectForCell(cell) {
	const row = Number(cell.dataset.row);
	const column = Number(cell.dataset.column);
	const availableEffects = effects.filter(function (effect) {
		return !wouldCreateMatch(row, column, effect.symbol);
	});
	const choices = availableEffects.length > 0 ? availableEffects : effects;

	return choices[Math.floor(Math.random() * choices.length)];
}

function restartGame() {
	if (matchAnimationTimeout !== null) {
		clearTimeout(matchAnimationTimeout);
		matchAnimationTimeout = null;
	}

	movesLeft = moveLimit;
	score = 0;
	roundPointsEarned = 0;
	roundPointsSpent = 0;
	movesDisplay.textContent = movesLeft;
	scoreDisplay.textContent = score;
	gameMessage.textContent = '';
	gameMessage.className = 'game-message';
	restartButton.hidden = true;
	updateExtraLifeButton();
	selectedCell = null;
	gameOver = false;
	gameGrid.classList.remove('animating', 'game-over');

	const cells = Array.from(gameGrid.children);
	cells.forEach(function (cell) {
		cell.classList.remove('matched', 'selected');
		cell.firstElementChild.className = 'cell-effect';
		cell.firstElementChild.textContent = '';
	});

	cells.forEach(function (cell) {
		const effectIcon = cell.firstElementChild;
		const randomEffect = getRandomEffectForCell(cell);

		effectIcon.className = `cell-effect ${randomEffect.className}`;
		effectIcon.textContent = randomEffect.symbol;
		effectIcon.style.animationDelay = `${Math.random() * 2}s`;
	});
}

function findMatches(swappedCells) {
	const matchedCells = new Set();
	const matchedLines = new Set();
	const directions = [
		{ rowStep: 0, columnStep: 1 },
		{ rowStep: 1, columnStep: 0 },
	];

	swappedCells.forEach(function (swappedCell) {
		const row = Number(swappedCell.dataset.row);
		const column = Number(swappedCell.dataset.column);
		const symbol = swappedCell.firstElementChild.textContent;

		directions.forEach(function (direction) {
			let startRow = row;
			let startColumn = column;

			while (true) {
				const previousRow = startRow - direction.rowStep;
				const previousColumn = startColumn - direction.columnStep;

				if (previousRow < 0 || previousColumn < 0) {
					break;
				}

				const previousIndex = previousRow * 7 + previousColumn;
				const previousCell = gameGrid.children[previousIndex];

				if (previousCell.firstElementChild.textContent !== symbol) {
					break;
				}

				startRow = previousRow;
				startColumn = previousColumn;
			}

			const matchingCells = [];
			let matchRow = startRow;
			let matchColumn = startColumn;

			while (matchRow < 6 && matchColumn < 7) {
				const matchIndex = matchRow * 7 + matchColumn;
				const matchCell = gameGrid.children[matchIndex];

				if (matchCell.firstElementChild.textContent !== symbol) {
					break;
				}

				matchingCells.push(matchCell);
				matchRow += direction.rowStep;
				matchColumn += direction.columnStep;
			}

			if (matchingCells.length >= 3) {
				matchingCells.forEach(function (cell) {
					matchedCells.add(cell);
				});
				matchedLines.add(`${direction.rowStep}-${startRow}-${startColumn}`);
			}
		});
	});

	return { cells: matchedCells, lineCount: matchedLines.size };
}

function clearMatches(firstSwappedCell, secondSwappedCell) {
	const matches = findMatches([firstSwappedCell, secondSwappedCell]);
	const matchedCells = matches.cells;

	if (matchedCells.size === 0) {
		return;
	}

	const pointsEarned = matches.lineCount * 3;
	score += pointsEarned;
	roundPointsEarned += pointsEarned;
	scoreDisplay.textContent = score;
	updateExtraLifeButton();
	gameGrid.classList.add('animating');
	matchedCells.forEach(function (cell) {
		const effectIcon = cell.firstElementChild;
		cell.classList.add('matched');
		effectIcon.style.animationDelay = '0s';
		effectIcon.classList.add('disappearing');
	});

	matchAnimationTimeout = setTimeout(function () {
		matchedCells.forEach(function (cell) {
			cell.firstElementChild.textContent = '';
		});

		matchedCells.forEach(function (cell) {
			const effectIcon = cell.firstElementChild;
			const randomEffect = getRandomEffectForCell(cell);

			effectIcon.className = `cell-effect ${randomEffect.className}`;
			effectIcon.textContent = randomEffect.symbol;
			effectIcon.style.animationDelay = `${Math.random() * 2}s`;
		});

		gameGrid.classList.remove('animating');
		matchAnimationTimeout = null;
	}, 300);
}

// Create 6 rows with 7 cells in each row.
for (let row = 0; row < 6; row += 1) {
	for (let column = 0; column < 7; column += 1) {
		const cell = document.createElement('div');
		const effectIcon = document.createElement('span');

		cell.classList.add('grid-cell');
		cell.setAttribute('role', 'gridcell');
		cell.dataset.row = row;
		cell.dataset.column = column;
		const randomEffect = getRandomEffectForCell(cell);
		effectIcon.classList.add('cell-effect', randomEffect.className);
		effectIcon.setAttribute('aria-hidden', 'true');
		effectIcon.textContent = randomEffect.symbol;
		effectIcon.style.animationDelay = `${Math.random() * 2}s`;
		cell.appendChild(effectIcon);
		gameGrid.appendChild(cell);

		cell.addEventListener('click', function () {
			if (gameOver) {
				return;
			}

			if (selectedCell === null) {
				selectedCell = cell;
				cell.classList.add('selected');
			} else if (selectedCell === cell) {
				cell.classList.remove('selected');
				selectedCell = null;
			} else {
				const rowDistance = Math.abs(row - Number(selectedCell.dataset.row));
				const columnDistance = Math.abs(column - Number(selectedCell.dataset.column));

				if (rowDistance + columnDistance === 1) {
					const selectedEffect = selectedCell.firstElementChild;
					const clickedEffect = cell.firstElementChild;

					selectedCell.appendChild(clickedEffect);
					cell.appendChild(selectedEffect);
					selectedCell.classList.remove('selected');
					const firstSwappedCell = selectedCell;
					selectedCell = null;
					clearMatches(firstSwappedCell, cell);
					finishMove();
				}
			}
		});
	}
}

restartButton.addEventListener('click', restartGame);

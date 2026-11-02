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
const roundResult = document.querySelector('#round-result');
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
let movesLeft = 20;
let moveLimit = 20;
let pointsPerMatch = 3;
let score = 0;
let roundPointsEarned = 0;
let roundPointsSpent = 0;
let gameOver = false;
let matchAnimationTimeout = null;
let roundEndEffect = null;
let swipeStart = null;
let gameAudioContext = null;
let audioSupportWarningShown = false;
let roundEndNoiseBuffer = null;
let roundEndSoundSources = new Set();
let roundEndSoundInterval = null;
let roundEndSoundType = null;
let celebrationNoteIndex = 0;

updateLevelDisplay();

document.addEventListener('click', function (event) {
	if (event.target.closest('button')) {
		playButtonSound();
	}
}, true);

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
		clearRoundEndEffect();
		gameGrid.classList.remove('game-over');
		gameMessage.textContent = '';
		gameMessage.className = 'game-message';
		roundResult.hidden = true;
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
		pointsPerMatch = Number(button.dataset.pointsPerMatch);
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
		roundResult.textContent = playerWon ? 'You Win!' : 'You Lose';
		roundResult.className = `round-result ${playerWon ? 'win' : 'lose'}`;
		roundResult.hidden = false;
		restartButton.hidden = false;
		showRoundEndEffect(playerWon ? 'confetti' : 'rain');
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
	clearRoundEndEffect();

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
	roundResult.textContent = '';
	roundResult.className = 'round-result';
	roundResult.hidden = true;
	restartButton.hidden = true;
	updateExtraLifeButton();
	gameOver = false;
	gameGrid.classList.remove('animating', 'game-over');

	const cells = Array.from(gameGrid.children);
	cells.forEach(function (cell) {
		cell.classList.remove('matched');
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

function showRoundEndEffect(effectType) {
	clearRoundEndEffect();

	const effectLayer = document.createElement('div');
	const pieceCount = effectType === 'rain' ? 45 : 70;
	effectLayer.className = `round-end-effect ${effectType}-effect`;
	effectLayer.setAttribute('aria-hidden', 'true');

	for (let index = 0; index < pieceCount; index += 1) {
		const piece = document.createElement('span');
		const animationDuration = effectType === 'rain'
			? 0.7 + Math.random() * 0.6
			: 2.5 + Math.random() * 2;

		piece.className = 'round-end-effect-piece';
		piece.style.left = `${Math.random() * 100}%`;
		piece.style.animationDuration = `${animationDuration}s`;
		piece.style.animationDelay = `${Math.random() * -animationDuration}s`;
		effectLayer.appendChild(piece);
	}

	gameScreen.appendChild(effectLayer);
	roundEndEffect = effectLayer;
	startRoundEndSound(effectType);
}

function clearRoundEndEffect() {
	if (roundEndEffect !== null) {
		roundEndEffect.remove();
		roundEndEffect = null;
	}

	stopRoundEndSound();
}

function getGameAudioContext() {
	const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
	if (!AudioContextConstructor) {
		if (!audioSupportWarningShown) {
			console.warn('Game sounds are not supported by this browser.');
			audioSupportWarningShown = true;
		}

		return null;
	}

	if (gameAudioContext === null) {
		gameAudioContext = new AudioContextConstructor();
	}

	if (gameAudioContext.state === 'suspended') {
		gameAudioContext.resume().catch(function (error) {
			console.warn('Game sound could not be started.', error);
		});
	}

	return gameAudioContext;
}

function playButtonSound() {
	const audioContext = getGameAudioContext();
	if (audioContext === null) {
		return;
	}

	const oscillator = audioContext.createOscillator();
	const volume = audioContext.createGain();
	const startTime = audioContext.currentTime;

	oscillator.type = 'triangle';
	oscillator.frequency.setValueAtTime(720, startTime);
	oscillator.frequency.exponentialRampToValueAtTime(460, startTime + 0.06);
	volume.gain.setValueAtTime(0.12, startTime);
	volume.gain.exponentialRampToValueAtTime(0.001, startTime + 0.07);
	oscillator.connect(volume);
	volume.connect(audioContext.destination);
	oscillator.onended = function () {
		oscillator.disconnect();
		volume.disconnect();
	};
	oscillator.start(startTime);
	oscillator.stop(startTime + 0.08);
}

function startRoundEndSound(effectType) {
	stopRoundEndSound();
	const audioContext = getGameAudioContext();
	if (audioContext === null) {
		return;
	}

	roundEndSoundType = effectType;
	if (effectType === 'rain') {
		playRainSound(audioContext);
		return;
	}

	celebrationNoteIndex = 0;
	playCelebrationSound(audioContext);
	roundEndSoundInterval = window.setInterval(function () {
		playCelebrationSound(audioContext);
	}, 180);
}

function playRainSound(audioContext) {
	if (roundEndNoiseBuffer === null) {
		const bufferLength = audioContext.sampleRate * 2;
		roundEndNoiseBuffer = audioContext.createBuffer(1, bufferLength, audioContext.sampleRate);
		const noiseData = roundEndNoiseBuffer.getChannelData(0);

		for (let index = 0; index < bufferLength; index += 1) {
			noiseData[index] = Math.random() * 2 - 1;
		}
	}

	const source = audioContext.createBufferSource();
	const filter = audioContext.createBiquadFilter();
	const volume = audioContext.createGain();

	source.buffer = roundEndNoiseBuffer;
	source.loop = true;
	filter.type = 'lowpass';
	filter.frequency.value = 1400;
	volume.gain.value = 0.08;
	source.connect(filter);
	filter.connect(volume);
	volume.connect(audioContext.destination);
	source.onended = function () {
		source.disconnect();
		filter.disconnect();
		volume.disconnect();
		roundEndSoundSources.delete(source);
	};
	roundEndSoundSources.add(source);
	source.start();
}

function playCelebrationSound(audioContext) {
	if (roundEndSoundType !== 'confetti') {
		return;
	}

	const notes = [784, 988, 1175, 1568, 1175, 1318, 1568, 1760];
	const oscillator = audioContext.createOscillator();
	const volume = audioContext.createGain();
	const startTime = audioContext.currentTime;
	const note = notes[celebrationNoteIndex % notes.length];
	celebrationNoteIndex += 1;

	oscillator.type = 'triangle';
	oscillator.frequency.setValueAtTime(note, startTime);
	volume.gain.setValueAtTime(0.0001, startTime);
	volume.gain.exponentialRampToValueAtTime(0.12, startTime + 0.02);
	volume.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.16);
	oscillator.connect(volume);
	volume.connect(audioContext.destination);
	oscillator.onended = function () {
		oscillator.disconnect();
		volume.disconnect();
		roundEndSoundSources.delete(oscillator);
	};
	roundEndSoundSources.add(oscillator);
	oscillator.start(startTime);
	oscillator.stop(startTime + 0.18);
}

function stopRoundEndSound() {
	roundEndSoundType = null;
	if (roundEndSoundInterval !== null) {
		window.clearInterval(roundEndSoundInterval);
		roundEndSoundInterval = null;
	}

	const activeSources = Array.from(roundEndSoundSources);
	roundEndSoundSources.clear();
	activeSources.forEach(function (source) {
		source.stop();
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

	const pointsEarned = matches.lineCount * pointsPerMatch;
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

gameGrid.addEventListener('pointerdown', function (event) {
	const cell = event.target.closest('.grid-cell');
	if (gameOver || event.button !== 0 || !cell) {
		return;
	}

	swipeStart = {
		cell: cell,
		x: event.clientX,
		y: event.clientY,
		pointerId: event.pointerId,
	};
});

window.addEventListener('pointerup', function (event) {
	if (swipeStart === null || event.pointerId !== swipeStart.pointerId) {
		return;
	}

	const start = swipeStart;
	swipeStart = null;
	const horizontalDistance = event.clientX - start.x;
	const verticalDistance = event.clientY - start.y;

	if (Math.max(Math.abs(horizontalDistance), Math.abs(verticalDistance)) < 20) {
		return;
	}

	const row = Number(start.cell.dataset.row);
	const column = Number(start.cell.dataset.column);
	let nextRow = row;
	let nextColumn = column;

	if (Math.abs(horizontalDistance) > Math.abs(verticalDistance)) {
		nextColumn += horizontalDistance > 0 ? 1 : -1;
	} else {
		nextRow += verticalDistance > 0 ? 1 : -1;
	}

	if (nextRow < 0 || nextRow >= 6 || nextColumn < 0 || nextColumn >= 7) {
		return;
	}

	const nextCell = gameGrid.children[nextRow * 7 + nextColumn];
	const firstEffect = start.cell.firstElementChild;
	const secondEffect = nextCell.firstElementChild;
	start.cell.appendChild(secondEffect);
	nextCell.appendChild(firstEffect);
	playButtonSound();
	clearMatches(start.cell, nextCell);
	finishMove();
});

window.addEventListener('pointercancel', function (event) {
	if (swipeStart !== null && event.pointerId === swipeStart.pointerId) {
		swipeStart = null;
	}
});

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
	}
}

restartButton.addEventListener('click', restartGame);

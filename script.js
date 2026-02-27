// script.js – Word Crush, delightfully doomed edition

/********** CONFIG **********/
const CONFIG = {
    gridSize: 7,
    tileSize: 60,
    gap: 8,
    minWordLen: 3,
    gameDuration: 600, // 10 min
    // letter pool (melancholy weighted)
    letters: "EEEEEEEEEEEEAAAAAAAAAIIIIIIIIIOOOOOOOONNNNNNRRRRRRTTTTTTLLLLSSSSUUUDDDDGGGBBCCMMPPFFHHVVWWYYKJXQZ",
    bonusX3: ['Q','Z','X','J'],
    bonusX2: ['K','V','F','H','W','Y']
};

/********** STATE **********/
let grid = [];               // 2D array of { id, char, mult, row, col, isNew }
let score = 0;
let isDragging = false;
let selectedPath = [];       // [{r, c} ...]
let timerInterval;
let timeRemaining = CONFIG.gameDuration;
let gameActive = false;
let uniqueIdCounter = 0;

/********** DOM ELEMENTS **********/
const els = {
    setup: document.getElementById('setup-panel'),
    game: document.getElementById('game-ui'),
    grid: document.getElementById('grid-container'),
    msg: document.getElementById('msg-text'),
    spinner: document.getElementById('loading-spinner'),
    score: document.getElementById('display-score'),
    time: document.getElementById('display-time'),
    modal: document.getElementById('game-over-modal'),
    finalScore: document.getElementById('final-score'),
    teamName: document.getElementById('display-team')
};

/********** START EVENT **********/
document.getElementById('start-btn').addEventListener('click', () => {
    const name = document.getElementById('team-name').value.trim() || "doomed soul";
    els.teamName.innerText = name;
    els.setup.style.display = 'none';
    els.game.style.display = 'flex';
    initGame();
});

/********** INIT **********/
function initGame() {
    gameActive = true;
    createInitialGrid();
    renderGrid();
    startTimer();
}

/********** TILE GENERATION **********/
function generateTile(r, c) {
    const char = CONFIG.letters.charAt(Math.floor(Math.random() * CONFIG.letters.length));
    let mult = 1;
    if (CONFIG.bonusX3.includes(char)) mult = 3;
    else if (CONFIG.bonusX2.includes(char)) mult = 2;

    return {
        id: `tile-${uniqueIdCounter++}`,
        char,
        mult,
        row: r,
        col: c,
        isNew: true
    };
}

function createInitialGrid() {
    grid = [];
    for (let r = 0; r < CONFIG.gridSize; r++) {
        let row = [];
        for (let c = 0; c < CONFIG.gridSize; c++) {
            row.push(generateTile(r, c));
        }
        grid.push(row);
    }
}

/********** RENDER (sync DOM with grid) **********/
function renderGrid() {
    const existingTiles = document.querySelectorAll('.tile');
    existingTiles.forEach(t => t.dataset.active = "false");

    for (let r = 0; r < CONFIG.gridSize; r++) {
        for (let c = 0; c < CONFIG.gridSize; c++) {
            const cell = grid[r][c];
            if (!cell) continue;

            let tileEl = document.getElementById(cell.id);
            const x = c * (CONFIG.tileSize + CONFIG.gap);
            const y = r * (CONFIG.tileSize + CONFIG.gap);

            if (!tileEl) {
                // create new tile
                tileEl = document.createElement('div');
                tileEl.id = cell.id;
                tileEl.className = 'tile';
                tileEl.innerText = cell.char;
                tileEl.dataset.mult = cell.mult;

                if (cell.mult > 1) {
                    const badge = document.createElement('span');
                    badge.className = 'badge';
                    badge.innerText = `x${cell.mult}`;
                    tileEl.appendChild(badge);
                }

                // new tiles fall from above (doomed entrance)
                if (cell.isNew) {
                    tileEl.style.transform = `translate(${x}px, -100px)`;
                    cell.isNew = false;
                } else {
                    tileEl.style.transform = `translate(${x}px, ${y}px)`;
                }

                // attach drag events
                tileEl.addEventListener('mousedown', (e) => startDrag(e, cell));
                tileEl.addEventListener('mouseenter', (e) => enterDrag(e, cell));

                els.grid.appendChild(tileEl);
                void tileEl.offsetWidth; // force reflow
            }

            // update position (triggers CSS transition)
            tileEl.style.transform = `translate(${x}px, ${y}px)`;
            tileEl.dataset.row = r;
            tileEl.dataset.col = c;
            tileEl.dataset.active = "true";

            // remove temporary visual classes
            tileEl.classList.remove('selected', 'valid-word', 'invalid-word');
        }
    }

    // remove crushed / missing tiles
    existingTiles.forEach(t => {
        if (t.dataset.active === "false") {
            t.classList.add('crushed');
            setTimeout(() => t.remove(), 300);
        }
    });

    document.removeEventListener('mouseup', endDrag);
    document.addEventListener('mouseup', endDrag);
}

/********** DRAG HANDLING **********/
function startDrag(e, cellData) {
    if (!gameActive) return;
    isDragging = true;
    selectedPath = [];

    document.querySelectorAll('.tile').forEach(t => t.classList.remove('selected'));
    addSelection(cellData);
}

function enterDrag(e, cellData) {
    if (!isDragging || !gameActive) return;
    addSelection(cellData);
}

function endDrag() {
    if (!isDragging) return;
    isDragging = false;

    if (selectedPath.length >= CONFIG.minWordLen) {
        const word = selectedPath.map(p => grid[p.r][p.c].char).join('');
        validateWord(word);
    } else {
        els.msg.innerText = "too short, mortal";
        setTimeout(renderGrid, 500);
    }
}

function addSelection(cellData) {
    const r = cellData.row;
    const c = cellData.col;

    // check if already in path (allow backtrack pop)
    const index = selectedPath.findIndex(p => p.r === r && p.c === c);
    if (index !== -1) {
        if (index === selectedPath.length - 2) {
            const removed = selectedPath.pop();
            const el = document.getElementById(grid[removed.r][removed.c].id);
            if (el) el.classList.remove('selected');
        }
        return;
    }

    // adjacency check
    if (selectedPath.length > 0) {
        const last = selectedPath[selectedPath.length - 1];
        if (Math.abs(last.r - r) > 1 || Math.abs(last.c - c) > 1) return;
    }

    // add to path
    selectedPath.push({ r, c });
    const el = document.getElementById(cellData.id);
    if (el) el.classList.add('selected');
}

/********** WORD VALIDATION & SCORING (updated for longer words) **********/
async function validateWord(word) {
    els.msg.innerText = `weaving "${word}" ...`;
    els.spinner.style.display = 'block';

    try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        els.spinner.style.display = 'none';

        if (res.ok) {
            processSuccess(word);
        } else {
            processFail(word);
        }
    } catch (e) {
        els.spinner.style.display = 'none';
        els.msg.innerText = "oracle unreachable";
        setTimeout(renderGrid, 500);
    }
}

function processSuccess(word) {
    // --- NEW SCORING RULE: longer words give exponentially more tears ---
    // base = (length - 2) * length   (for words >3, this rewards longer combos)
    // minimum 1 point
    let basePoints = word.length - 2;  // was simple
    // Delightfully doomed twist: words of length >=5 get quadratic love
    if (word.length >= 5) {
        basePoints = (word.length - 2) * word.length;  // 5 -> 3*5=15, 7->5*7=35 etc.
    } else if (word.length === 4) {
        basePoints = 4;  // 4 letter = 4pts (instead of 2)
    } // length 3 remains 1 point

    // apply multiplier from path
    let multiplier = 1;
    selectedPath.forEach(p => multiplier *= grid[p.r][p.c].mult);

    const totalPoints = basePoints * multiplier;
    score += totalPoints;
    els.score.innerText = `${score} tears`;
    els.msg.innerText = `❝${word}❞ +${totalPoints} tears`;

    // visual success
    selectedPath.forEach(p => {
        const el = document.getElementById(grid[p.r][p.c].id);
        if (el) el.classList.add('valid-word');
    });

    setTimeout(applyGravity, 400);
}

function processFail(word) {
    els.msg.innerText = `"${word}" not in the lament`;
    selectedPath.forEach(p => {
        const el = document.getElementById(grid[p.r][p.c].id);
        if (el) el.classList.add('invalid-word');
    });
    setTimeout(renderGrid, 500);
}

/********** GRAVITY (column collapse + new tiles) **********/
function applyGravity() {
    // 1. mark selected tiles as null
    selectedPath.forEach(p => {
        grid[p.r][p.c] = null;
    });

    // 2. shift each column
    for (let c = 0; c < CONFIG.gridSize; c++) {
        let columnTiles = [];
        for (let r = 0; r < CONFIG.gridSize; r++) {
            if (grid[r][c] !== null) columnTiles.push(grid[r][c]);
        }

        const missing = CONFIG.gridSize - columnTiles.length;
        for (let i = 0; i < missing; i++) {
            columnTiles.unshift(generateTile(0, c)); // row temporary
        }

        // reassign rows
        for (let r = 0; r < CONFIG.gridSize; r++) {
            grid[r][c] = columnTiles[r];
            grid[r][c].row = r;
            grid[r][c].col = c;
        }
    }

    selectedPath = [];
    renderGrid();
}

/********** TIMER **********/
function startTimer() {
    timerInterval = setInterval(() => {
        timeRemaining--;
        const m = Math.floor(timeRemaining / 60);
        const s = timeRemaining % 60;
        els.time.innerText = `${m}:${s < 10 ? '0' + s : s}`;

        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            gameActive = false;
            els.finalScore.innerText = score;
            els.modal.style.display = 'flex';
        }
    }, 1000);
}
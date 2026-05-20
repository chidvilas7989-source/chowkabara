const PLAYERS = ['blue', 'red', 'green', 'yellow'];
const HOME_SQUARES = [3, 21, 27, 45];
const SAFE_STARS = [8, 12, 16, 18, 30, 32, 36, 40];
const CENTER_SQUARE = 24;
const SAFE_SQUARES = [...HOME_SQUARES, ...SAFE_STARS, CENTER_SQUARE];

const PATHS = {
    red:    { outer:[45,44,43,42,35,28,21,14,7,0,1,2,3,4,5,6,13,20,27,34,41,48,47,46], mid:[39,38,37,36,29,22,15,8,9,10,11,12,19,26,33,40], inner:[32,31,30,23,16,17,18,25], center:[24] },
    green:  { outer:[21,14,7,0,1,2,3,4,5,6,13,20,27,34,41,48,47,46,45,44,43,42,35,28], mid:[29,22,15,8,9,10,11,12,19,26,33,40,39,38,37,36], inner:[30,23,16,17,18,25,32,31], center:[24] },
    yellow: { outer:[3,4,5,6,13,20,27,34,41,48,47,46,45,44,43,42,35,28,21,14,7,0,1,2], mid:[9,10,11,12,19,26,33,40,39,38,37,36,29,22,15,8], inner:[16,17,18,25,32,31,30,23], center:[24] },
    blue:   { outer:[27,34,41,48,47,46,45,44,43,42,35,28,21,14,7,0,1,2,3,4,5,6,13,20], mid:[19,26,33,40,39,38,37,36,29,22,15,8,9,10,11,12], inner:[18,25,32,31,30,23,16,17], center:[24] }
};

const EXTRA_TURN_ROLLS = [6];
const ENTRY_ROLLS = [6];

let svgDice = null; // SVGDice instance

let STATE = {
    socket: null,
    uid: localStorage.getItem('chowkabara_uid') || '',
    roomId: '',
    playerName: localStorage.getItem('chowkabara_name') || '',
    myColor: null,
    gameState: null
};

// ── INIT ──────────────────────────────────────────
function initApp() {
    if (window.onAuthStateChanged && window.firebaseAuth) {
        window.onAuthStateChanged(window.firebaseAuth, (user) => {
            if (user) {
                STATE.uid = user.uid;
                localStorage.setItem('chowkabara_uid', user.uid);
                console.log("Authenticated with Firebase. UID:", user.uid);
                connectSocket();
            } else {
                window.signInAnonymously(window.firebaseAuth)
                    .then(() => {
                        console.log("Signing in anonymously to Firebase...");
                    })
                    .catch(err => {
                        console.error("Firebase auth error:", err);
                        fallbackToLocalAuth();
                    });
            }
        });
    } else {
        console.log("Firebase not configured. Using local guest account.");
        fallbackToLocalAuth();
    }

    if (STATE.playerName) {
        document.getElementById('player-name').value = STATE.playerName;
        const nameCreate = document.getElementById('player-name-create');
        const nameJoin = document.getElementById('player-name-join');
        if (nameCreate) nameCreate.value = STATE.playerName;
        if (nameJoin) nameJoin.value = STATE.playerName;
    }
}

function fallbackToLocalAuth() {
    if (!STATE.uid || STATE.uid.startsWith('player_') === false) {
        STATE.uid = 'player_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('chowkabara_uid', STATE.uid);
    }
    connectSocket();
}

function connectSocket() {
    STATE.socket = io();

    STATE.socket.on('connect', () => {
        console.log('Socket connected');
        if (STATE.uid) {
            STATE.socket.emit('rejoin_room', { uid: STATE.uid });
        }
    });

    STATE.socket.on('room_created', async (d) => {
        enterWaitingRoom(d.room);
        if (window.firebaseDb) {
            try {
                await window.setDoc(window.doc(window.firebaseDb, "rooms", d.room.id), {
                    roomId: d.room.id,
                    status: "waiting",
                    createdAt: new Date().toISOString(),
                    players: [{
                        uid: STATE.uid,
                        name: STATE.playerName,
                        color: STATE.myColor || "blue",
                        joinedAt: new Date().toISOString()
                    }]
                });
            } catch (e) {
                console.error("Error saving room to Firestore: ", e);
            }
        }
    });

    STATE.socket.on('room_joined', async (d) => {
        enterWaitingRoom(d.room);
        if (d.rejoined && d.room.status === 'playing') {
            enterGame(d.room);
        } else if (!d.rejoined) {
            if (window.firebaseDb) {
                try {
                    await window.updateDoc(window.doc(window.firebaseDb, "rooms", d.room.id), {
                        players: window.arrayUnion({
                            uid: STATE.uid,
                            name: STATE.playerName,
                            color: STATE.myColor || "unknown",
                            joinedAt: new Date().toISOString()
                        })
                    });
                } catch (e) {
                    console.error("Error updating room in Firestore: ", e);
                }
            }
        }
    });

    STATE.socket.on('player_joined',     (d) => updatePlayersList(d.room));
    STATE.socket.on('player_offline',    (d) => updatePlayersList(d.room));
    STATE.socket.on('player_rejoined',   (d) => updatePlayersList(d.room));
    STATE.socket.on('player_left',       (d) => updatePlayersList(d.room));
    STATE.socket.on('game_started',      (d) => enterGame(d.room));
    STATE.socket.on('game_state_updated',(d) => { STATE.gameState = d.gameState; syncUIWithState(); });
    
    STATE.socket.on('room_closed', (d) => {
        showToast('Room closed: ' + d.reason, 'error');
        localStorage.removeItem('chowkabara_room');
        document.getElementById('landing-page').style.display = 'flex';
        document.getElementById('waiting-room').style.display = 'none';
        document.getElementById('game-page').style.display = 'none';
        STATE.roomId = '';
        STATE.gameState = null;
    });

    STATE.socket.on('player_left_game', (d) => {
        showToast(`🚪 ${d.left_player.name || d.left_player.color} exited the room`, 'info');
        STATE.gameState = d.room.gameState;
        syncUIWithState();
    });

    STATE.socket.on('rejoin_failed',     () => {
        localStorage.removeItem('chowkabara_room');
        document.getElementById('landing-page').style.display = 'flex';
        document.getElementById('waiting-room').style.display = 'none';
        document.getElementById('game-page').style.display = 'none';
    });
    STATE.socket.on('error',             (d) => showToast('⚠️ ' + d.message, 'error'));
}

// ── LOBBY ─────────────────────────────────────────
document.getElementById('btn-create').addEventListener('click', () => {
    const name  = document.getElementById('player-name').value.trim() || 'Player';
    const color = document.getElementById('player-color').value || 'blue';
    STATE.playerName = name;
    localStorage.setItem('chowkabara_name', name);
    STATE.socket.emit('create_room', { name, uid: STATE.uid, color });
});

document.getElementById('btn-join').addEventListener('click', () => {
    const name    = document.getElementById('player-name').value.trim() || 'Player';
    const color   = document.getElementById('player-color').value || 'blue';
    const room_id = document.getElementById('join-room-id').value.trim().toUpperCase();
    if (!room_id) return showToast('Enter a room code', 'error');
    STATE.playerName = name;
    localStorage.setItem('chowkabara_name', name);
    STATE.socket.emit('join_room', { name, uid: STATE.uid, room_id, color });
});

document.getElementById('btn-start').addEventListener('click', () => {
    STATE.socket.emit('start_game', { room_id: STATE.roomId });
});

function enterWaitingRoom(room) {
    STATE.roomId = room.id;
    localStorage.setItem('chowkabara_room', room.id);
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('waiting-room').style.display = 'flex';
    document.getElementById('display-room-id').innerText = room.id;
    updatePlayersList(room);
}

function updatePlayersList(room) {
    const ul = document.getElementById('players-ul');
    ul.innerHTML = '';
    let isCreator = false;
    room.players.forEach((p, idx) => {
        const li = document.createElement('li');
        li.className = 'player-list-item';
        li.innerHTML = `<span class="player-dot" style="background:var(--player-${p.color})"></span>${p.name} <span style="opacity:.6">(${p.color})</span>`;
        if (!p.online) li.style.opacity = '0.5';
        ul.appendChild(li);
        if (p.uid === STATE.uid) { STATE.myColor = p.color; if (idx === 0) isCreator = true; }
    });
    document.getElementById('btn-start').style.display = (isCreator && room.players.length >= 2) ? 'block' : 'none';
}

// ── GAME INIT ─────────────────────────────────────
function fitBoardSize() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    
    const isMobile = window.innerWidth <= 890;
    let size;
    
    if (isMobile) {
        // Mobile stacked layout: Board on top, Dice + Capsule side-by-side below.
        const headerHeight = 52;
        const controlsHeight = 230; // Matches dice container and player capsule height
        const spacing = 24;
        const availableHeight = window.innerHeight - headerHeight - controlsHeight - spacing;
        const availableWidth = window.innerWidth - 16; // 8px margin on each side
        size = Math.min(availableWidth, availableHeight, 520);
        size = Math.max(size, 260); // Keep cells playable
    } else {
        // Desktop layout: Board on left, controls stacked on right.
        const headerHeight = 60;
        const spacing = 40;
        const availableHeight = window.innerHeight - headerHeight - spacing;
        const availableWidth = window.innerWidth - 300; // Leave 300px for Right Column
        size = Math.min(availableHeight, availableWidth, 520);
        size = Math.max(size, 300);
    }
    
    size = Math.floor(size);
    boardEl.style.width = `${size}px`;
    boardEl.style.height = `${size}px`;
    console.log(`Board dimensions locked at ${size}x${size}px`);
}

function enterGame(room) {
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('waiting-room').style.display = 'none';
    document.getElementById('game-page').style.display = 'flex';
    document.getElementById('in-game-room').innerText = room.id;
    document.getElementById('player-role').innerText = STATE.myColor;
    document.getElementById('player-role').style.color = `var(--player-${STATE.myColor})`;

    STATE.gameState = room.gameState;
    
    // Fit the board dimensions to the device viewport
    fitBoardSize();
    
    initBoardUI();
    initDiceUI();
    syncUIWithState();
}

// Add window resize listener to keep layout perfectly aligned
window.addEventListener('resize', () => {
    if (document.getElementById('game-page').style.display === 'flex') {
        fitBoardSize();
        arrangeTokensInCells();
    }
});

function initDiceUI() {
    const container = document.getElementById('dice-svg-container');
    container.innerHTML = '';
    const diceSize = window.innerWidth <= 480 ? 90 : 110;
    svgDice = new SVGDice('dice-svg-container', { size: diceSize });
    svgDice.setColor(STATE.myColor || 'default');
    svgDice.reset();
}

function initBoardUI() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    for (let i = 0; i < 49; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = `cell-${i}`;
        if (HOME_SQUARES.includes(i))      cell.classList.add('home-star');
        else if (SAFE_STARS.includes(i))   cell.classList.add('safe-star');
        else if (i === CENTER_SQUARE)      cell.classList.add('center-star');
        board.appendChild(cell);
    }

    PLAYERS.forEach(color => {
        const homeDiv = document.getElementById(`home-${color}`);
        homeDiv.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const token = document.createElement('div');
            token.className = `token ${color}`;
            token.id = `token-${color}-${i}`;
            token.dataset.color = color;
            token.dataset.index = i;
            token.addEventListener('click', () => handleTokenClick(color, i));
            token.addEventListener('mouseenter', () => handleTokenMouseEnter(color, i));
            token.addEventListener('mouseleave', () => handleTokenMouseLeave());
            homeDiv.appendChild(token);
        }
    });
}

function syncUIWithState() {
    // Hide player capsules for other players. Only show the capsule of STATE.myColor (if set)
    PLAYERS.forEach(color => {
        const capsule = document.getElementById(`player-${color}`);
        if (capsule) {
            if (STATE.myColor) {
                if (color === STATE.myColor) {
                    capsule.style.display = 'flex';
                } else {
                    capsule.style.display = 'none';
                }
            } else {
                capsule.style.display = 'flex';
            }
        }
    });

    PLAYERS.forEach(color => {
        for (let i = 0; i < 6; i++) updateTokenPositionUI(color, i);
    });
    arrangeTokensInCells();
    updateTurnUI();
}

function updateTokenPositionUI(color, tokenIndex) {
    const tokenEl = document.getElementById(`token-${color}-${tokenIndex}`);
    const state   = STATE.gameState.tokens[color][tokenIndex];
    if (state.finished) { tokenEl.style.display = 'none'; return; }
    tokenEl.style.display = '';
    if (state.layer === 'home') {
        document.getElementById(`home-${color}`).appendChild(tokenEl);
        tokenEl.style.position = '';
        tokenEl.style.left = '';
        tokenEl.style.top = '';
        tokenEl.style.transform = '';
        tokenEl.style.margin = '';
    } else {
        const cellId = PATHS[color][state.layer][state.index];
        document.getElementById(`cell-${cellId}`).appendChild(tokenEl);
    }
    tokenEl.classList.toggle('has-killed', !!state.hasKilled);
}

function arrangeTokensInCells() {
    for (let i = 0; i < 49; i++) {
        const cell = document.getElementById(`cell-${i}`);
        if (!cell) continue;
        const tokens = Array.from(cell.querySelectorAll('.token'));
        if (tokens.length === 0) continue;

        if (tokens.length === 1) {
            const t = tokens[0];
            t.style.position = 'absolute';
            t.style.left = '50%';
            t.style.top = '50%';
            t.style.transform = 'translate(-50%, -50%)';
            t.style.margin = '0';
        } else {
            const len = tokens.length;
            tokens.forEach((t, idx) => {
                t.style.position = 'absolute';
                t.style.margin = '0';
                
                let x, y;
                if (len === 2) {
                    x = idx === 0 ? 30 : 70;
                    y = 50;
                } else if (len === 3) {
                    if (idx === 0) { x = 50; y = 28; }
                    else if (idx === 1) { x = 28; y = 72; }
                    else { x = 72; y = 72; }
                } else if (len === 4) {
                    x = (idx % 2 === 0) ? 28 : 72;
                    y = (idx < 2) ? 28 : 72;
                } else {
                    const angle = (idx / len) * 2 * Math.PI;
                    const r = 24;
                    x = 50 + r * Math.cos(angle);
                    y = 50 + r * Math.sin(angle);
                }
                
                t.style.left = `${x}%`;
                t.style.top = `${y}%`;
                t.style.transform = 'translate(-50%, -50%)';
            });
        }
    }
}

function isMyTurn() {
    const turnOrder = STATE.gameState.turnOrder || PLAYERS;
    return turnOrder[STATE.gameState.currentPlayerIndex] === STATE.myColor;
}

// ── ROLL DICE ─────────────────────────────────────
document.getElementById('roll-button').addEventListener('click', () => {
    if (!isMyTurn() || STATE.gameState.hasRolled || STATE.gameState.winner) return;

    const rollValue = Math.floor(Math.random() * 6) + 1;
    STATE.gameState.currentRoll  = rollValue;
    STATE.gameState.hasRolled    = true;
    STATE.gameState.extraTurn    = EXTRA_TURN_ROLLS.includes(rollValue);

    const rollBtn = document.getElementById('roll-button');
    rollBtn.disabled = true;

    // Animate SVG dice
    if (svgDice) {
        svgDice.roll(rollValue, () => {
            // Show numeric result too
            const diceRes = document.getElementById('dice-result');
            diceRes.innerText = rollValue;
            diceRes.classList.add('dice-pop');
            setTimeout(() => diceRes.classList.remove('dice-pop'), 400);

            checkValidMovesLocally();
            broadcastState();
        });
    } else {
        // Fallback without SVG dice
        const diceRes = document.getElementById('dice-result');
        let blinks = 0;
        const interval = setInterval(() => {
            diceRes.innerText = Math.floor(Math.random() * 6) + 1;
            if (++blinks > 10) {
                clearInterval(interval);
                diceRes.innerText = rollValue;
                checkValidMovesLocally();
                broadcastState();
            }
        }, 50);
    }
});

function broadcastState() {
    STATE.socket.emit('sync_game_state', { room_id: STATE.roomId, gameState: STATE.gameState });
    updateTurnUI();
}

// ── MOVE LOGIC ────────────────────────────────────
function checkValidMovesLocally() {
    const color = STATE.myColor;
    const roll  = STATE.gameState.currentRoll;
    let hasValidMove = false;

    document.querySelectorAll('.token').forEach(t => t.classList.remove('playable'));

    for (let i = 0; i < 6; i++) {
        const token = STATE.gameState.tokens[color][i];
        if (token.finished) continue;
        if (token.layer === 'home') {
            if (ENTRY_ROLLS.includes(roll)) { hasValidMove = true; document.getElementById(`token-${color}-${i}`).classList.add('playable'); }
        } else {
            if (canMove(token, color, roll)) { hasValidMove = true; document.getElementById(`token-${color}-${i}`).classList.add('playable'); }
        }
    }

    if (!hasValidMove) setTimeout(endTurnLocally, 1500);
}

function playerHasKilled(color) {
    if (STATE.gameState && STATE.gameState.playerHasKilled && STATE.gameState.playerHasKilled[color]) {
        return true;
    }
    if (STATE.gameState && STATE.gameState.tokens && STATE.gameState.tokens[color]) {
        return STATE.gameState.tokens[color].some(t => t.hasKilled);
    }
    return false;
}

function canMove(tokenState, color, roll) {
    const { layer, index } = tokenState;
    if (layer === 'outer') return true;
    if (layer === 'mid')   return true;
    if (layer === 'inner') return (index + roll) <= PATHS[color].inner.length;
    return false;
}

function handleTokenMouseEnter(color, index) {
    if (color !== STATE.myColor) return;
    if (!isMyTurn() || !STATE.gameState.hasRolled || STATE.gameState.winner) return;
    const tokenEl = document.getElementById(`token-${color}-${index}`);
    if (!tokenEl.classList.contains('playable')) return;

    const tokenState = STATE.gameState.tokens[color][index];
    const roll = STATE.gameState.currentRoll;
    let targetCellId = null;

    if (tokenState.layer === 'home') {
        targetCellId = PATHS[color].outer[0];
    } else {
        let newIndex = tokenState.index + roll;
        let currentLayer = tokenState.layer;
        
        if (currentLayer === 'outer') {
            const len = PATHS[color].outer.length;
            if (newIndex >= len) {
                if (playerHasKilled(color)) { currentLayer = 'mid'; newIndex = newIndex - len; }
                else { newIndex = newIndex % len; }
            }
        } else if (currentLayer === 'mid') {
            const len = PATHS[color].mid.length;
            if (newIndex >= len) { currentLayer = 'inner'; newIndex = newIndex - len; }
        } else if (currentLayer === 'inner') {
            const len = PATHS[color].inner.length;
            if (newIndex >= len) { currentLayer = 'center'; newIndex = 0; }
        }

        if (currentLayer === 'center') {
            targetCellId = CENTER_SQUARE;
        } else {
            targetCellId = PATHS[color][currentLayer][newIndex];
        }
    }

    if (targetCellId !== null) {
        const targetCell = document.getElementById(`cell-${targetCellId}`);
        if (targetCell) {
            targetCell.classList.add('destination-highlight');
        }
    }
}

function handleTokenMouseLeave() {
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('destination-highlight'));
}

function animateTokenMovement(color, tokenIndex, roll, onComplete) {
    const state = STATE.gameState.tokens[color][tokenIndex];
    let stepsRemaining = roll;
    
    function step() {
        if (stepsRemaining <= 0) {
            if (onComplete) onComplete();
            return;
        }

        let newIndex = state.index + 1;
        if (state.layer === 'outer') {
            const len = PATHS[color].outer.length;
            if (newIndex >= len) {
                if (playerHasKilled(color)) { state.layer = 'mid'; newIndex = 0; }
                else { newIndex = newIndex % len; }
            }
        } else if (state.layer === 'mid') {
            const len = PATHS[color].mid.length;
            if (newIndex >= len) { state.layer = 'inner'; newIndex = 0; }
        } else if (state.layer === 'inner') {
            const len = PATHS[color].inner.length;
            if (newIndex >= len) {
                state.layer = 'center'; newIndex = 0; state.finished = true;
                document.getElementById(`token-${color}-${tokenIndex}`).style.display = 'none';
                showToast(`🎉 ${color.toUpperCase()} piece reached the center!`, 'success');
                checkWinConditionLocally(color);
                stepsRemaining = 0;
            }
        }

        if (!state.finished) {
            state.index = newIndex;
            updateTokenPositionUI(color, tokenIndex);
            arrangeTokensInCells();
        }
        
        stepsRemaining--;
        if (stepsRemaining > 0 && !state.finished) {
            setTimeout(step, 180);
        } else {
            if (!state.finished) {
                handleCaptureLocally(color, tokenIndex);
            }
            arrangeTokensInCells();
            if (onComplete) onComplete();
        }
    }

    step();
}

function handleTokenClick(color, index) {
    if (color !== STATE.myColor) return;
    if (!isMyTurn() || !STATE.gameState.hasRolled || STATE.gameState.winner) return;
    const tokenEl = document.getElementById(`token-${color}-${index}`);
    if (!tokenEl.classList.contains('playable')) return;

    const tokenState = STATE.gameState.tokens[color][index];
    const roll = STATE.gameState.currentRoll;
    document.querySelectorAll('.token').forEach(t => t.classList.remove('playable'));
    handleTokenMouseLeave(); // Remove hover highlights immediately

    if (tokenState.layer === 'home') {
        tokenState.layer = 'outer'; tokenState.index = 0;
        updateTokenPositionUI(color, index);
        handleCaptureLocally(color, index);
        arrangeTokensInCells();
        if (!STATE.gameState.winner) setTimeout(endTurnLocally, 500);
        else broadcastState();
    } else {
        animateTokenMovement(color, index, roll, () => {
            if (!STATE.gameState.winner) setTimeout(endTurnLocally, 500);
            else broadcastState();
        });
    }
}

function handleCaptureLocally(color, tokenIndex) {
    const state  = STATE.gameState.tokens[color][tokenIndex];
    const cellId = PATHS[color][state.layer][state.index];
    if (SAFE_SQUARES.includes(cellId)) return;

    PLAYERS.forEach(opponent => {
        if (opponent === color) return;
        for (let i = 0; i < 6; i++) {
            const opp = STATE.gameState.tokens[opponent][i];
            if (opp.layer !== 'home' && !opp.finished) {
                const oppCell = PATHS[opponent][opp.layer][opp.index];
                if (oppCell === cellId) {
                    opp.layer = 'home'; opp.index = -1; opp.hasKilled = false;
                    updateTokenPositionUI(opponent, i);
                    state.hasKilled = true;
                    if (!STATE.gameState.playerHasKilled) {
                        STATE.gameState.playerHasKilled = { blue: false, red: false, green: false, yellow: false };
                    }
                    STATE.gameState.playerHasKilled[color] = true;
                    updateTokenPositionUI(color, tokenIndex);
                    STATE.gameState.extraTurn = true;
                    showToast(`💥 ${color.toUpperCase()} captured ${opponent.toUpperCase()}!`, 'capture');
                    const cellEl = document.getElementById(`cell-${cellId}`);
                    cellEl.classList.add('capture-flash');
                    setTimeout(() => cellEl.classList.remove('capture-flash'), 500);
                }
            }
        }
    });
}

function endTurnLocally() {
    if (STATE.gameState.winner) return;
    STATE.gameState.hasRolled = false;
    document.getElementById('dice-result').innerText = '--';
    if (svgDice) svgDice.reset();
    const turnOrder = STATE.gameState.turnOrder || PLAYERS;
    if (!STATE.gameState.extraTurn) {
        STATE.gameState.currentPlayerIndex = (STATE.gameState.currentPlayerIndex + 1) % turnOrder.length;
    }
    STATE.gameState.extraTurn = false;
    broadcastState();
    // Update dice color to new player
    if (svgDice) svgDice.setColor(turnOrder[STATE.gameState.currentPlayerIndex]);
}

function checkWinConditionLocally(color) {
    if (STATE.gameState.tokens[color].every(t => t.finished)) {
        STATE.gameState.winner = color;
        showWinnerModal(color);
    }
}

// ── WIN MODAL ─────────────────────────────────────
function showWinnerModal(color) {
    let modal = document.getElementById('winner-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'winner-modal';
        modal.innerHTML = `
          <div class="winner-modal-inner">
            <div class="winner-trophy">🏆</div>
            <h2 class="winner-title" id="winner-title"></h2>
            <p class="winner-sub">conquered the Chowkabara board!</p>
            <button class="btn-primary" onclick="location.reload()">Play Again</button>
          </div>`;
        document.body.appendChild(modal);
        // CSS injected once
        if (!document.getElementById('modal-style')) {
            const s = document.createElement('style');
            s.id = 'modal-style';
            s.textContent = `
              #winner-modal{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeIn .4s ease}
              .winner-modal-inner{background:rgba(20,10,40,.95);border:2px solid var(--amber);border-radius:2rem;padding:2.5rem 3rem;text-align:center;box-shadow:0 0 60px rgba(245,158,11,.4);animation:scaleIn .4s cubic-bezier(.175,.885,.32,1.275)}
              .winner-trophy{font-size:4rem;animation:bounce 1s infinite alternate}
              .winner-title{font-size:2rem;font-weight:900;margin:.5rem 0;text-transform:uppercase}
              .winner-sub{color:#ccc;margin-bottom:1.5rem}
              @keyframes bounce{from{transform:translateY(0)}to{transform:translateY(-12px)}}
              @keyframes fadeIn{from{opacity:0}to{opacity:1}}
              @keyframes scaleIn{from{transform:scale(.7)}to{transform:scale(1)}}
            `;
            document.head.appendChild(s);
        }
    }
    document.getElementById('winner-title').innerText = `${color.toUpperCase()} WINS!`;
    document.getElementById('winner-title').style.color = `var(--player-${color})`;
    modal.style.display = 'flex';
    if (svgDice) svgDice.celebrate(color);
}

// ── TURN UI ───────────────────────────────────────
function updateTurnUI() {
    if (!STATE.gameState) return;
    const rollBtn  = document.getElementById('roll-button');
    const statusEl = document.getElementById('game-status');

    if (STATE.gameState.winner) {
        statusEl.innerText = `${STATE.gameState.winner.toUpperCase()} WINS!`;
        statusEl.style.color = `var(--player-${STATE.gameState.winner})`;
        rollBtn.disabled = true;
        return;
    }

    const turnOrder = STATE.gameState.turnOrder || PLAYERS;
    const currentPlayer = turnOrder[STATE.gameState.currentPlayerIndex];
    const myTurn = (currentPlayer === STATE.myColor);

    if (myTurn) {
        statusEl.innerText = `Your Turn!`;
        rollBtn.disabled = STATE.gameState.hasRolled;
        if (!STATE.gameState.hasRolled && svgDice) svgDice.pulse();
    } else {
        statusEl.innerText = `${currentPlayer}'s Turn`;
        rollBtn.disabled = true;
        if (svgDice) svgDice.stopPulse();
    }
    statusEl.style.color = `var(--player-${currentPlayer})`;

    PLAYERS.forEach(color => {
        const card = document.getElementById(`player-${color}`);
        if (card) card.classList.toggle('active', color === currentPlayer);
    });

    // Update the dice numeric result for non-active player viewing
    if (STATE.gameState.hasRolled) {
        document.getElementById('dice-result').innerText = STATE.gameState.currentRoll;
    } else {
        document.getElementById('dice-result').innerText = '--';
    }
}

// ── TOAST ─────────────────────────────────────────
function showToast(msg, type = 'info') {
    let toast = document.getElementById('game-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'game-toast';
        document.body.appendChild(toast);
        if (!document.getElementById('toast-style')) {
            const s = document.createElement('style');
            s.id = 'toast-style';
            s.textContent = `
              #game-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
                padding:10px 22px;border-radius:999px;font-size:.9rem;font-weight:600;
                z-index:9999;transition:opacity .4s,transform .4s;pointer-events:none;
                opacity:0;transform:translateX(-50%) translateY(8px)}
              #game-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
              #game-toast.info{background:rgba(0,0,0,.85);color:#fbbf24;border:1px solid rgba(245,158,11,.4)}
              #game-toast.error{background:rgba(80,0,0,.9);color:#fca5a5;border:1px solid rgba(239,68,68,.4)}
              #game-toast.success{background:rgba(0,60,20,.9);color:#6ee7b7;border:1px solid rgba(16,185,129,.4)}
              #game-toast.capture{background:rgba(80,20,0,.9);color:#fdba74;border:1px solid rgba(249,115,22,.4)}
            `;
            document.head.appendChild(s);
        }
    }
    toast.className = `show ${type}`;
    toast.innerText = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.classList.remove('show'); }, 2800);
}

// ── LEAVE GAME EVENT LISTENERS ────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const btnLeaveDesktop = document.getElementById('btn-leave-game');
    const btnLeaveMobile = document.getElementById('btn-leave-game-mobile');
    const modalLeave = document.getElementById('leave-modal');
    const confirmYes = document.getElementById('confirm-leave-yes');
    const confirmNo = document.getElementById('confirm-leave-no');

    const showLeaveModal = () => {
        if(modalLeave) modalLeave.style.display = 'flex';
    };

    if (btnLeaveDesktop) btnLeaveDesktop.addEventListener('click', showLeaveModal);
    if (btnLeaveMobile) btnLeaveMobile.addEventListener('click', showLeaveModal);

    if (modalLeave && confirmYes && confirmNo) {
        confirmNo.addEventListener('click', () => {
            modalLeave.style.display = 'none';
        });

        confirmYes.addEventListener('click', () => {
            modalLeave.style.display = 'none';
            if (STATE.socket && STATE.uid) {
                STATE.socket.emit('leave_room', { uid: STATE.uid });
            }
            localStorage.removeItem('chowkabara_room');
            document.getElementById('landing-page').style.display = 'flex';
            document.getElementById('game-page').style.display = 'none';
            document.getElementById('waiting-room').style.display = 'none';
            STATE.roomId = '';
            STATE.gameState = null;
        });
    }

    const btnCopy = document.getElementById('btn-copy-room');
    if (btnCopy) {
        btnCopy.addEventListener('click', () => {
            const roomId = document.getElementById('display-room-id').innerText;
            if (roomId && roomId !== '------') {
                navigator.clipboard.writeText(roomId).then(() => {
                    showToast('📋 Room code copied!', 'success');
                }).catch(err => {
                    const el = document.createElement('textarea');
                    el.value = roomId;
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                    showToast('📋 Room code copied!', 'success');
                });
            }
        });
    }
});

// ── START ─────────────────────────────────────────
window.onload = initApp;

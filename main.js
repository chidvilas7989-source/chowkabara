const PLAYERS = ['blue', 'red', 'green', 'yellow'];
const SAFE_SQUARES = [3, 21, 27, 45, 10, 22, 26, 38, 17, 23, 25, 31, 24];

const PATHS = {
    blue: {
        outer: [45, 44, 43, 42, 35, 28, 21, 14, 7, 0, 1, 2, 3, 4, 5, 6, 13, 20, 27, 34, 41, 48, 47, 46],
        mid: [38, 37, 36, 29, 22, 15, 8, 9, 10, 11, 12, 19, 26, 33, 40, 39],
        inner: [31, 30, 23, 16, 17, 18, 25, 32],
        center: [24]
    },
    green: {
        outer: [3, 4, 5, 6, 13, 20, 27, 34, 41, 48, 47, 46, 45, 44, 43, 42, 35, 28, 21, 14, 7, 0, 1, 2],
        mid: [10, 11, 12, 19, 26, 33, 40, 39, 38, 37, 36, 29, 22, 15, 8, 9],
        inner: [17, 18, 25, 32, 31, 30, 23, 16],
        center: [24]
    },
    red: {
        outer: [21, 14, 7, 0, 1, 2, 3, 4, 5, 6, 13, 20, 27, 34, 41, 48, 47, 46, 45, 44, 43, 42, 35, 28],
        mid: [22, 15, 8, 9, 10, 11, 12, 19, 26, 33, 40, 39, 38, 37, 36, 29],
        inner: [23, 16, 17, 18, 25, 32, 31, 30],
        center: [24]
    },
    yellow: {
        outer: [27, 34, 41, 48, 47, 46, 45, 44, 43, 42, 35, 28, 21, 14, 7, 0, 1, 2, 3, 4, 5, 6, 13, 20],
        mid: [26, 33, 40, 39, 38, 37, 36, 29, 22, 15, 8, 9, 10, 11, 12, 19],
        inner: [25, 32, 31, 30, 23, 16, 17, 18],
        center: [24]
    }
};

const EXTRA_TURN_ROLLS = [1, 5, 6];
const ENTRY_ROLLS = [6];

let STATE = {
    socket: null,
    uid: localStorage.getItem('chowkabara_uid') || '',
    roomId: '',
    playerName: localStorage.getItem('chowkabara_name') || '',
    myColor: null, // Assigned by server
    gameState: null
};

// ==========================================
// FIREBASE & SOCKET.IO INIT
// ==========================================
function initApp() {
    if (window.onAuthStateChanged) {
        window.onAuthStateChanged(window.firebaseAuth, (user) => {
            if (user) {
                STATE.uid = user.uid;
                localStorage.setItem('chowkabara_uid', user.uid);
                document.getElementById('auth-status').innerText = "Connected to Server";
                document.getElementById('auth-status').style.color = "#10B981";
                document.getElementById('lobby-controls').style.display = "block";
                
                if (STATE.playerName) {
                    document.getElementById('player-name').value = STATE.playerName;
                }
                
                connectSocket();
            } else {
                window.signInAnonymously(window.firebaseAuth).catch(err => {
                    console.error("Auth Error", err);
                    document.getElementById('auth-status').innerText = "Authentication Failed";
                });
            }
        });
    } else {
        document.getElementById('auth-status').innerText = "Firebase not configured. Check environment variables.";
    }
}

function connectSocket() {
    STATE.socket = io();

    STATE.socket.on('connect', () => {
        console.log("Socket connected");
        // Try to rejoin if we have a room saved
        const savedRoom = localStorage.getItem('chowkabara_room');
        if (savedRoom && STATE.uid) {
            STATE.socket.emit('rejoin_room', { uid: STATE.uid });
        }
    });

    STATE.socket.on('room_created', async (data) => {
        enterWaitingRoom(data.room);
        
        // Save to Firestore Database
        if (window.firebaseDb) {
            try {
                await window.setDoc(window.doc(window.firebaseDb, "rooms", data.room.id), {
                    roomId: data.room.id,
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

    STATE.socket.on('room_joined', async (data) => {
        enterWaitingRoom(data.room);
        if (data.rejoined && data.room.status === 'playing') {
            enterGame(data.room);
        } else if (!data.rejoined) {
            // Update Firestore with new player
            if (window.firebaseDb) {
                try {
                    await window.updateDoc(window.doc(window.firebaseDb, "rooms", data.room.id), {
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

    STATE.socket.on('player_joined', (data) => {
        updatePlayersList(data.room);
    });

    STATE.socket.on('game_started', (data) => {
        enterGame(data.room);
    });

    STATE.socket.on('game_state_updated', (data) => {
        STATE.gameState = data.gameState;
        syncUIWithState();
    });

    STATE.socket.on('error', (data) => {
        alert("Error: " + data.message);
    });
}

// ==========================================
// LOBBY UI
// ==========================================
document.getElementById('btn-create').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim() || 'Player';
    STATE.playerName = name;
    localStorage.setItem('chowkabara_name', name);
    STATE.socket.emit('create_room', { name, uid: STATE.uid });
});

document.getElementById('btn-join').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim() || 'Player';
    const room_id = document.getElementById('join-room-id').value.trim().toUpperCase();
    if (!room_id) return alert("Enter a room code");
    
    STATE.playerName = name;
    localStorage.setItem('chowkabara_name', name);
    STATE.socket.emit('join_room', { name, uid: STATE.uid, room_id });
});

document.getElementById('btn-start').addEventListener('click', () => {
    STATE.socket.emit('start_game', { room_id: STATE.roomId });
});

function enterWaitingRoom(room) {
    STATE.roomId = room.id;
    localStorage.setItem('chowkabara_room', room.id);
    
    document.getElementById('lobby-controls').style.display = 'none';
    document.getElementById('waiting-room').style.display = 'block';
    document.getElementById('display-room-id').innerText = room.id;
    
    updatePlayersList(room);
}

function updatePlayersList(room) {
    const ul = document.getElementById('players-ul');
    ul.innerHTML = '';
    
    let isCreator = false;
    room.players.forEach((p, index) => {
        const li = document.createElement('li');
        li.innerText = `${p.name} (${p.color})`;
        li.style.color = `var(--player-${p.color})`;
        if (!p.online) li.style.opacity = '0.5';
        ul.appendChild(li);
        
        if (p.uid === STATE.uid) {
            STATE.myColor = p.color;
            if (index === 0) isCreator = true;
        }
    });
    
    if (isCreator && room.players.length >= 2) {
        document.getElementById('btn-start').style.display = 'block';
    } else {
        document.getElementById('btn-start').style.display = 'none';
    }
}

// ==========================================
// GAME UI & LOGIC
// ==========================================
function enterGame(room) {
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('game-page').style.display = 'flex';
    document.getElementById('in-game-room').innerText = room.id;
    document.getElementById('player-role').innerText = STATE.myColor;
    document.getElementById('player-role').style.color = `var(--player-${STATE.myColor})`;
    
    STATE.gameState = room.gameState;
    initBoardUI();
    syncUIWithState();
}

function initBoardUI() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    for (let i = 0; i < 49; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = `cell-${i}`;
        if (SAFE_SQUARES.includes(i)) {
            cell.classList.add('safe');
            if (i === 24) {
                cell.classList.add('center');
            }
        }
        board.appendChild(cell);
    }

    // Initialize DOM tokens
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
            homeDiv.appendChild(token);
        }
    });
}

function syncUIWithState() {
    // Sync tokens
    PLAYERS.forEach(color => {
        for (let i = 0; i < 6; i++) {
            updateTokenPositionUI(color, i);
        }
    });
    
    updateTurnUI();
}

function updateTokenPositionUI(color, tokenIndex) {
    const tokenEl = document.getElementById(`token-${color}-${tokenIndex}`);
    const state = STATE.gameState.tokens[color][tokenIndex];
    
    if (state.finished) {
        tokenEl.style.display = 'none';
        return;
    }
    
    if (state.layer === 'home') {
        document.getElementById(`home-${color}`).appendChild(tokenEl);
    } else {
        const cellId = PATHS[color][state.layer][state.index];
        document.getElementById(`cell-${cellId}`).appendChild(tokenEl);
    }

    if (state.hasKilled) {
        tokenEl.classList.add('has-killed');
    } else {
        tokenEl.classList.remove('has-killed');
    }
}

function isMyTurn() {
    return PLAYERS[STATE.gameState.currentPlayerIndex] === STATE.myColor;
}

document.getElementById('roll-button').addEventListener('click', () => {
    if (!isMyTurn() || STATE.gameState.hasRolled || STATE.gameState.winner) return;

    let rollValue = Math.floor(Math.random() * 6) + 1;
    
    STATE.gameState.currentRoll = rollValue;
    STATE.gameState.hasRolled = true;
    STATE.gameState.extraTurn = EXTRA_TURN_ROLLS.includes(rollValue);

    const rollBtn = document.getElementById('roll-button');
    const diceRes = document.getElementById('dice-result');
    rollBtn.disabled = true;
    
    // Broadcast roll to others immediately to show animation? Just send state at end of animation.
    
    let blinks = 0;
    const interval = setInterval(() => {
        diceRes.innerText = Math.floor(Math.random() * 6) + 1;
        blinks++;
        if (blinks > 10) {
            clearInterval(interval);
            diceRes.innerText = rollValue;
            diceRes.style.color = 'var(--accent)';
            setTimeout(() => { diceRes.style.color = ''; }, 500);
            
            checkValidMovesLocally();
            broadcastState(); // Tell others we rolled
        }
    }, 50);
});

function broadcastState() {
    STATE.socket.emit('sync_game_state', {
        room_id: STATE.roomId,
        gameState: STATE.gameState
    });
    updateTurnUI(); // update my own UI
}

function checkValidMovesLocally() {
    const color = STATE.myColor;
    const roll = STATE.gameState.currentRoll;
    let hasValidMove = false;

    document.querySelectorAll('.token').forEach(t => t.classList.remove('playable'));

    for (let i = 0; i < 6; i++) {
        const token = STATE.gameState.tokens[color][i];
        if (token.finished) continue;

        if (token.layer === 'home') {
            if (ENTRY_ROLLS.includes(roll)) {
                hasValidMove = true;
                document.getElementById(`token-${color}-${i}`).classList.add('playable');
            }
        } else {
            if (canMove(token, color, roll)) {
                hasValidMove = true;
                document.getElementById(`token-${color}-${i}`).classList.add('playable');
            }
        }
    }

    if (!hasValidMove) {
        setTimeout(() => {
            endTurnLocally();
        }, 1500);
    }
}

function canMove(tokenState, color, roll) {
    const { layer, index } = tokenState;
    if (layer === 'outer') return true; 
    if (layer === 'mid') return true;
    if (layer === 'inner') {
        const pathLen = PATHS[color].inner.length;
        if (index + roll <= pathLen) {
            return true;
        }
        return false;
    }
    return false;
}

function handleTokenClick(color, index) {
    if (!isMyTurn() || !STATE.gameState.hasRolled || STATE.gameState.winner) return;
    
    const tokenEl = document.getElementById(`token-${color}-${index}`);
    if (!tokenEl.classList.contains('playable')) return;

    const tokenState = STATE.gameState.tokens[color][index];
    const roll = STATE.gameState.currentRoll;
    
    document.querySelectorAll('.token').forEach(t => t.classList.remove('playable'));

    if (tokenState.layer === 'home') {
        tokenState.layer = 'outer';
        tokenState.index = 0;
        updateTokenPositionUI(color, index);
        handleCaptureLocally(color, index);
    } else {
        moveTokenLocally(color, index, roll);
    }
}

function moveTokenLocally(color, tokenIndex, roll) {
    const state = STATE.gameState.tokens[color][tokenIndex];
    let newIndex = state.index + roll;

    if (state.layer === 'outer') {
        const len = PATHS[color].outer.length;
        if (newIndex >= len) {
            if (state.hasKilled) {
                state.layer = 'mid';
                state.index = newIndex - len;
            } else {
                state.index = newIndex % len;
            }
        } else {
            state.index = newIndex;
        }
    } 
    else if (state.layer === 'mid') {
        const len = PATHS[color].mid.length;
        if (newIndex >= len) {
            state.layer = 'inner';
            state.index = newIndex - len;
        } else {
            state.index = newIndex;
        }
    }
    else if (state.layer === 'inner') {
        const len = PATHS[color].inner.length;
        if (newIndex === len) {
            state.layer = 'center';
            state.index = 0;
            state.finished = true;
            document.getElementById(`token-${color}-${tokenIndex}`).style.display = 'none';
            checkWinConditionLocally(color);
        } else {
            state.index = newIndex;
        }
    }

    if (!state.finished) {
        updateTokenPositionUI(color, tokenIndex);
        handleCaptureLocally(color, tokenIndex);
    }

    if (!STATE.gameState.winner) {
        setTimeout(endTurnLocally, 500);
    } else {
        broadcastState();
    }
}

function handleCaptureLocally(color, tokenIndex) {
    const state = STATE.gameState.tokens[color][tokenIndex];
    const cellId = PATHS[color][state.layer][state.index];
    
    if (SAFE_SQUARES.includes(cellId)) return;

    PLAYERS.forEach(opponent => {
        if (opponent === color) return;
        
        for (let i = 0; i < 6; i++) {
            const oppState = STATE.gameState.tokens[opponent][i];
            if (oppState.layer !== 'home' && !oppState.finished) {
                const oppCellId = PATHS[opponent][oppState.layer][oppState.index];
                if (oppCellId === cellId) {
                    oppState.layer = 'home';
                    oppState.index = -1;
                    oppState.hasKilled = false; 
                    updateTokenPositionUI(opponent, i);
                    
                    state.hasKilled = true;
                    updateTokenPositionUI(color, tokenIndex); 
                    
                    STATE.gameState.extraTurn = true;
                    
                    const cellEl = document.getElementById(`cell-${cellId}`);
                    cellEl.style.backgroundColor = 'var(--player-red)';
                    setTimeout(() => { cellEl.style.backgroundColor = ''; }, 300);
                }
            }
        }
    });
}

function endTurnLocally() {
    if (STATE.gameState.winner) return;

    STATE.gameState.hasRolled = false;
    document.getElementById('dice-result').innerText = '--';

    if (!STATE.gameState.extraTurn) {
        STATE.gameState.currentPlayerIndex = (STATE.gameState.currentPlayerIndex + 1) % 4;
    }
    
    STATE.gameState.extraTurn = false;
    broadcastState();
}

function checkWinConditionLocally(color) {
    const hasWon = STATE.gameState.tokens[color].every(t => t.finished);
    if (hasWon) {
        STATE.gameState.winner = color;
    }
}

function updateTurnUI() {
    if (!STATE.gameState) return;
    
    const rollBtn = document.getElementById('roll-button');
    const diceRes = document.getElementById('dice-result');
    const statusEl = document.getElementById('game-status');
    
    if (STATE.gameState.winner) {
        statusEl.innerText = `${STATE.gameState.winner.toUpperCase()} WINS!`;
        statusEl.style.color = `var(--player-${STATE.gameState.winner})`;
        rollBtn.disabled = true;
        return;
    }

    const currentPlayer = PLAYERS[STATE.gameState.currentPlayerIndex];
    
    if (STATE.gameState.hasRolled) {
        diceRes.innerText = STATE.gameState.currentRoll;
    } else {
        diceRes.innerText = '--';
    }

    if (currentPlayer === STATE.myColor) {
        statusEl.innerText = `Your Turn (${currentPlayer})`;
        rollBtn.disabled = STATE.gameState.hasRolled;
    } else {
        statusEl.innerText = `${currentPlayer}'s Turn`;
        rollBtn.disabled = true;
    }
    statusEl.style.color = `var(--player-${currentPlayer})`;

    PLAYERS.forEach(color => {
        const card = document.getElementById(`player-${color}`);
        if (color === currentPlayer) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
}

// Start
window.onload = initApp;

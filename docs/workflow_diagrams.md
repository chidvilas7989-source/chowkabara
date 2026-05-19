# Chowkabara Workflow Diagrams

> [!NOTE]
> A premium graphic flowchart of the game rules has been generated and saved directly in your artifacts folder as [chowkabara_flow_diagram.png](chowkabara_flow_diagram.png).

This document contains visual workflow diagrams representing the creators' flow, joined players' flow, piece lifecycles, and backend server architecture using Mermaid diagrams.

---

## 1. Creator's Game Flow Diagram

```mermaid
flowchart TD
    Start([Landing Page]) --> Input[Input name & select starting color]
    Input --> Create[Click 'Create Room']
    Create --> EmitCreate{{Emit 'create_room'}}
    EmitCreate --> WaitingRoom[Enter Waiting Room]
    WaitingRoom --> Share[Share Room ID with friends]
    WaitingRoom --> UpdateList[Observe player list join updates]
    UpdateList --> CheckPlayers{Players >= 2?}
    CheckPlayers -- No --> UpdateList
    CheckPlayers -- Yes --> ActivateBtn[Start Game button becomes active]
    ActivateBtn --> ClickStart[Click 'Start Game']
    ClickStart --> EmitStart{{Emit 'start_game'}}
    EmitStart --> GameScreen[Enter Game Screen]
    GameScreen --> FirstTurn[Play first turn starting round]
```

---

## 2. Piece Life Cycle Diagram

```mermaid
flowchart TD
    Home[Home Reserve Pool - index -1, layer home, hasKilled false] --> RollCheck{Is Roll equal to 6?}
    
    RollCheck -- No --> Home
    RollCheck -- Yes --> EntryStart[Enter Starting Square - index 0, layer outer]
    
    EntryStart --> MoveOuter[Advance index by rolled dice value]
    
    MoveOuter --> CaptureCheck{Lands on opponent cell and not a Safe Zone?}
    CaptureCheck -- Yes --> PerformCapture[Capture opponent token - Reset opponent to Home Pool and set hasKilled = true on active token]
    CaptureCheck -- No --> LapCheck{Has token completed full outer lap?}
    
    PerformCapture --> LapCheck
    
    LapCheck -- No --> MoveOuter
    LapCheck -- Yes --> CaptureQualify{Has token captured an opponent - hasKilled == true?}
    
    CaptureQualify -- No --> WrapAround[Wrap around outer ring start index - continue outer lap]
    WrapAround --> MoveOuter
    
    CaptureQualify -- Yes --> EnterMid[Enter Mid Ring - layer mid]
    
    EnterMid --> MoveMid[Advance index by rolled dice value]
    
    MoveMid --> MidLapCheck{Has token completed full mid lap?}
    MidLapCheck -- No --> MoveMid
    MidLapCheck -- Yes --> EnterInner[Enter Inner Ring - layer inner]
    
    EnterInner --> StepCalc{Is rolled dice greater than remaining steps to center?}
    
    StepCalc -- Yes --> ForfeitMove[Invalid Move - Leave the chance]
    StepCalc -- No --> MoveInner[Advance index by rolled dice value]
    
    MoveInner --> CenterCheck{Is index equal to 8?}
    CenterCheck -- No --> StepCalc
    CenterCheck -- Yes --> ConquerCenter[Conquer Center - layer center, finished = true]
```

---

## 3. Joined Player Flow Diagram

```mermaid
flowchart TD
    Start([Landing Page]) --> Input[Input name & select starting color]
    Input --> EnterCode[Input Room ID code]
    EnterCode --> Join[Click 'Join Room']
    Join --> EmitJoin{{Emit 'join_room'}}
    EmitJoin --> WaitingRoom[Enter Waiting Room]
    WaitingRoom --> Wait[Wait for Host to start]
    Wait --> GameStarted{Receive 'game_started' event?}
    GameStarted -- No --> Wait
    GameStarted -- Yes --> GameScreen[Enter Game Screen]
    GameScreen --> TurnWait[Wait for Turn Order rotation]
```

---

## 4. Full Server Lifecycle & Event Flow

```mermaid
sequenceDiagram
    autonumber
    actor Creator
    actor JoinedPlayer
    participant Server as Flask Game Server
    participant Storage as Rooms JSON Storage

    %% Room Creation
    Creator->>Server: emit("create_room", { name, color })
    Server->>Storage: Initialize Room State & empty Game State
    Server-->>Creator: emit("room_created", { room })

    %% Player Joins
    JoinedPlayer->>Server: emit("join_room", { name, room_id, color })
    Server->>Storage: Add player to Room
    Server-->>Creator: emit("player_joined", { room })
    Server-->>JoinedPlayer: emit("room_joined", { room })

    %% Game Start
    Creator->>Server: emit("start_game", { room_id })
    Server->>Server: Compute clockwise turnOrder starting with Creator
    Server->>Storage: Set status to "playing" & save state
    Server-->>Creator: emit("game_started", { room })
    Server-->>JoinedPlayer: emit("game_started", { room })

    %% Turn Execution
    rect rgb(20, 30, 40)
        Note over Creator, Server: Active Turn Execution Loop
        Creator->>Server: emit("sync_game_state", { room_id, gameState })
        Server->>Storage: Update game state JSON
        Server-->>JoinedPlayer: emit("game_state_updated", { gameState })
    end

    %% Reconnection / Session recovery
    JoinedPlayer->>Server: emit("rejoin_room", { uid })
    alt Room Exists
        Server-->>JoinedPlayer: emit("room_joined", { room, rejoined: true })
    else Room Deleted
        Server-->>JoinedPlayer: emit("rejoin_failed")
    end
```

---

## 5. Capture (Kill) Event & Token Reset Flow

> [!NOTE]
> A premium graphic flowchart of the capture event has been generated and saved directly in your artifacts folder as [chowkabara_capture_diagram.png](chowkabara_capture_diagram.png).

```mermaid
flowchart TD
    A[Token lands on cell occupied by opponent] --> B{Is cell a Safe Zone?}
    B -- Yes --> C[Tokens coexist peacefully in safe star/home/center]
    B -- No --> D[Capture Triggered]
    
    D --> E[Opponent Token State Update]
    E --> F[Set layer = home]
    F --> G[Set index = -1]
    G --> H[Set hasKilled = false Reset]
    H --> I[Move opponent token back to Owners Player Pool - Home Reserve]
    
    D --> J[Capturing Token State Update]
    J --> K[Set hasKilled = true]
    K --> L[Add white border and glow highlights to token in UI]
    
    D --> M[Game State Turn Update]
    M --> N[Set extraTurn = true - Extra roll awarded]
    N --> O[Show capture screen toast notification and flash cell red]
```

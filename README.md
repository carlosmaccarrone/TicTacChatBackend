[![Node.js CI](https://github.com/carlosmaccarrone/TicTacChatBackend/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosmaccarrone/TicTacChatBackend/actions/workflows/ci.yml)

# TicTacChat Backend 🚀

Backend server for **TicTacChat**, a real-time chat with Tic-Tac-Toe games using **Socket.IO** and Node.js.

---

## Description

This backend handles:

- User management and status (`idle` | `busy`)  
- Tic-Tac-Toe challenges between users
- Recent and private chat messages per game
- Restarting games
- Broadcasting the connected user list
- Real-time interaction with frontends

---

## Installation

Clone the repo and install dependencies:

```bash
git clone <repo-url>
cd TicTacChatBackend
npm install
```

---

## Running

# Development
```bash
node index.js
```

# Tests
```bash
npm test
```

---

## Socket Events

# User Handlers
- joinRoom(nickname, ack) → Join the lobby  
- logout(ack) → Disconnect user
- updateStatus(status) → Update user status
- forceDisconnect(ack) → Force disconnect
- disconnect → Native socket disconnect event

# PVP Handlers
- pvp:move({ index, symbol }) → Make a move
- pvp:requestRestart → Request game restart
- pvp:reportResult({ winner }) → Report game result
- pvp:leaveRoom({ nickname, voluntary }) → Leave a challenge
- pvp:message({ to, text }) → Send private message

---

License

MIT © 2025
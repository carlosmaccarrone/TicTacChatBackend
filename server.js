const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:3000', methods: ['GET', 'POST'] },
});

// ---------------- USUARIOS ----------------
const usersByNick = new Map();   // nickname -> socketId
const nickBySocket = new Map();  // socketId -> nickname
const usersStatus = new Map();   // nickname -> 'idle' | 'busy'
const challengesByPlayer = new Map(); // nickname -> challenge

// ---------------- MENSAJES ----------------
let recentMessages = [];

function addMessage(message) {
  const msgWithTime = { ...message, timestamp: Date.now() };
  recentMessages.push(msgWithTime);
  const oneHourAgo = Date.now() - 1000 * 60 * 60;
  const filtered = recentMessages.filter(m => m.timestamp > oneHourAgo);
  recentMessages.splice(0, recentMessages.length, ...filtered.slice(-10));
}

setInterval(() => {
  const oneHourAgo = Date.now() - 1000 * 60 * 60;
  const filtered = recentMessages.filter(m => m.timestamp > oneHourAgo);
  recentMessages.splice(0, recentMessages.length, ...filtered);
}, 1000 * 60 * 60);

// ---------------- CHALLENGES ----------------
const activeChallenges = new Map(); 
// clave = 'player1:player2', valor = { challenger, challenged, board, turn, symbols, winner, messages, timeoutId }

function getChallenge(nickname) {
  return Array.from(activeChallenges.values())
    .find(c => c.challenger === nickname || c.challenged === nickname);
}

function removeChallenge(challenge) {
  if (!challenge) return;
  clearTimeout(challenge.timeoutId);
  activeChallenges.delete(`${challenge.challenger}:${challenge.challenged}`);
  activeChallenges.delete(`${challenge.challenged}:${challenge.challenger}`);
  usersStatus.set(challenge.challenger, 'idle');
  usersStatus.set(challenge.challenged, 'idle');
  broadcastUserList();
}

// ---------------- HELPERS ----------------
function broadcastUserList() {
  const userList = Array.from(usersStatus.entries())
    .map(([nickname, status]) => ({ nickname, status }));
  io.emit('updateUserList', userList);
}

function removeUser(nickname) {
  const socketId = usersByNick.get(nickname);
  if (!socketId) return;
  const challenge = getChallenge(nickname);
  removeChallenge(challenge);

  usersByNick.delete(nickname);
  nickBySocket.delete(socketId);
  usersStatus.delete(nickname);

  broadcastUserList();
  console.log(`[REMOVE USER] ${nickname} (${socketId})`);
}

// ---------------- SOCKET ----------------
io.on('connection', (socket) => {
  console.log('New socket connected:', socket.id);

  // ---------------- LOGIN ----------------
  socket.on('joinRoom', (nickname, ack) => {
    if (!nickname || typeof nickname !== 'string') return ack?.({ ok: false, error: 'Nickname required' });
    if (usersByNick.has(nickname)) return ack?.({ ok: false, error: 'Nickname in use' });

    usersByNick.set(nickname, socket.id);
    nickBySocket.set(socket.id, nickname);
    usersStatus.set(nickname, 'idle');
    broadcastUserList();

    socket.emit('chat:recentMessages', recentMessages);
    ack?.({ ok: true });
    console.log(`[JOIN] ${nickname} (${socket.id})`);
  });

  // ---------------- LOGOUT ----------------
  socket.on('logout', (ack) => {
    const nickname = nickBySocket.get(socket.id);
    if (nickname) removeUser(nickname);
    ack?.({ ok: true });
  });

  // ---------------- CHAT ----------------
  socket.on('chat:newMessage', (msg) => {
    const nickname = nickBySocket.get(socket.id);
    if (!nickname) return;
    const message = { from: nickname, text: msg };
    addMessage(message);
    io.emit('chat:newMessage', message);
  });

  socket.on('requestRecentMessages', () => {
    socket.emit('chat:recentMessages', recentMessages);
  });

  // ---------------- USER LIST ----------------
  socket.on('requestUserList', () => {
    const userList = Array.from(usersStatus.entries())
      .map(([nickname, status]) => ({ nickname, status }));
    socket.emit('updateUserList', userList);
  });

  // ---------------- CHALLENGE ----------------
  socket.on('challenge:send', ({ toNickname }, ack) => {
    const fromNickname = nickBySocket.get(socket.id);
    if (!fromNickname) return ack?.({ ok: false, error: 'Unknown user' });

    if (usersStatus.get(fromNickname) !== 'idle' || usersStatus.get(toNickname) !== 'idle') {
      return ack?.({ ok: false, error: 'User busy' });
    }

    const challengeId = `${fromNickname}:${toNickname}`;
    const reverseId = `${toNickname}:${fromNickname}`;
    const timeoutId = setTimeout(() => {
      const challenge = activeChallenges.get(challengeId);
      removeChallenge(challenge);
      io.to(usersByNick.get(toNickname)).emit('challenge:timeout', { from: fromNickname });
    }, 10000);

    const symbols = Math.random() < 0.5
      ? { challenger: 'X', challenged: 'O' }
      : { challenger: 'O', challenged: 'X' };

    const challengeObj = {
      challenger: fromNickname,
      challenged: toNickname,
      board: Array(9).fill(null),
      turn: symbols.challenger,
      symbols,
      winner: null,
      messages: [],
      timeoutId,
    };

    activeChallenges.set(challengeId, challengeObj);
    activeChallenges.set(reverseId, challengeObj);

    usersStatus.set(fromNickname, 'busy');
    usersStatus.set(toNickname, 'busy');
    broadcastUserList();

    io.to(usersByNick.get(toNickname)).emit('challenge:received', { from: fromNickname, to: toNickname });
    ack?.({ ok: true });
    console.log(`[CHALLENGE SENT] ${fromNickname} -> ${toNickname}`);
  });

  socket.on('challenge:response', ({ accepted }) => {
    const answerNickname = nickBySocket.get(socket.id);
    console.log('[LOG] challenge:response triggered');
    console.log('Socket ID:', socket.id);
    console.log('Nickname answering:', answerNickname);
    console.log('Accepted:', accepted);

    if (!answerNickname) {
      console.log('[LOG] No nickname found for this socket. Aborting.');
      return;
    }

    const challenge = getChallenge(answerNickname);
    console.log('[LOG] Retrieved challenge:', challenge);

    if (!challenge) {
      console.log('[LOG] No active challenge found for', answerNickname);
      return;
    }

    console.log('[LOG] Clearing challenge timeout:', challenge.timeoutId);
    clearTimeout(challenge.timeoutId);

    if (!accepted) {
      console.log('[LOG] Challenge rejected. Removing challenge...');
      removeChallenge(challenge);
      return;
    }

    // Emitir inicio de PvP a ambos correctamente
    const sockets = {
      [challenge.challenger]: usersByNick.get(challenge.challenger),
      [challenge.challenged]: usersByNick.get(challenge.challenged),
    };

    console.log('[LOG] Sockets to emit pvp:start:', sockets);
    console.log('[LOG] Challenge symbols:', challenge.symbols);

    Object.entries(sockets).forEach(([nick, sockId]) => {
      console.log('[LOG] Processing nickname:', nick);
      console.log('Socket ID for', nick, ':', sockId);

      if (!sockId) {
        console.log('[LOG] No socket ID for', nick, 'skipping emit');
        return;
      }

      const payload = {
        board: challenge.board,
        turn: challenge.turn,
        opponent: nick === challenge.challenger ? challenge.challenged : challenge.challenger,
        mySymbol: challenge.symbols[nick === challenge.challenger ? 'challenger' : 'challenged'],
      };

      console.log('[LOG] Emitting pvp:start payload to', nick, ':', payload);
      io.to(sockId).emit('pvp:start', payload);

      challengesByPlayer.set(challenge.challenger, challenge);
      challengesByPlayer.set(challenge.challenged, challenge);      
    });

    console.log(`[LOG] Challenge accepted: ${challenge.challenger} vs ${challenge.challenged}`);
  });


  // ---------------- PvP ----------------
  socket.on('pvp:move', ({ index, symbol }) => {
    const from = nickBySocket.get(socket.id);
    if (!from) return;

    const challenge = getChallenge(from);
    if (!challenge) return;

    if (challenge.turn !== symbol) return;
    if (challenge.board[index]) return;

    challenge.board[index] = symbol;

    // Alternar turno
    challenge.turn = challenge.turn === 'X' ? 'O' : 'X';

    const other = challenge.challenger === from ? challenge.challenged : challenge.challenger;
    const otherSocket = usersByNick.get(other);
    if (!otherSocket) return;

    const payload = { newBoard: challenge.board, nextTurn: challenge.turn };
    io.to(otherSocket).emit('pvp:boardUpdate', payload);
    socket.emit('pvp:boardUpdate', payload);
  });

  socket.on('pvp:requestRestart', () => {
    const nick = nickBySocket.get(socket.id);
    if (!nick) return;
    const challenge = getChallenge(nick);
    if (!challenge) return;

    if (!challenge.restartReady) {
      challenge.restartReady = new Map();
    }
    challenge.restartReady.set(nick, true);

    const chal = challenge.challenger;
    const chd = challenge.challenged;
    const chalReady = !!challenge.restartReady.get(chal);
    const chdReady = !!challenge.restartReady.get(chd);

    // informar estado de ready a ambos (opcional, UI puede mostrar "waiting")
    const chalSock = usersByNick.get(chal);
    const chdSock = usersByNick.get(chd);
    const statusPayload = { challengerReady: chalReady, challengedReady: chdReady };
    if (chalSock) io.to(chalSock).emit('pvp:restartPending', statusPayload);
    if (chdSock) io.to(chdSock).emit('pvp:restartPending', statusPayload);

    // si ambos confirmaron: reiniciamos
    if (chalReady && chdReady) {
      // determinar primer turno:
      let firstTurn;
      if (challenge.lastWinner && challenge.lastWinner !== 'draw') {
        firstTurn = challenge.lastWinner; // el ganador empieza
      } else if (challenge.lastWinner === 'draw') {
        firstTurn = Math.random() < 0.5 ? 'X' : 'O';
      } else {
        // fallback: retador (challenger) empieza
        firstTurn = challenge.symbols.challenger;
      }

      challenge.board = Array(9).fill(null);
      challenge.turn = firstTurn;
      challenge.winner = null;
      // limpiar restart flags
      challenge.restartReady = new Map();
      challenge.lastWinner = null;

      // emitir restartConfirmed a ambos con sus respectivos mySymbol
      if (chalSock) {
        io.to(chalSock).emit('pvp:restartConfirmed', {
          board: challenge.board,
          turn: challenge.turn,
          mySymbol: challenge.symbols.challenger,
        });
      }
      if (chdSock) {
        io.to(chdSock).emit('pvp:restartConfirmed', {
          board: challenge.board,
          turn: challenge.turn,
          mySymbol: challenge.symbols.challenged,
        });
      }
      console.log('[SERVER] Restart confirmed (both ready). firstTurn=', firstTurn);
    }
  });

  socket.on('pvp:reportResult', ({ winner }) => {
    const nick = nickBySocket.get(socket.id);
    if (!nick) return;
    const challenge = getChallenge(nick);
    if (!challenge) return;
    console.log('[SERVER] pvp:reportResult from', nick, 'winner:', winner);
    challenge.lastWinner = winner || null; // 'X' | 'O' | 'draw' | null
  });

socket.on('pvp:leaveRoom', ({ symbol }) => {
  const leavingPlayer = symbol; // aquí debe ser el nickname real
  const challenge = challengesByPlayer.get(leavingPlayer);

  if (!challenge) {
    // No estaba en ningún challenge, igual lo ponemos idle
    usersStatus.set(leavingPlayer, 'idle');
    return;
  }

  const { challenger, challenged, timeoutId } = challenge;
  const otherPlayer = leavingPlayer === challenger ? challenged : challenger;

  // Marcar ambos jugadores como idle
  usersStatus.set(leavingPlayer, 'idle');
  usersStatus.set(otherPlayer, 'idle');

  // Emitir a ambos que vuelvan al lobby
  const leavingSocket = usersByNick.get(leavingPlayer);
  const otherSocket = usersByNick.get(otherPlayer);

  if (leavingSocket) leavingSocket.emit('pvp:forceLobby');
  if (otherSocket) otherSocket.emit('pvp:forceLobby');

  // Limpiar challenge y activeChallenges
  challengesByPlayer.delete(leavingPlayer);
  challengesByPlayer.delete(otherPlayer);
  activeChallenges.delete(`${challenger}:${challenged}`);
  activeChallenges.delete(`${challenged}:${challenger}`);

  // Limpiar timeout si existía
  if (timeoutId) clearTimeout(timeoutId);

  // Actualizar lista de usuarios a todos los clientes conectados
  broadcastUserList();
});



  // ---------------- PvP: Mensajes privados ----------------
  socket.on('pvp:message', ({ text }) => {
    const from = nickBySocket.get(socket.id);
    if (!from) return;

    const challenge = getChallenge(from);
    if (!challenge) return;

    const to = challenge.challenger === from ? challenge.challenged : challenge.challenger;
    const targetSocketId = usersByNick.get(to);
    if (!targetSocketId) return;

    challenge.messages.push({ from, text, timestamp: Date.now() });
    io.to(targetSocketId).emit('pvp:message', { from, text });
    socket.emit('pvp:message', { from, text });
  });

  // ---------------- STATUS ----------------
  socket.on('updateStatus', (status) => {
    const nickname = nickBySocket.get(socket.id);
    if (!nickname) return;
    usersStatus.set(nickname, status);
    broadcastUserList();
  });

  // ---------------- FORCE DISCONNECT ----------------
  socket.on('forceDisconnect', (ack) => {
    const nickname = nickBySocket.get(socket.id);
    if (nickname) removeUser(nickname);
    socket.disconnect();
    ack?.({ ok: true });
  });

  // ---------------- DISCONNECT ----------------
  socket.on('disconnect', () => {
    const nickname = nickBySocket.get(socket.id);
    if (nickname) removeUser(nickname);
    console.log(`[DISCONNECT] ${nickname || socket.id}`);
  });
});

server.listen(3001, () => {
  console.log('Server listening on port 3001');
});

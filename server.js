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
// clave = 'player1:player2', valor = { challenger, challenged, board, turn, symbols, winner, messages }

function getChallenge(nickname) {
  return Array.from(activeChallenges.values())
    .find(c => c.challenger === nickname || c.challenged === nickname);
}

function removeChallenge(challenge) {
  if (!challenge) return;
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

function resetChallengeMessages(challenge) {
  if (!challenge) return;
  challenge.messages = [];
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
      messages: []
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

    if (!answerNickname) return;

    const challenge = getChallenge(answerNickname);

    if (!challenge) return;

    if (!accepted) {
      const other =
        challenge.challenger === answerNickname
          ? challenge.challenged
          : challenge.challenger;

      const otherSocket = usersByNick.get(other);
      if (otherSocket) {
        io.to(otherSocket).emit('challenge:closed', {
          reason: 'declined',
          by: answerNickname,
        });
      }

      io.to(socket.id).emit('challenge:closed', {
        reason: 'self-declined',
        by: answerNickname,
      });

      resetChallengeMessages(challenge);
      removeChallenge(challenge);
      return;
    }
    
    if (accepted) {
      resetChallengeMessages(challenge);
      const newChallenge = {
        challenger: challenge.challenger,
        challenged: challenge.challenged,
        board: Array(9).fill(null),
        turn: challenge.symbols.challenger, // o lógica de primer turno
        symbols: challenge.symbols,
        winner: null,
        messages: []
      };

      const sockets = {
        [newChallenge.challenger]: usersByNick.get(newChallenge.challenger),
        [newChallenge.challenged]: usersByNick.get(newChallenge.challenged),
      };

      Object.entries(sockets).forEach(([nick, sockId]) => {
        if (!sockId) return;

        const payload = {
          board: newChallenge.board,
          turn: newChallenge.turn,
          opponent: nick === newChallenge.challenger ? newChallenge.challenged : newChallenge.challenger,
          mySymbol: newChallenge.symbols[nick === newChallenge.challenger ? 'challenger' : 'challenged'],
        };

        io.to(sockId).emit('pvp:start', payload);

        // Guardar la referencia nueva, limpia
        challengesByPlayer.set(newChallenge.challenger, newChallenge);
        challengesByPlayer.set(newChallenge.challenged, newChallenge);
      });

      console.log(`[LOG] Challenge accepted: ${newChallenge.challenger} vs ${newChallenge.challenged}`);
    }
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

  socket.on('pvp:leaveRoom', ({ nickname, voluntary }) => {
    if (!nickname) return;

    const challenge = challengesByPlayer.get(nickname);

    if (!challenge) {
      // No estaba en ningún challenge, igual lo ponemos idle
      usersStatus.set(nickname, 'idle');
      broadcastUserList();
      return;
    }

    const { challenger, challenged } = challenge;
    const otherPlayer = nickname === challenger ? challenged : challenger;

    // Marcar ambos como idle
    usersStatus.set(nickname, 'idle');
    usersStatus.set(otherPlayer, 'idle');

    // Emitir a ambos que vuelvan al lobby
    const socketIdLeaving = usersByNick.get(nickname);
    if (!voluntary) {
      usersByNick.delete(nickname);
      nickBySocket.delete(socketIdLeaving);
      usersStatus.delete(nickname);
    }
    const socketIdOther = usersByNick.get(otherPlayer);

    if (socketIdLeaving) io.to(socketIdLeaving).emit('pvp:forceLobby');
    if (socketIdOther) io.to(socketIdOther).emit('pvp:forceLobby');

    // Limpiar mensajes privados de este challenge
    resetChallengeMessages(challenge);

    // Limpiar challenge
    challengesByPlayer.delete(nickname);
    challengesByPlayer.delete(otherPlayer);
    activeChallenges.delete(`${challenger}:${challenged}`);
    activeChallenges.delete(`${challenged}:${challenger}`);

    broadcastUserList();
    console.log(`[SERVER] ${nickname} y ${otherPlayer} volvieron al lobby`);
  });



  // ---------------- PvP: Mensajes privados ----------------
  socket.on('pvp:message', ({ to, text }) => {
    const from = nickBySocket.get(socket.id);
    if (!from) return;

    const targetSocketId = usersByNick.get(to);
    if (!targetSocketId) return;

    // Guardar en challenge
    const challenge = getChallenge(from);
    if (challenge) {
      challenge.messages.push({ from, to, text, timestamp: Date.now() });
    }

    // Emitir a oponente
    io.to(targetSocketId).emit('pvp:message', { from, text });

    // Emitir al mismo socket para que vea su propio mensaje (opcional)
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

const { activeChallenges, getChallenge, resetChallengeMessages } = require('../services/challengeService');
const { usersByNick, nickBySocket, usersStatus, challengesByPlayer, getAllUsers } = require('../services/userService');
const { broadcastUserList } = require('../helpers/socketHelpers');

module.exports = function registerPvpHandlers(io, socket) {
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
      broadcastUserList(io, getAllUsers);
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

    broadcastUserList(io, getAllUsers);
    console.log(`[SERVER] ${nickname} y ${otherPlayer} volvieron al lobby`);
  });

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
};
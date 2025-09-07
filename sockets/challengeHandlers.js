const { activeChallenges, getChallenge, resetChallengeMessages } = require('../services/challengeService');
const { broadcastUserList } = require('../helpers/socketHelpers');
const { getAllUsers } = require('../services/userService');
const { usersByNick,
			  nickBySocket,
			  usersStatus,
			  handleChallengeRemoval,
			  challengesByPlayer
			} = require('../services/userService');


module.exports = function registerChallengeHandlers(io, socket) {
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
    broadcastUserList(io, getAllUsers);

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
      handleChallengeRemoval(challenge, io);
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
};
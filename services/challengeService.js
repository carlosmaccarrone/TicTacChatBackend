const activeChallenges = new Map(); 
// key = 'player1:player2', value = { challenger, challenged, board, turn, symbols, winner, messages }

function getChallenge(nickname) {
  return Array.from(activeChallenges.values())
    .find(c => c.challenger === nickname || c.challenged === nickname);
}

function addChallenge(challenger, challenged, data = {}) {
  const challenge = {
    challenger,
    challenged,
    board: data.board ?? Array(9).fill(null),
    turn: data.turn ?? challenger,
    symbols: data.symbols ?? { [challenger]: 'X', [challenged]: 'O' },
    winner: null,
    messages: [],
  };

  activeChallenges.set(`${challenger}:${challenged}`, challenge);
  activeChallenges.set(`${challenged}:${challenger}`, challenge);

  return challenge;
}

function removeChallenge(challenge) {
  if (!challenge) return;
  activeChallenges.delete(`${challenge.challenger}:${challenge.challenged}`);
  activeChallenges.delete(`${challenge.challenged}:${challenge.challenger}`);
}

function resetChallengeMessages(challenge) {
  if (!challenge) return;
  challenge.messages = [];
}

function getAllChallenges() {
  return Array.from(activeChallenges.values());
}

module.exports = {
  activeChallenges,
  getChallenge,
  addChallenge,
  removeChallenge,
  resetChallengeMessages,
  getAllChallenges
};
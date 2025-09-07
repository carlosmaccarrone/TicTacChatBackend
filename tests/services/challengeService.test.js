const {
  activeChallenges,
  getChallenge,
  addChallenge,
  removeChallenge,
  resetChallengeMessages,
  getAllChallenges
} = require('../../services/challengeService');

describe('challengeService', () => {
  beforeEach(() => {
    activeChallenges.clear();
  });

  test('should add a new challenge', () => {
    const challenge = addChallenge('charly', 'pipita');

    expect(challenge.challenger).toBe('charly');
    expect(challenge.challenged).toBe('pipita');
    expect(challenge.board).toHaveLength(9);
    expect(challenge.turn).toBe('charly');
    expect(challenge.symbols).toEqual({ charly: 'X', pipita: 'O' });

    expect(activeChallenges.size).toBe(2);
  });

  test('should get a challenge by nickname', () => {
    addChallenge('charly', 'pipita');
    const found = getChallenge('pipita');

    expect(found.challenger).toBe('charly');
    expect(found.challenged).toBe('pipita');
  });

  test('should reset challenge messages', () => {
    const challenge = addChallenge('charly', 'pipita');
    challenge.messages.push('Hello');

    resetChallengeMessages(challenge);
    expect(challenge.messages).toHaveLength(0);
  });

  test('should remove a challenge', () => {
    const challenge = addChallenge('charly', 'pipita');

    removeChallenge(challenge);

    expect(activeChallenges.size).toBe(0);
    expect(getChallenge('charly')).toBeUndefined();
  });
});
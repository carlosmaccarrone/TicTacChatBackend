const challengeService = require('../../services/challengeService');
const registerPvpHandlers = require('../../sockets/pvpHandlers');
const userService = require('../../services/userService');

describe('pvpHandlers minimal tests', () => {
  let ioMock;
  let socketMock;

  beforeEach(() => {
    userService.usersByNick.clear();
    userService.nickBySocket.clear();
    userService.usersStatus.clear();
    userService.challengesByPlayer.clear();
    challengeService.activeChallenges.clear();

    ioMock = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    socketMock = { id: 's1', on: jest.fn(), emit: jest.fn() };

    registerPvpHandlers(ioMock, socketMock);
  });

  test('pvp:move actualiza el tablero y emite a ambos sockets', () => {
    userService.usersByNick.set('charly', 's1');
    userService.nickBySocket.set('s1', 'charly');
    userService.usersStatus.set('charly', 'idle');

    userService.usersByNick.set('pipita', 's2');
    userService.nickBySocket.set('s2', 'pipita');
    userService.usersStatus.set('pipita', 'idle');

    const challenge = challengeService.addChallenge('charly', 'pipita');
    challenge.turn = 'X';

    const moveHandler = socketMock.on.mock.calls.find(c => c[0] === 'pvp:move')[1];
    moveHandler({ index: 0, symbol: 'X' });

    expect(challenge.board[0]).toBe('X');
    expect(challenge.turn).toBe('O');
    expect(ioMock.to).toHaveBeenCalledWith('s2');
    expect(ioMock.emit).toHaveBeenCalled();
    expect(socketMock.emit).toHaveBeenCalled();
  });

  test('pvp:leaveRoom deja idle a ambos y limpia challenge', () => {
    userService.addUser('charly', 's1');
    userService.addUser('pipita', 's2');
    const challenge = challengeService.addChallenge('charly', 'pipita');
    userService.challengesByPlayer.set('charly', challenge);
    userService.challengesByPlayer.set('pipita', challenge);

    const leaveHandler = socketMock.on.mock.calls.find(c => c[0] === 'pvp:leaveRoom')[1];
    leaveHandler({ nickname: 'charly', voluntary: true });

    expect(userService.getUserStatus('charly')).toBe('idle');
    expect(userService.getUserStatus('pipita')).toBe('idle');
    expect(userService.challengesByPlayer.has('charly')).toBe(false);
    expect(userService.challengesByPlayer.has('pipita')).toBe(false);
    expect(challengeService.activeChallenges.size).toBe(0);
  });
});
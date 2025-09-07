const socketHelpers = require('../../helpers/socketHelpers');
const userService = require('../../services/userService');

describe('challengeHandlers minimal tests', () => {
  let ioMock;

  beforeEach(() => {
    userService.usersByNick.clear();
    userService.nickBySocket.clear();
    userService.usersStatus.clear();
    userService.challengesByPlayer.clear();

    ioMock = { emit: jest.fn() };

    jest.spyOn(socketHelpers, 'broadcastUserList').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('addUser agrega un usuario con estado idle', () => {
    userService.addUser('charly', 'socket123');
    expect(userService.usersByNick.get('charly')).toBe('socket123');
    expect(userService.nickBySocket.get('socket123')).toBe('charly');
    expect(userService.usersStatus.get('charly')).toBe('idle');
  });

  test('handleChallengeRemoval reinicia status de jugadores', () => {
    const challenge = { challenger: 'charly', challenged: 'pipita' };
    userService.addUser('charly', 's1');
    userService.addUser('pipita', 's2');

    userService.setStatus('charly', 'busy');
    userService.setStatus('pipita', 'busy');

    userService.handleChallengeRemoval(challenge, ioMock);

    expect(userService.getUserStatus('charly')).toBe('idle');
    expect(userService.getUserStatus('pipita')).toBe('idle');
  });
});
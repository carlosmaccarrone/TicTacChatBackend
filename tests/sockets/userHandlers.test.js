const registerUserHandlers = require('../../sockets/userHandlers');
const socketHelpers = require('../../helpers/socketHelpers');
const userService = require('../../services/userService');
const chatService = require('../../services/chatService');

jest.mock('../../helpers/socketHelpers', () => ({
  broadcastUserList: jest.fn()
}));

describe('userHandlers minimal tests', () => {
  let ioMock;
  let socketMock;

  beforeEach(() => {
    userService.usersByNick.clear();
    userService.nickBySocket.clear();
    userService.usersStatus.clear();

    ioMock = { emit: jest.fn() };
    socketMock = {
      id: 's1',
      on: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn()
    };

    jest.spyOn(socketHelpers, 'broadcastUserList').mockImplementation(() => {});

    registerUserHandlers(ioMock, socketMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('joinRoom agrega un usuario y envía mensajes recientes', () => {
    const ack = jest.fn();
    const joinHandler = socketMock.on.mock.calls.find(c => c[0] === 'joinRoom')[1];

    joinHandler('charly', ack);

    expect(userService.usersByNick.get('charly')).toBe('s1');
    expect(userService.nickBySocket.get('s1')).toBe('charly');
    expect(userService.usersStatus.get('charly')).toBe('idle');
    expect(socketMock.emit).toHaveBeenCalledWith('chat:recentMessages', chatService.getRecentMessages());
    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(socketHelpers.broadcastUserList).toHaveBeenCalled();
  });

  test('logout elimina usuario y llama broadcast', () => {
    userService.usersByNick.set('charly', 's1');
    userService.nickBySocket.set('s1', 'charly');
    userService.usersStatus.set('charly', 'idle');

    const ack = jest.fn();
    const logoutHandler = socketMock.on.mock.calls.find(c => c[0] === 'logout')[1];

    logoutHandler(ack);

    expect(userService.usersByNick.has('charly')).toBe(false);
    expect(userService.nickBySocket.has('s1')).toBe(false);
    expect(userService.usersStatus.has('charly')).toBe(false);
    expect(socketHelpers.broadcastUserList).toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });
});
const { broadcastUserList } = require('../../helpers/socketHelpers');

describe('socketHelpers.broadcastUserList', () => {
  test('should call io.emit with the user list', () => {
    const mockUsers = [
      { nickname: 'charly', status: 'idle' },
      { nickname: 'pipita', status: 'busy' }
    ];

    const io = { emit: jest.fn() };
    const getUsers = jest.fn(() => mockUsers);

    broadcastUserList(io, getUsers);

    expect(getUsers).toHaveBeenCalled();
    expect(io.emit).toHaveBeenCalledWith('updateUserList', mockUsers);
  });
});
const { usersByNick, nickBySocket, usersStatus, removeUser, getAllUsers } = require('../services/userService');
const { broadcastUserList } = require('../helpers/socketHelpers');
const { getRecentMessages } = require('../services/chatService');

module.exports = function registerUserHandlers(io, socket) {
  socket.on('joinRoom', (nickname, ack) => {
    if (!nickname || typeof nickname !== 'string') return ack?.({ ok: false, error: 'Nickname required' });
    if (usersByNick.has(nickname)) return ack?.({ ok: false, error: 'Sorry, nickname already in use!' });

    usersByNick.set(nickname, socket.id);
    nickBySocket.set(socket.id, nickname);
    usersStatus.set(nickname, 'idle');
    broadcastUserList(io, getAllUsers);

    socket.emit('chat:recentMessages', getRecentMessages());
    ack?.({ ok: true });
    console.log(`[JOIN] ${nickname} (${socket.id})`);
  });

  socket.on('logout', (ack) => {
    const nickname = nickBySocket.get(socket.id);
    if (nickname) removeUser(nickname, io);
    ack?.({ ok: true });
  });

  socket.on('updateStatus', (status) => {
    const nickname = nickBySocket.get(socket.id);
    if (!nickname) return;
    usersStatus.set(nickname, status);
    broadcastUserList(io, getAllUsers);
  });

  socket.on('forceDisconnect', (ack) => {
    const nickname = nickBySocket.get(socket.id);
    if (nickname) removeUser(nickname, io);
    socket.disconnect();
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const nickname = nickBySocket.get(socket.id);
    if (nickname) removeUser(nickname, io);
    console.log(`[DISCONNECT] ${nickname || socket.id}`);
  });
};
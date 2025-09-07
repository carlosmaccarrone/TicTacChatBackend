const { addMessage, getRecentMessages } = require('../services/chatService');
const { nickBySocket, usersStatus } = require('../services/userService');

module.exports = function registerChatHandlers(io, socket) {
  socket.on('chat:newMessage', (msg) => {
    const nickname = nickBySocket.get(socket.id);
    if (!nickname) return;
    const message = { from: nickname, text: msg };
    addMessage(message);
    io.emit('chat:newMessage', message);
  });

  socket.on('requestRecentMessages', () => {
    socket.emit('chat:recentMessages', getRecentMessages());
  });

  socket.on('requestUserList', () => {
    const userList = Array.from(usersStatus.entries())
      .map(([nickname, status]) => ({ nickname, status }));
    socket.emit('updateUserList', userList);
  });
};
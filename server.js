const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:3000', methods: ['GET', 'POST'] },
});

const usersByNick = new Map(); // nickname -> socketId
const usersStatus = new Map(); // nickname -> 'idle' | 'busy'

let recentMessages = [];

function addMessage(message) {
  const msgWithTime = { ...message, timestamp: Date.now() };
  recentMessages.push(msgWithTime);

  const oneHourAgo = Date.now() - 1000 * 60 * 60;
  recentMessages = recentMessages
    .filter(m => m.timestamp > oneHourAgo)
    .slice(-10);
}

io.on('connection', (socket) => {
  console.log('New socket connected:', socket.id);

  socket.on('joinRoom', (nickname, ack) => {
    if (!nickname || typeof nickname !== 'string') {
      if (ack) ack({ ok: false, error: 'Nickname required' });
      socket._isGhost = true;
      console.log(`[GHOST DISCONNECT] Invalid nickname attempt (${socket.id})`);
      return socket.disconnect();
    }

    if (usersByNick.has(nickname)) {
      if (ack) ack({ ok: false, error: 'Sorry, nickname already in use!' });
      socket._isGhost = true;
      console.log(`[GHOST DISCONNECT] Nickname already in use (${nickname}, ${socket.id})`);
      return socket.disconnect();
    }

    // valid user
    usersByNick.set(nickname, socket.id);
    usersStatus.set(nickname, 'idle');
    const userList = Array.from(usersStatus.entries()).map(([nickname, status]) => ({ nickname, status }));
    io.emit('updateUserList', userList);

    // send latest messages to the joining user
    socket.emit('chat:recentMessages', recentMessages);

    if (ack) ack({ ok: true });
    console.log(`[JOIN] ${nickname} (${socket.id})`);
  });

  socket.on('chat:newMessage', (msg) => {
    const nickname = Array.from(usersByNick.entries()).find(([nick, id]) => id === socket.id)?.[0];
    if (!nickname) return;
    const message = { from: nickname, text: msg };
    addMessage(message);

    io.emit('chat:newMessage', message); // send to everyone
  });

  socket.on('updateStatus', (status) => {
    const nickname = Array.from(usersByNick.entries()).find(([nick,id]) => id===socket.id)?.[0];
    if (!nickname) return;
    usersStatus.set(nickname, status);

    // send the updated list to everyone
    const userList = Array.from(usersStatus.entries()).map(([nickname, status]) => ({ nickname, status }));
    io.emit('updateUserList', userList);
  });

  socket.on('forceDisconnect', (ack) => {
    const nickname = Array.from(usersByNick.entries()).find(([nick, id]) => id === socket.id)?.[0];
    if (nickname) {
      usersByNick.delete(nickname);
      usersStatus.delete(nickname);
      const userList = Array.from(usersStatus.entries()).map(([nickname, status]) => ({ nickname, status }));
      io.emit('updateUserList', userList);
      console.log(`[FORCED DISCONNECT] ${nickname} (${socket.id})`);
    }
    socket._isGhost = true; // we mark to avoid duplicate log in disconnect
    socket.disconnect();
    if (ack) ack({ ok: true });
  });

  socket.on('disconnect', () => {
    if (socket._isGhost) return; // we don't log ghosts again

    const nickname = Array.from(usersByNick.entries()).find(([nick, id]) => id === socket.id)?.[0];
    if (nickname) {
      usersByNick.delete(nickname);
      usersStatus.delete(nickname);
      const userList = Array.from(usersStatus.entries()).map(([nickname, status]) => ({ nickname, status }));
      io.emit('updateUserList', userList);
      console.log(`[DISCONNECT] ${nickname} (${socket.id})`);
    } else {
      console.log(`[DISCONNECT] Ghost socket disconnected: ${socket.id}`);
    }
  });
});

server.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});
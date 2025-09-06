const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:3000', methods: ['GET', 'POST'] },
});

const usersByNick = new Map();   // nickname -> socketId
const nickBySocket = new Map();  // socketId -> nickname
const usersStatus = new Map();   // nickname -> 'idle' | 'busy'
const activeChallenges = new Map(); // retadoNickname -> { challengerNickname, timeoutId }

let recentMessages = [];

// helpers
function addMessage(message) {
  const msgWithTime = { ...message, timestamp: Date.now() };
  recentMessages.push(msgWithTime);

  const oneHourAgo = Date.now() - 1000 * 60 * 60;
  const filtered = recentMessages.filter(m => m.timestamp > oneHourAgo);
  recentMessages.splice(0, recentMessages.length, ...filtered.slice(-10));
}

setInterval(() => {
  const oneHourAgo = Date.now() - 1000 * 60 * 60;
  const filtered = recentMessages.filter(m => m.timestamp > oneHourAgo);
  recentMessages.splice(0, recentMessages.length, ...filtered);
}, 1000 * 60 * 60);

function broadcastUserList() {
  const userList = Array.from(usersStatus.entries()).map(([nickname, status]) => ({ nickname, status }));
  io.emit('updateUserList', userList);
}

function removeUser(nickname) {
  const socketId = usersByNick.get(nickname);
  if (!socketId) return;

  usersByNick.delete(nickname);
  nickBySocket.delete(socketId);
  usersStatus.delete(nickname);
  broadcastUserList();
  console.log(`[REMOVE USER] ${nickname} (${socketId})`);
}

io.on('connection', (socket) => {
  console.log('New socket connected:', socket.id);

  // LOGIN
  socket.on('joinRoom', (nickname, ack) => {
    if (!nickname || typeof nickname !== 'string') {
      if (ack) ack({ ok: false, error: 'Nickname required' });
      console.log(`[JOIN FAILED] Invalid nickname attempt (${socket.id})`);
      return;
    }

    if (usersByNick.has(nickname)) {
      if (ack) ack({ ok: false, error: 'Sorry, nickname already in use!' });
      console.log(`[JOIN FAILED] Nickname in use (${nickname}, ${socket.id})`);
      return;
    }

    usersByNick.set(nickname, socket.id);
    nickBySocket.set(socket.id, nickname);
    usersStatus.set(nickname, 'idle');
    broadcastUserList();

    socket.emit('chat:recentMessages', recentMessages);

    if (ack) ack({ ok: true });
    console.log(`[JOIN] ${nickname} (${socket.id})`);
  });

  // LOGOUT
  socket.on('logout', (ack) => {
    const nickname = nickBySocket.get(socket.id);
    if (nickname) {
      removeUser(nickname);
      console.log(`[LOGOUT] ${nickname} (${socket.id})`);
    }
    if (ack) ack({ ok: true });
  });

  // CHAT
  socket.on('chat:newMessage', (msg) => {
    const nickname = nickBySocket.get(socket.id);
    if (!nickname) return;
    const message = { from: nickname, text: msg };
    addMessage(message);
    io.emit('chat:newMessage', message);
/*    console.log(`[MESSAGE] ${nickname}: ${msg}`);*/
  });

  socket.on('requestRecentMessages', () => {
    socket.emit('chat:recentMessages', recentMessages);
  });

  // USER LIST
  socket.on('requestUserList', () => {
    const userList = Array.from(usersStatus.entries()).map(([nickname, status]) => ({ nickname, status }));
    socket.emit('updateUserList', userList);
  });

  // CHALLENGES
  socket.on('challenge:send', ({ toNickname }, ack) => {
    const fromNickname = nickBySocket.get(socket.id);
    if (!fromNickname) return ack?.({ ok: false, error: 'Unknown user' });

    if (usersStatus.get(toNickname) !== 'idle' || usersStatus.get(fromNickname) !== 'idle') {
      return ack?.({ ok: false, error: 'User busy' });
    }

    usersStatus.set(fromNickname, 'busy');
    usersStatus.set(toNickname, 'busy');
    broadcastUserList();

    const targetSocketId = usersByNick.get(toNickname);
    io.to(targetSocketId).emit('challenge:received', { from: fromNickname });

    const timeoutId = setTimeout(() => {
      usersStatus.set(fromNickname, 'idle');
      usersStatus.set(toNickname, 'idle');
      broadcastUserList();
      io.to(targetSocketId).emit('challenge:timeout', { from: fromNickname });
      activeChallenges.delete(toNickname);
    }, 10000);

    activeChallenges.set(toNickname, { challengerNickname: fromNickname, timeoutId });
    if (ack) ack({ ok: true });
    console.log(`[CHALLENGE SENT] ${fromNickname} -> ${toNickname}`);
  });

  socket.on('challenge:response', ({ fromNickname, accepted }) => {
    const toNickname = nickBySocket.get(socket.id);
    if (!toNickname) return;

    const challengerSocketId = usersByNick.get(fromNickname);
    if (!challengerSocketId) return;

    io.to(challengerSocketId).emit('challenge:result', { accepted, from: toNickname });

    const challenge = activeChallenges.get(toNickname);
    if (challenge) {
      clearTimeout(challenge.timeoutId);
      activeChallenges.delete(toNickname);
    }

    if (!accepted) {
      usersStatus.set(toNickname, 'idle');
      usersStatus.set(fromNickname, 'idle');
      broadcastUserList();
    }
    console.log(`[CHALLENGE RESPONSE] ${fromNickname} -> ${toNickname}: ${accepted ? 'ACCEPTED' : 'REJECTED'}`);
  });

  // STATUS UPDATE
  socket.on('updateStatus', (status) => {
    const nickname = nickBySocket.get(socket.id);
    if (!nickname) return;
    usersStatus.set(nickname, status);
    broadcastUserList();
    console.log(`[STATUS] ${nickname} -> ${status}`);
  });

  // FORCE DISCONNECT
  socket.on('forceDisconnect', (ack) => {
    const nickname = nickBySocket.get(socket.id);
    if (nickname) removeUser(nickname);
    socket.disconnect();
    if (ack) ack({ ok: true });
    console.log(`[FORCED DISCONNECT] ${nickname} (${socket.id})`);
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    const nickname = nickBySocket.get(socket.id);
    if (nickname) removeUser(nickname);
    console.log(`[DISCONNECT] ${nickname || 'Ghost'} (${socket.id})`);
  });
});

server.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});
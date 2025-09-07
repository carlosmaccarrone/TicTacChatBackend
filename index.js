const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const registerSocketHandlers = require('./sockets');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:3000', methods: ['GET', 'POST'] },
});

registerSocketHandlers(io);

server.listen(3001, () => {
  console.log('Server listening on port 3001');
});
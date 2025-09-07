const registerSocketHandlers = require('../sockets');
const { io: Client } = require('socket.io-client');
const { Server } = require('socket.io');
const http = require('http');

let io, server, port;

jest.mock('../services/chatService', () => ({
  recentMessages: [],
  addMessage: jest.fn(),
}));

beforeAll((done) => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const app = http.createServer();
  io = new Server(app, {
    cors: { origin: '*' }
  });

  registerSocketHandlers(io);

  server = app.listen(() => {
    port = server.address().port;
    done();
  });
});

afterAll((done) => {
  io.close();
  server.close(done);
});

test('server should accept a socket connection', (done) => {
  const client = new Client(`http://localhost:${port}`);

  client.on('connect', () => {
    expect(client.connected).toBe(true);
    client.disconnect();
    done();
  });
});
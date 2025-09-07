const registerChatHandlers = require('./chatHandlers');
const registerUserHandlers = require('./userHandlers');
const registerChallengeHandlers = require('./challengeHandlers');
const registerPvpHandlers = require('./pvpHandlers');

module.exports = function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
  	console.log('New socket connected:', socket.id);  	
    registerUserHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerChallengeHandlers(io, socket);
    registerPvpHandlers(io, socket);
  });
};
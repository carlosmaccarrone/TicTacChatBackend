const { removeChallenge, getChallenge, resetChallengeMessages } = require('./challengeService')
const { broadcastUserList } = require('../helpers/socketHelpers');

const usersByNick = new Map();   // nickname -> socketId
const nickBySocket = new Map();  // socketId -> nickname
const usersStatus = new Map();   // nickname -> 'idle' | 'busy'
const challengesByPlayer = new Map(); // nickname -> challenge

function addUser(nickname, socketId) {
  usersByNick.set(nickname, socketId);
  nickBySocket.set(socketId, nickname);
  usersStatus.set(nickname, 'idle');
}

function getAllUsers() {
  return Array.from(usersStatus.entries())
    .map(([nickname, status]) => ({ nickname, status }));
}

// old removeChallenge
function handleChallengeRemoval(challenge, io) {
  if (!challenge) return;
  removeChallenge(challenge);
  usersStatus.set(challenge.challenger, 'idle');
  usersStatus.set(challenge.challenged, 'idle');
  broadcastUserList(io, getAllUsers);
}

function removeUser(nickname, io) {
  const socketId = usersByNick.get(nickname);
  if (!socketId) return;
  const challenge = getChallenge(nickname);
  handleChallengeRemoval(challenge, io);

  usersByNick.delete(nickname);
  nickBySocket.delete(socketId);
  usersStatus.delete(nickname);

  broadcastUserList(io, getAllUsers);
  console.log(`[REMOVE USER] ${nickname} (${socketId})`);
}

function getNickname(socketId) {
  return nickBySocket.get(socketId);
}

function setStatus(nickname, status) {
  usersStatus.set(nickname, status);
}

function getUserList() {
  return Array.from(usersStatus.entries()).map(([nickname, status]) => ({ nickname, status }));
}

function getUserStatus(nickname) {
  return usersStatus.get(nickname);
}

module.exports = {
  usersByNick,
  nickBySocket,
  usersStatus,
  addUser,
  removeUser,
  getNickname,
  setStatus,
  getUserList,
  getUserStatus,
  getAllUsers,
  handleChallengeRemoval,
  challengesByPlayer
};
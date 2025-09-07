function broadcastUserList(io, getUsers) {
  const userList = getUsers();
  io.emit('updateUserList', userList);
}

module.exports = {
  broadcastUserList
};
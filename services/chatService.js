let recentMessages = [];

function addMessage(message) {
  const msgWithTime = { ...message, timestamp: Date.now() };
  recentMessages.push(msgWithTime);
  const oneHourAgo = Date.now() - 1000 * 60 * 60;
  const filtered = recentMessages.filter(m => m.timestamp > oneHourAgo);
  recentMessages.splice(0, recentMessages.length, ...filtered.slice(-10));
}

function getRecentMessages() {
  return recentMessages;
}

function cleanupMessages() {
  const oneHourAgo = Date.now() - 1000 * 60 * 60;
  const filtered = recentMessages.filter(m => m.timestamp > oneHourAgo);
  recentMessages.splice(0, recentMessages.length, ...filtered.slice(-10));
}

function startCleanupInterval() {
  if (process.env.NODE_ENV !== 'test') {
    setInterval(() => {
      const oneHourAgo = Date.now() - 1000 * 60 * 60;
      const filtered = recentMessages.filter(m => m.timestamp > oneHourAgo);
      recentMessages.splice(0, recentMessages.length, ...filtered);
    }, 1000 * 60 * 60);
  }
}

startCleanupInterval();

module.exports = { addMessage, getRecentMessages, cleanupMessages, startCleanupInterval };
const { addMessage, getRecentMessages } = require('../../services/chatService');

describe('chatService', () => {
  beforeAll(() => {
    jest.useFakeTimers({ legacyFakeTimers: false });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    getRecentMessages().splice(0, getRecentMessages().length);
  });

  test('should add a message with timestamp', () => {
    const msg = { user: 'charly', text: 'hola' };
    const now = Date.now();
    jest.setSystemTime(now);

    addMessage(msg);

    const recent = getRecentMessages();
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject(msg);
    expect(recent[0].timestamp).toBe(now);
  });

  test('should keep only last 10 messages', () => {
    jest.setSystemTime(Date.now());
    for (let i = 0; i < 15; i++) {
      addMessage({ user: 'user'+i, text: 'msg'+i });
    }

    const recent = getRecentMessages();
    expect(recent).toHaveLength(10);
    expect(recent[0].text).toBe('msg5');
    expect(recent[9].text).toBe('msg14');
  });

  test('should discard messages older than 1 hour', () => {
    const now = Date.now();
    jest.setSystemTime(now - 1000 * 60 * 60 * 2);
    addMessage({ user: 'old', text: 'viejo' });

    jest.setSystemTime(now);
    addMessage({ user: 'new', text: 'nuevo' });

    const recent = getRecentMessages();
    expect(recent).toHaveLength(1);
    expect(recent[0].text).toBe('nuevo');
  });
});
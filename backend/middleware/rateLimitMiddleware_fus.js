// Structure : { ip: { attempts: N, lastAttempt: Date, blockedUntil: Date } }
const loginAttempts = {};
const activationAttempts = {};

function getWaitTime(attempts) {
  if (attempts >= 20) return 60 * 60 * 1000;       // 1 heure
  if (attempts >= 10) return 5 * 60 * 1000;         // 5 minutes
  if (attempts >= 5)  return 60 * 1000;              // 1 minute
  if (attempts >= 3)  return 30 * 1000;              // 30 secondes
  return 0;
}

function formatWaitTime(ms) {
  if (ms >= 3600000) return `${Math.floor(ms / 3600000)} heure(s)`;
  if (ms >= 60000)   return `${Math.floor(ms / 60000)} minute(s)`;
  return `${Math.floor(ms / 1000)} secondes`;
}

function checkRateLimit(store, key) {
  const now = Date.now();
  if (!store[key]) {
    store[key] = { attempts: 0, blockedUntil: null };
  }

  const record = store[key];

  if (record.blockedUntil && now < record.blockedUntil) {
    const remaining = record.blockedUntil - now;
    return {
      blocked: true,
      message: `Trop de tentatives. Réessayez dans ${formatWaitTime(remaining)}.`,
      remaining,
      attempts: record.attempts,
    };
  }

  if (record.blockedUntil && now >= record.blockedUntil) {
    record.attempts = 0;
    record.blockedUntil = null;
  }

  return { blocked: false, attempts: record.attempts };
}

function recordFailedAttempt(store, key) {
  const now = Date.now();
  if (!store[key]) {
    store[key] = { attempts: 0, blockedUntil: null };
  }

  const record = store[key];
  record.attempts += 1;

  const waitTime = getWaitTime(record.attempts);
  if (waitTime > 0) {
    record.blockedUntil = now + waitTime;
    console.log(`Rate limit: ${key} bloqué pour ${formatWaitTime(waitTime)} (${record.attempts} tentatives)`);
  }

  return {
    attempts: record.attempts,
    blockedUntil: record.blockedUntil,
    waitTime,
  };
}

function resetAttempts(store, key) {
  if (store[key]) {
    store[key] = { attempts: 0, blockedUntil: null };
  }
}

module.exports = {
  loginAttempts,
  activationAttempts,
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
  formatWaitTime
};
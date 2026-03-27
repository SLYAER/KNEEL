const warns = new Map();

// 🔥 Add warn
function addWarn(userId) {
  if (!warns.has(userId)) {
    warns.set(userId, {
      count: 0,
      lastDecay: Date.now()
    });
  }

  const data = warns.get(userId);
  data.count++;

  return data.count;
}

// 🔥 Get warns (WITH DECAY)
function getWarns(userId) {
  if (!warns.has(userId)) return 0;

  const data = warns.get(userId);

  const now = Date.now();
  const hoursPassed = (now - data.lastDecay) / (1000 * 60 * 60);

  // 🔥 REMOVE 1 WARN EVERY 24 HOURS
  const decayAmount = Math.floor(hoursPassed / 24);

  if (decayAmount > 0) {
    data.count = Math.max(0, data.count - decayAmount);
    data.lastDecay = now;
  }

  return data.count;
}

// 🔥 OPTIONAL: reset (for future use)
function resetWarns(userId) {
  warns.delete(userId);
}

module.exports = { addWarn, getWarns, resetWarns };

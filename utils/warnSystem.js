const warns = new Map();

// ➕ Add warn
function addWarn(userId) {
  const count = warns.get(userId) || 0;
  const newCount = count + 1;
  warns.set(userId, newCount);
  return newCount;
}

// 📊 Get warns
function getWarns(userId) {
  return warns.get(userId) || 0;
}

// ❌ Clear warns
function clearWarns(userId) {
  warns.delete(userId);
}

module.exports = { addWarn, getWarns, clearWarns };

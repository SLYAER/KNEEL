const badPatterns = [
  /f[\W_]*u[\W_]*c[\W_]*k/i,
  /b[\W_]*i[\W_]*t[\W_]*c[\W_]*h/i,
  /s[\W_]*h[\W_]*i[\W_]*t/i,
  /d[\W_]*i[\W_]*c[\W_]*k/i,
];

function isBadWord(message) {
  return badPatterns.some(pattern => pattern.test(message.content));
}

module.exports = { isBadWord };

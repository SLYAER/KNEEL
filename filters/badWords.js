const badPatterns = [
  /fuck/i,
  /shit/i,
  /bitch/i,
  /asshole/i,
  /dick/i,
  /cunt/i,
  /nigg/i,
  /bastard/i,
  /slut/i
];

// normalize text (handles f*ck, f u c k, etc.)
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z]/g, ""); // remove symbols
}

function isBadWord(message) {
  const raw = message.content;
  const clean = normalize(raw);

  // direct pattern check
  for (const pattern of badPatterns) {
    if (pattern.test(raw) || pattern.test(clean)) {
      return true;
    }
  }

  return false;
}

module.exports = { isBadWord };

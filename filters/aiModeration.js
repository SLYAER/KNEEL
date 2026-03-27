const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function isBadAI(content) {
  try {
    const res = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: content
    });

    const flagged = res.results[0].flagged;
    return flagged;
  } catch (err) {
    console.error("AI moderation error:", err);
    return false;
  }
}

module.exports = { isBadAI };

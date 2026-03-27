const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function isBadAI(text) {
  try {
    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });

    const result = response.results[0];

    return (
      result.flagged ||
      result.categories.hate ||
      result.categories.harassment ||
      result.categories.sexual ||
      result.categories.violence
    );
  } catch (err) {
    console.error("❌ AI moderation error:", err.message);

    // fallback so bot doesn't break
    return false;
  }
}

module.exports = { isBadAI };

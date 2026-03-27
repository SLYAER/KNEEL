const OpenAI = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// cooldown system
const cooldown = new Map();

async function checkOpenAI(text) {
  try {
    const res = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: text
    });

    return res.results[0].flagged;
  } catch (err) {
    console.log("⚠️ OpenAI failed:", err.message);
    return null; // fallback trigger
  }
}

async function checkGemini(text) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
    Determine if this message is inappropriate, toxic, abusive, or contains profanity.
    Respond ONLY with "true" or "false".

    Message: "${text}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response.text();

    return response.toLowerCase().includes("true");

  } catch (err) {
    console.log("⚠️ Gemini failed:", err.message);
    return false;
  }
}

async function isBadAI(text, userId) {
  const now = Date.now();

  // ⛔ cooldown per user (10 sec)
  if (cooldown.has(userId) && now - cooldown.get(userId) < 10000) {
    return false;
  }

  cooldown.set(userId, now);

  // 🔥 Try OpenAI first
  const openaiResult = await checkOpenAI(text);

  if (openaiResult !== null) {
    console.log("🧠 OpenAI result:", openaiResult);
    return openaiResult;
  }

  // 🔄 fallback to Gemini
  console.log("🔄 Switching to Gemini...");

  const geminiResult = await checkGemini(text);
  console.log("🧠 Gemini result:", geminiResult);

  return geminiResult;
}

module.exports = { isBadAI };

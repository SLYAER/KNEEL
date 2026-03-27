const OpenAI = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 🔑 Init APIs
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ⏱ cooldown system (per user)
const cooldown = new Map();

// 🔥 OpenAI check
async function checkOpenAI(text) {
  try {
    const res = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: text
    });

    return res.results[0].flagged;

  } catch (err) {
    console.log("⚠️ OpenAI failed:", err.message);
    return null; // trigger fallback
  }
}

// 🔥 Gemini check (FIXED MODEL)
async function checkGemini(text) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest"
    });

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

// 🧠 Main AI function
async function isBadAI(text, userId) {
  const now = Date.now();

  // ⛔ cooldown (10 sec per user)
  if (cooldown.has(userId) && now - cooldown.get(userId) < 10000) {
    return false;
  }

  cooldown.set(userId, now);

  console.log("🔍 Checking AI for:", text);

  // 🔥 Try OpenAI first
  const openaiResult = await checkOpenAI(text);

  if (openaiResult !== null) {
    console.log("🧠 OpenAI result:", openaiResult);
    return openaiResult;
  }

  // 🔄 Fallback to Gemini
  console.log("🔄 Switching to Gemini...");

  const geminiResult = await checkGemini(text);
  console.log("🧠 Gemini result:", geminiResult);

  return geminiResult;
}

module.exports = { isBadAI };

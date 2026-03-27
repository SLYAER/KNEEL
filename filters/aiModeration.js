const OpenAI = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// cooldown system
const cooldown = new Map();
let lastCall = 0;

// 🔹 OpenAI check
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

// 🔹 Gemini check (FIXED MODEL)
async function checkGemini(text) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const prompt = `
Determine if this message is toxic, abusive, inappropriate, or contains profanity.
Reply ONLY with "true" or "false".

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

// 🧠 MAIN AI FUNCTION (FINAL)
async function isBadAI(text, userId) {
  const now = Date.now();

  // GLOBAL LIMIT (5 sec)
  if (now - lastCall < 5000) return false;
  lastCall = now;

  // USER LIMIT (10 sec)
  if (cooldown.has(userId) && now - cooldown.get(userId) < 10000) {
    return false;
  }

  cooldown.set(userId, now);

  console.log("🤖 Checking AI for:", text);

  // 🔹 Try OpenAI
  let openaiResult = null;
  try {
    openaiResult = await checkOpenAI(text);
  } catch {}

  if (openaiResult !== null) {
    console.log("🧠 OpenAI:", openaiResult);
    return openaiResult;
  }

  // 🔹 Fallback Gemini
  try {
    console.log("🔄 Using Gemini...");
    const geminiResult = await checkGemini(text);
    console.log("🧠 Gemini:", geminiResult);
    return geminiResult;
  } catch {
    return false;
  }
}

module.exports = { isBadAI };

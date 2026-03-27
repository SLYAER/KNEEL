const { addWarn, getWarns } = require("./utils/warnSystem");
const { isBadAI } = require("./filters/aiModeration");
const { isBadWord } = require("./filters/badWords");
const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();
const fs = require("fs");

// 🔥 LOAD COMMANDS
const commands = new Map();
const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.set(command.name, command);
}

// 🔥 CLIENT
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🧠 AI COOLDOWN (ANTI 429)
const aiCooldown = new Set();

function canRunAI(userId) {
  if (aiCooldown.has(userId)) return false;

  aiCooldown.add(userId);
  setTimeout(() => aiCooldown.delete(userId), 15000);

  return true;
}

// 🔥 READY
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// 🔥 REGEX FILTERS
const bypassRegex = [
  /f[\W_]*u[\W_]*c[\W_]*k/i,
  /b[\W_]*i[\W_]*t[\W_]*c[\W_]*h/i,
  /n[\W_]*i[\W_]*g[\W_]*g[\W_]*a/i,
  /d[\W_]*i[\W_]*c[\W_]*k/i,
  /c[\W_]*u[\W_]*n[\W_]*t/i,
  /s[\W_]*h[\W_]*i[\W_]*t/i,
];

// 🔥 MESSAGE HANDLER
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  console.log("📩 Message:", content);

  // 🔴 BASIC FILTER
  if (isBadWord(message)) {
    console.log("🚫 Basic filter triggered");
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`🚫 ${message.author}, watch your language.`);
    setTimeout(() => warn.delete().catch(() => {}), 3000);
    return;
  }

  // 🔴 BYPASS FILTER
  if (bypassRegex.some(r => r.test(content))) {
    console.log("🚫 Regex triggered");
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`🚫 ${message.author}, bad word detected.`);
    setTimeout(() => warn.delete().catch(() => {}), 3000);
    return;
  }

  // 🧠 AI FILTER
  try {
    const suspicious =
      content.length > 40 &&
      /[*$@#0-9]/.test(content);

    console.log("🤔 Suspicious:", suspicious);

    if (suspicious && canRunAI(message.author.id)) {
      console.log("🤖 Running AI...");

      const bad = await isBadAI(content, message.author.id);

      console.log("🧠 AI Result:", bad);

      if (bad) {
        await message.delete().catch(() => {});
        const warn = await message.channel.send(
          `🚫 ${message.author}, inappropriate content detected.`
        );
        setTimeout(() => warn.delete().catch(() => {}), 3000);
        return;
      }
    }
  } catch (err) {
    console.error("⚠️ AI skipped:", err.message);
  }

  // ⚙️ COMMAND HANDLER
  const prefix = "!";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const cmdName = args.shift().toLowerCase();

  const command = commands.get(cmdName);
  if (!command) return;

  try {
    command.execute(message, args);
  } catch (err) {
    console.error("❌ Command error:", err);
  }
});

// 🔥 LOGIN
client.login(process.env.TOKEN).catch(err => {
  console.error("❌ Login failed:", err);
});

console.log("🚀 Bot file loaded");

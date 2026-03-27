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

// 🧠 AI COOLDOWN (FIXES 429)
const aiCooldown = new Set();

function canRunAI(userId) {
  if (aiCooldown.has(userId)) return false;

  aiCooldown.add(userId);
  setTimeout(() => aiCooldown.delete(userId), 15000); // 15 sec cooldown

  return true;
}

// 🔥 READY
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// 🔥 STRONG REGEX (MAIN FILTER)
const bypassRegex = /f[\W_]*u[\W_]*c[\W_]*k/i;

// 🔥 MESSAGE HANDLER
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // 🔴 BASIC FILTER
  if (isBadWord(message)) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`🚫 ${message.author}, watch your language.`);
    setTimeout(() => warn.delete().catch(() => {}), 3000);
    return;
  }

  // 🔴 BYPASS FILTER (handles f*ck etc)
  if (bypassRegex.test(content)) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`🚫 ${message.author}, bad word detected.`);
    setTimeout(() => warn.delete().catch(() => {}), 3000);
    return;
  }

  // 🧠 AI ONLY FOR COMPLEX CASES (NOT EVERY MESSAGE)
  try {
    if (
      canRunAI(message.author.id) &&
      (
        content.includes("*") ||
        content.includes("idiot") ||
        content.includes("stupid") ||
        content.includes("kill") ||
        content.length > 15
      )
    ) {
      const bad = await isBadAI(message.content);

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
    console.error("AI skipped:", err.message);
  }

  // ⚙️ COMMANDS
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

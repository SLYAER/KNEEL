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
  setTimeout(() => aiCooldown.delete(userId), 15000); // 15 sec cooldown

  return true;
}

// 🔥 READY
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// 🔥 ULTRA STRONG BYPASS REGEX
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

  // 🔴 BASIC FILTER (your existing system)
  if (isBadWord(message)) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`🚫 ${message.author}, watch your language.`);
    setTimeout(() => warn.delete().catch(() => {}), 3000);
    return;
  }

  // 🔴 BYPASS FILTER (f*ck, f@ck, etc)
  if (bypassRegex.some(r => r.test(content))) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`🚫 ${message.author}, bad word detected.`);
    setTimeout(() => warn.delete().catch(() => {}), 3000);
    return;
  }

  // 🧠 AI FILTER (SMART — NO SPAM)
  try {
    const suspicious =
      content.length > 40 &&
      /[*$@#0-9]/.test(content);

    if (suspicious && canRunAI(message.author.id)) {
      const bad = await isBadAI(content, message.author.id);

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

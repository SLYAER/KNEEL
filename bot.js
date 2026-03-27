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

// 🔥 CREATE CLIENT
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🔥 READY
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// 🔥 STRONG REGEX (catches f*ck, f u c k, etc)
const bypassRegex = /f[\W_]*u[\W_]*c[\W_]*k/i;

// 🔥 MESSAGE HANDLER
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // 🔴 BASIC WORD FILTER
  if (isBadWord(message)) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`🚫 ${message.author}, watch your language.`);
    setTimeout(() => warn.delete().catch(() => {}), 3000);
    return;
  }

  // 🔴 BYPASS FILTER (f*ck etc)
  if (bypassRegex.test(message.content)) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`🚫 ${message.author}, bypassed bad word detected.`);
    setTimeout(() => warn.delete().catch(() => {}), 3000);
    return;
  }

  // 🧠 AI MODERATION (FORCED RUN + DEBUG)
  try {
    console.log("Checking AI for:", message.content);

    const bad = await isBadAI(message.content);

    console.log("AI RESULT:", bad);

    if (bad) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(
        `🚫 ${message.author}, inappropriate content detected.`
      );
      setTimeout(() => warn.delete().catch(() => {}), 3000);
      return;
    }
  } catch (err) {
    console.error("AI failed:", err.message);
  }

  // ⚙️ COMMAND SYSTEM
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

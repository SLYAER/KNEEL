const { isBadAI } = require("./filters/aiModeration");
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

// 🔥 BAD WORD FILTER IMPORT
const { isBadWord } = require("./filters/badWords");

// 🔥 CREATE CLIENT
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🔥 BOT READY
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// 🔥 MESSAGE HANDLER (FILTER + COMMANDS)
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // 🚨 BAD WORD FILTER
  if (isBadWord(message)) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`🚫 ${message.author}, watch your language.`);
    setTimeout(() => warn.delete().catch(() => {}), 3000);
    return;
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

// 🔥 LOGIN (SAFE)
client.login(process.env.TOKEN).catch(err => {
  console.error("❌ Login failed:", err);
});

console.log("🚀 Bot file loaded");

const { addWarn, getWarns } = require("./utils/warnSystem");
const { setLogChannel, getLogChannel } = require("./utils/logSystem");
const { isBadAI } = require("./filters/aiModeration");
const { isBadWord } = require("./filters/badWords");
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
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

// 🧠 AI COOLDOWN
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

// 🔥 REGEX FILTER
const bypassRegex = [
  /f[\W_]*u[\W_]*c[\W_]*k/i,
  /b[\W_]*i[\W_]*t[\W_]*c[\W_]*h/i,
  /n[\W_]*i[\W_]*g[\W_]*g[\W_]*a/i,
  /d[\W_]*i[\W_]*c[\W_]*k/i,
  /c[\W_]*u[\W_]*n[\W_]*t/i,
  /s[\W_]*h[\W_]*i[\W_]*t/i,
];

// 🔥 LOG FUNCTION (DYNAMIC)
async function sendLog(message, reason) {
  try {
    const channelId = getLogChannel(message.guild.id);
    if (!channelId) return;

    const logChannel = message.guild.channels.cache.get(channelId);
    if (!logChannel) return;

    const time = new Date().toLocaleString();

    logChannel.send(
`🚫 **Message Deleted**

👤 User: ${message.author.tag}
🆔 ID: ${message.author.id}

💬 Message: ${message.content || "None"}

📍 Channel: ${message.channel}
⏰ Time: ${time}

⚠️ Reason: ${reason}`
    );

  } catch (err) {
    console.error("Log error:", err.message);
  }
}

// 🔥 WARN SYSTEM
async function handleWarn(message, reason) {
  const userId = message.author.id;

  getWarns(userId);
  const count = addWarn(userId);

  const warnMsg = await message.channel.send(
    `🚫 ${message.author}, warning ${count}/3`
  );

  setTimeout(() => warnMsg.delete().catch(()=>{}), 3000);

  await sendLog(message, reason);

  if (count >= 3) {
    await message.member.timeout(10 * 60 * 1000).catch(()=>{});
    message.channel.send(`🔇 ${message.author} muted (3 warnings).`);
  }
}

// 🔥 MESSAGE HANDLER
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // 🔴 FILTERS
  if (isBadWord(message)) {
    await message.delete().catch(() => {});
    await handleWarn(message, "Basic filter");
    return;
  }

  if (bypassRegex.some(r => r.test(content))) {
    await message.delete().catch(() => {});
    await handleWarn(message, "Regex filter");
    return;
  }

  try {
    const suspicious =
      content.length > 15 &&
      /[*$@#0-9]/.test(content);

    if (suspicious && canRunAI(message.author.id)) {
      const bad = await isBadAI(content, message.author.id);

      if (bad) {
        await message.delete().catch(() => {});
        await handleWarn(message, "AI moderation");
        return;
      }
    }
  } catch (err) {
    console.error("⚠️ AI skipped:", err.message);
  }

  // ⚙️ COMMANDS
  const prefix = "!";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const cmdName = args.shift().toLowerCase();

  // 🔥 SET LOG CHANNEL COMMAND
  if (cmdName === "setlog") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ You need admin permission.");
    }

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply("❌ Mention a channel.");

    setLogChannel(message.guild.id, channel.id);

    return message.channel.send(`✅ Log channel set to ${channel}`);
  }

  // 🔍 WARNS COMMAND
  if (cmdName === "warns") {
    const user = message.mentions.users.first() || message.author;
    const count = getWarns(user.id);

    return message.channel.send(`⚠️ ${user} has ${count} warnings.`);
  }

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

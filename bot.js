const { addWarn, getWarns } = require("./utils/warnSystem");
const { isBadAI } = require("./filters/aiModeration");
const { isBadWord } = require("./filters/badWords");
const LogConfig = require("./models/logConfig");

const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require("discord.js");
require("dotenv").config();
const fs = require("fs");

// 🔥 CONNECT MONGO
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🟢 Mongo connected"))
  .catch(err => console.log("❌ Mongo error:", err));

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

// 🔥 REGEX
const bypassRegex = [
  /f[\W_]*u[\W_]*c[\W_]*k/i,
  /b[\W_]*i[\W_]*t[\W_]*c[\W_]*h/i,
  /n[\W_]*i[\W_]*g[\W_]*g[\W_]*a/i,
  /d[\W_]*i[\W_]*c[\W_]*k/i,
  /c[\W_]*u[\W_]*n[\W_]*t/i,
  /s[\W_]*h[\W_]*i[\W_]*t/i,
];

// 🔥 FETCH LOG CHANNEL
async function getLogChannel(guild) {
  const data = await LogConfig.findOne({ guildId: guild.id });
  if (!data) return null;
  return guild.channels.cache.get(data.logChannelId);
}

// 🔥 EMBED LOG
async function sendLog(message, reason) {
  const logChannel = await getLogChannel(message.guild);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle("🚫 Message Deleted")
    .setColor("Red")
    .addFields(
      { name: "👤 User", value: `${message.author.tag}`, inline: true },
      { name: "📍 Channel", value: `${message.channel}`, inline: true },
      { name: "⚠️ Reason", value: reason, inline: false },
      { name: "💬 Message", value: message.content || "None", inline: false }
    )
    .setFooter({ text: `ID: ${message.author.id}` })
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
}

// 🔥 WARN SYSTEM
async function handleWarn(message, reason) {
  getWarns(message.author.id);
  const count = addWarn(message.author.id);

  const warnMsg = await message.channel.send(
    `🚫 ${message.author}, warning ${count}/3`
  );

  setTimeout(() => warnMsg.delete().catch(()=>{}), 3000);

  await sendLog(message, reason);

  // 🔥 AUTO MUTE
  if (count >= 3) {
    await message.member.timeout(10 * 60 * 1000).catch(()=>{});

    const logChannel = await getLogChannel(message.guild);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle("🔇 User Muted")
        .setColor("Orange")
        .setDescription(`${message.author} muted (3 warnings)`)
        .setTimestamp();

      logChannel.send({ embeds: [embed] });
    }
  }
}

// 🔥 MESSAGE HANDLER
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // 🔴 BASIC
  if (isBadWord(message)) {
    await message.delete().catch(() => {});
    await handleWarn(message, "Basic filter");
    return;
  }

  // 🔴 REGEX
  if (bypassRegex.some(r => r.test(content))) {
    await message.delete().catch(() => {});
    await handleWarn(message, "Regex filter");
    return;
  }

  // 🧠 AI
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
    console.log("AI error:", err.message);
  }

  // ⚙️ COMMANDS
  if (!content.startsWith("!")) return;

  const args = content.slice(1).split(/ +/);
  const cmd = args.shift();

  // 🔥 SET LOG CHANNEL
  if (cmd === "setlog") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ Admin only.");
    }

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply("❌ Mention a channel.");

    await LogConfig.findOneAndUpdate(
      { guildId: message.guild.id },
      { logChannelId: channel.id },
      { upsert: true }
    );

    return message.channel.send(`✅ Log channel set to ${channel}`);
  }

  // 🔍 WARNS
  if (cmd === "warns") {
    const user = message.mentions.users.first() || message.author;
    const count = getWarns(user.id);
    return message.channel.send(`⚠️ ${user} has ${count} warnings.`);
  }
});

// 🔥 LOGIN
client.login(process.env.TOKEN);

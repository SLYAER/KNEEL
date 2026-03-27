const { addWarn, getWarns, resetWarns } = require("./utils/warnSystem");
const { isBadAI } = require("./filters/aiModeration");
const { isBadWord } = require("./filters/badWords");
const LogConfig = require("./models/logConfig");

const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require("discord.js");
require("dotenv").config();
const mongoose = require("mongoose");

// 🔥 CONNECT MONGO
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
  /d[\W_]*i[\W_]*c[\W_]*k/i,
  /c[\W_]*u[\W_]*n[\W_]*t/i,
  /s[\W_]*h[\W_]*i[\W_]*t/i,
];

// 🔥 GET LOG CHANNEL
async function getLogChannel(guild) {
  const data = await LogConfig.findOne({ guildId: guild.id });
  if (!data) return null;
  return guild.channels.cache.get(data.logChannelId);
}

// 🔥 LOG FUNCTION (FIXED)
async function sendLog(message, reason) {
  try {
    const logChannel = await getLogChannel(message.guild);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setTitle("🚫 Message Deleted")
      .setColor("Red")
      .addFields(
        { name: "👤 User", value: `${message.author.tag}`, inline: true },
        { name: "📍 Channel", value: `${message.channel}`, inline: true },
        { name: "⚠️ Reason", value: reason },
        { name: "💬 Message", value: message.content || "None" }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.log("❌ Log failed:", err.message);
  }
}

// 🔥 WARN HANDLER
async function handleWarn(message, reason) {
  getWarns(message.author.id);
  const count = addWarn(message.author.id);

  await message.channel.send(`🚫 ${message.author}, warning ${count}/3`);
  await sendLog(message, reason);

  if (count >= 3) {
    await message.member.timeout(10 * 60 * 1000).catch(()=>{});
  }
}

// 🔥 MESSAGE HANDLER
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // 🔴 AUTO MOD
  if (isBadWord(message)) {
    await message.delete().catch(()=>{});
    return handleWarn(message, "Basic filter");
  }

  if (bypassRegex.some(r => r.test(content))) {
    await message.delete().catch(()=>{});
    return handleWarn(message, "Regex filter");
  }

  try {
    const suspicious =
      content.length > 15 &&
      /[*$@#0-9]/.test(content);

    if (suspicious && canRunAI(message.author.id)) {
      const bad = await isBadAI(content, message.author.id);

      if (bad) {
        await message.delete().catch(()=>{});
        return handleWarn(message, "AI moderation");
      }
    }
  } catch {}

  // 🔥 COMMANDS
  if (!content.startsWith("!")) return;

  const args = content.slice(1).split(/ +/);
  const cmd = args.shift().toLowerCase();

  // ❌ PERMS
  if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return message.reply("❌ Need mod perms");
  }

  const target = message.mentions.members.first();

  // ⚠️ WARN
  if (cmd === "warn") {
    if (!target) return;
    getWarns(target.id);
    const count = addWarn(target.id);

    message.channel.send(`⚠️ ${target.user} warned (${count}/3)`);

    const logChannel = await getLogChannel(message.guild);
    if (logChannel) {
      logChannel.send(`⚠️ ${target.user.tag} warned by ${message.author.tag}`);
    }
  }

  // 🧹 CLEAR WARN
  if (cmd === "clearwarn") {
    if (!target) return;
    resetWarns(target.id);
    message.channel.send(`✅ Cleared warns for ${target.user}`);
  }

  // 🔇 MUTE
  if (cmd === "mute") {
    const ms = require("ms");
    const time = args[0];
    const reason = args.slice(1).join(" ") || "No reason";

    const duration = ms(time);
    if (!duration) return;

    const role = message.guild.roles.cache.find(r => r.name === "Muted");
    if (!role) return message.reply("Create Muted role");

    await target.roles.set([role]);

    message.channel.send(`🔇 ${target.user} muted (${time})`);

    const logChannel = await getLogChannel(message.guild);
    if (logChannel) {
      logChannel.send(`🔇 ${target.user.tag} muted by ${message.author.tag}\nReason: ${reason}`);
    }

    setTimeout(() => {
      target.roles.remove(role).catch(()=>{});
    }, duration);
  }

  // 🔓 UNMUTE
  if (cmd === "unmute") {
    const role = message.guild.roles.cache.find(r => r.name === "Muted");
    await target.roles.remove(role).catch(()=>{});
    message.channel.send(`🔓 ${target.user} unmuted`);
  }

  // 📜 AUDIT LOGS
  if (cmd === "logs") {
    const logs = await message.guild.fetchAuditLogs({ limit: 5 });
    const entries = logs.entries.map(e =>
      `${e.action} - ${e.executor.tag}`
    ).join("\n");

    message.channel.send(`📜 Audit Logs:\n${entries}`);
  }

  // 🔧 SET LOG CHANNEL
  if (cmd === "setlog") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const channel = message.mentions.channels.first();
    if (!channel) return;

    await LogConfig.findOneAndUpdate(
      { guildId: message.guild.id },
      { logChannelId: channel.id },
      { upsert: true }
    );

    message.channel.send(`✅ Log channel set`);
  }
});

// 🔥 LOGIN
client.login(process.env.TOKEN);

const { addWarn, getWarns, resetWarns } = require("./utils/warnSystem");
const { isBadWord } = require("./filters/badWords");

const LogConfig = require("./models/logConfig");
const AFK = require("./models/afkModel");
const SpamConfig = require("./models/spamConfig");
const RoleBackup = require("./models/roleBackup");

const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require("discord.js");
require("dotenv").config();
const mongoose = require("mongoose");
const ms = require("ms");

// 🔥 CONNECT DB
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

// 🔥 SPAM TRACKER
const userMessages = new Map();

// 🔥 READY
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// 🔥 GET LOG CHANNEL
async function getLogChannel(guild) {
  try {
    const data = await LogConfig.findOne({ guildId: guild.id });
    if (!data) return null;
    return guild.channels.cache.get(data.logChannelId);
  } catch {
    return null;
  }
}

// 🔥 SEND LOG
async function sendLog(message, action, reason) {
  try {
    const logChannel = await getLogChannel(message.guild);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setTitle("📜 Moderation Log")
      .setColor("Red")
      .addFields(
        { name: "Action", value: action },
        { name: "User", value: message.author.tag },
        { name: "Channel", value: `${message.channel}` },
        { name: "Reason", value: reason || "None" },
        { name: "Message", value: message.content || "None" }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch {}
}

// 🔥 REGEX FILTER
const bypassRegex = [
  /f[\W_]*u[\W_]*c[\W_]*k/i,
  /b[\W_]*i[\W_]*t[\W_]*c[\W_]*h/i,
  /s[\W_]*h[\W_]*i[\W_]*t/i,
];

// 🔥 MESSAGE EVENT
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // 💤 AFK RETURN
  const afkData = await AFK.findOne({ userId: message.author.id, guildId: message.guild.id });
  if (afkData) {
    await AFK.deleteOne({ userId: message.author.id });
    const time = Math.floor((Date.now() - afkData.time) / 1000);
    message.channel.send(`👋 Welcome back ${message.author}! You were AFK for ${time}s`);
  }

  // 💤 AFK MENTION
  for (const user of message.mentions.users.values()) {
    const data = await AFK.findOne({ userId: user.id, guildId: message.guild.id });
    if (data) {
      message.channel.send(`💤 ${user.tag} is AFK: ${data.reason}`);
    }
  }

  // 🚫 ANTI-SPAM
  const config = await SpamConfig.findOne({ guildId: message.guild.id }) || { limit: 5, interval: 5000 };

  if (!userMessages.has(message.author.id)) userMessages.set(message.author.id, []);
  const timestamps = userMessages.get(message.author.id);
  const now = Date.now();

  while (timestamps.length && now - timestamps[0] > config.interval) {
    timestamps.shift();
  }

  timestamps.push(now);

  if (timestamps.length > config.limit) {
    await message.delete().catch(()=>{});

    const count = addWarn(message.author.id);

    message.channel.send(`🚫 ${message.author} spamming (${count}/3)`);
    await sendLog(message, "Spam", "Too many messages");
    return;
  }

  // 🔴 BAD WORD FILTER
  if (isBadWord(message) || bypassRegex.some(r => r.test(content))) {
    await message.delete().catch(()=>{});

    const count = addWarn(message.author.id);

    message.channel.send(`🚫 ${message.author} warning ${count}/3`);
    await sendLog(message, "Auto Moderation", "Bad language");
    return;
  }

  // 🔥 COMMANDS
  if (!content.startsWith("!")) return;

  const args = content.slice(1).split(/ +/);
  const cmd = args.shift().toLowerCase();

  // 🔧 SET LOG
  if (cmd === "setlog") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ Admin only");
    }

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply("❌ Mention channel");

    await LogConfig.findOneAndUpdate(
      { guildId: message.guild.id },
      { logChannelId: channel.id },
      { upsert: true }
    );

    return message.channel.send("✅ Log channel set");
  }

  // ⚠️ WARN
  if (cmd === "warn") {
    const target = message.mentions.members.first();
    if (!target) return;

    const count = addWarn(target.id);

    message.channel.send(`⚠️ ${target.user} warned (${count}/3)`);
    await sendLog(message, "Warn", target.user.tag);
  }

  // 🧹 CLEAR WARN
  if (cmd === "clearwarn") {
    const target = message.mentions.members.first();
    if (!target) return;

    resetWarns(target.id);
    message.channel.send("✅ Cleared warns");
    await sendLog(message, "Clear Warn", target.user.tag);
  }

  // 🔇 MUTE
  if (cmd === "mute") {
    const target = message.mentions.members.first();
    if (!target) return;

    const duration = ms(args[0]);
    if (!duration) return;

    const mutedRole = message.guild.roles.cache.find(r => r.name === "Muted");
    if (!mutedRole) return message.reply("Create Muted role");

    const roles = target.roles.cache
      .filter(r => r.id !== message.guild.id)
      .map(r => r.id);

    await RoleBackup.findOneAndUpdate(
      { userId: target.id, guildId: message.guild.id },
      { roles },
      { upsert: true }
    );

    await target.roles.set([mutedRole]);

    message.channel.send(`🔇 ${target.user.tag} muted`);
    await sendLog(message, "Mute", args[0]);

    setTimeout(async () => {
      const data = await RoleBackup.findOne({ userId: target.id, guildId: message.guild.id });
      if (!data) return;

      await target.roles.set(data.roles).catch(()=>{});
      await RoleBackup.deleteOne({ userId: target.id });

      message.channel.send(`🔊 ${target.user.tag} unmuted`);
    }, duration);
  }

  // 🔊 UNMUTE
  if (cmd === "unmute") {
    const target = message.mentions.members.first();
    if (!target) return;

    const data = await RoleBackup.findOne({ userId: target.id, guildId: message.guild.id });
    if (!data) return;

    await target.roles.set(data.roles).catch(()=>{});
    await RoleBackup.deleteOne({ userId: target.id });

    message.channel.send(`🔊 ${target.user.tag} unmuted`);
  }

  // 🧹 PURGE
  if (cmd === "purge") {
    const amount = parseInt(args[0]);
    if (!amount) return;

    const messages = await message.channel.bulkDelete(amount, true);
    message.channel.send(`🧹 Deleted ${messages.size}`);
    await sendLog(message, "Purge", `Deleted ${messages.size} messages`);
  }

  // 💤 AFK
  if (cmd === "afk") {
    const reason = args.join(" ") || "AFK";

    await AFK.findOneAndUpdate(
      { userId: message.author.id, guildId: message.guild.id },
      { reason, time: Date.now() },
      { upsert: true }
    );

    message.channel.send(`💤 You are now AFK: ${reason}`);
  }

  // 🛑 SET SPAM
  if (cmd === "setspam") {
    const limit = parseInt(args[0]);
    const interval = ms(args[1]);

    if (!limit || !interval) return;

    await SpamConfig.findOneAndUpdate(
      { guildId: message.guild.id },
      { limit, interval },
      { upsert: true }
    );

    message.channel.send(`✅ Spam set`);
  }

  // 📜 HELP
  if (cmd === "help") {
    message.channel.send(`
⚠️ !warn @user
🧹 !clearwarn @user
🔇 !mute @user 10m
🔊 !unmute @user
🧹 !purge 100
💤 !afk reason
🛑 !setspam 5 5s
📜 !help
`);
  }
});

// 🔥 LOGIN
client.login(process.env.TOKEN);

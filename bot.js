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
  const data = await LogConfig.findOne({ guildId: guild.id });
  if (!data) return null;
  return guild.channels.cache.get(data.logChannelId);
}

// 🔥 SEND LOG
async function sendLog(message, action, reason) {
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

    getWarns(message.author.id);
    const count = addWarn(message.author.id);

    message.channel.send(`🚫 ${message.author} spamming (${count}/3)`);
    await sendLog(message, "Spam", `Exceeded ${config.limit} messages in ${Math.floor(config.interval/1000)}s`);
    return;
  }

  // 🔴 BAD WORD FILTER
  if (isBadWord(message) || bypassRegex.some(r => r.test(content))) {
    await message.delete().catch(()=>{});

    getWarns(message.author.id);
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
    const channel = message.mentions.channels.first();
    if (!channel) return;

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

    getWarns(target.id);
    const count = addWarn(target.id);

    message.channel.send(`⚠️ ${target.user} warned (${count}/3)`);
    await sendLog(message, "Warn", `Target: ${target.user.tag}`);
  }

  // 🧹 CLEAR WARN
  if (cmd === "clearwarn") {
    const target = message.mentions.members.first();
    if (!target) return;

    resetWarns(target.id);
    message.channel.send("✅ Cleared warns");
  }

  // 🔇 MUTE (WITH ROLE RESTORE)
  if (cmd === "mute") {
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention user");

    const duration = ms(args[0]);
    if (!duration) return message.reply("❌ Example: !mute @user 10m");

    const mutedRole = message.guild.roles.cache.find(r => r.name === "Muted");
    if (!mutedRole) return message.reply("❌ Create 'Muted' role");

    const rolesToSave = target.roles.cache
      .filter(r => r.id !== message.guild.id)
      .map(r => r.id);

    await RoleBackup.findOneAndUpdate(
      { userId: target.id, guildId: message.guild.id },
      { roles: rolesToSave },
      { upsert: true }
    );

    await target.roles.set([mutedRole]);

    message.channel.send(`🔇 ${target.user.tag} muted for ${args[0]}`);
    await sendLog(message, "Mute", `Duration: ${args[0]}`);

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
    if (!data) return message.reply("❌ No backup");

    await target.roles.set(data.roles).catch(()=>{});
    await RoleBackup.deleteOne({ userId: target.id });

    message.channel.send(`🔊 ${target.user.tag} unmuted`);
  }

  // 🧹 PURGE
  if (cmd === "purge") {
    let type = args[0];
    let amount = parseInt(args[1]) || parseInt(args[0]);

    if (!amount) return;

    let deleted = 0;

    while (deleted < amount) {
      const fetch = await message.channel.messages.fetch({ limit: 100 });

      let filtered;

      if (type === "bots") {
        filtered = fetch.filter(m => m.author.bot).first(100);
      } else if (message.mentions.users.first()) {
        const user = message.mentions.users.first();
        filtered = fetch.filter(m => m.author.id === user.id).first(100);
      } else {
        filtered = fetch.first(100);
      }

      if (!filtered.length) break;

      await message.channel.bulkDelete(filtered, true);
      deleted += filtered.length;

      await new Promise(r => setTimeout(r, 500));
    }

    message.channel.send(`🧹 Deleted ${deleted} messages`);
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

    if (!limit || !interval) return message.reply("Usage: !setspam 5 5s");

    await SpamConfig.findOneAndUpdate(
      { guildId: message.guild.id },
      { limit, interval },
      { upsert: true }
    );

    message.channel.send(`✅ Spam set to ${limit} messages / ${args[1]}`);
  }

  // 📜 HELP
  if (cmd === "help") {
    const embed = new EmbedBuilder()
      .setTitle("📜 Commands")
      .setColor("Blue")
      .setDescription(`
⚠️ !warn @user
🧹 !clearwarn @user
🔇 !mute @user 10m
🔊 !unmute @user
🧹 !purge 100
🤖 !purge bots 100
👤 !purge @user 100
💤 !afk reason
🛑 !setspam 5 5s
📜 !help
`);

    message.channel.send({ embeds: [embed] });
  }
});

// 🔥 LOGIN
client.login(process.env.TOKEN);

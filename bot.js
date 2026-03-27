const { addWarn, getWarns, resetWarns } = require("./utils/warnSystem");
const { isBadAI } = require("./filters/aiModeration");
const { isBadWord } = require("./filters/badWords");
const LogConfig = require("./models/logConfig");

const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require("discord.js");
require("dotenv").config();
const mongoose = require("mongoose");

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

// 🔥 READY
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// 🔥 GET LOG CHANNEL (FIXED)
async function getLogChannel(guild) {
  try {
    const data = await LogConfig.findOne({ guildId: guild.id });
    if (!data) {
      console.log("❌ No log channel set");
      return null;
    }

    const channel = guild.channels.cache.get(data.logChannelId);
    if (!channel) {
      console.log("❌ Invalid log channel");
      return null;
    }

    return channel;
  } catch (err) {
    console.log("❌ DB error:", err.message);
    return null;
  }
}

// 🔥 SEND LOG (FIXED)
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

// 🔥 REGEX
const bypassRegex = [
  /f[\W_]*u[\W_]*c[\W_]*k/i,
  /b[\W_]*i[\W_]*t[\W_]*c[\W_]*h/i,
  /s[\W_]*h[\W_]*i[\W_]*t/i,
];

// 🔥 MESSAGE HANDLER
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // 🔴 FILTER
  if (isBadWord(message) || bypassRegex.some(r => r.test(content))) {
    await message.delete().catch(()=>{});

    getWarns(message.author.id);
    const count = addWarn(message.author.id);

    await message.channel.send(`🚫 ${message.author} warning ${count}/3`);

    await sendLog(message, "Auto Moderation", "Bad language");
    return;
  }

  // 🔥 COMMANDS
  if (!content.startsWith("!")) return;

  const args = content.slice(1).split(/ +/);
  const cmd = args.shift().toLowerCase();

  // 🔥 SET LOG CHANNEL
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

  // 🔥 WARN
  if (cmd === "warn") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("❌ No permission");
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention user");

    getWarns(target.id);
    const count = addWarn(target.id);

    await message.channel.send(`⚠️ ${target.user} warned (${count}/3)`);

    await sendLog(message, "Warn", `Target: ${target.user.tag}`);
  }

  // 🔥 CLEAR WARN
  if (cmd === "clearwarn") {
    const target = message.mentions.members.first();
    if (!target) return;

    resetWarns(target.id);

    await message.channel.send(`✅ Cleared warns`);
    await sendLog(message, "Clear Warn", `Target: ${target.user.tag}`);
  }

  // 🔥 MUTE
  if (cmd === "mute") {
    const target = message.mentions.members.first();
    if (!target) return;

    const ms = require("ms");
    const time = args[0];
    const reason = args.slice(1).join(" ");

    const duration = ms(time);
    if (!duration) return;

    const role = message.guild.roles.cache.find(r => r.name === "Muted");
    if (!role) return message.reply("Create Muted role");

    await target.roles.set([role]);

    await message.channel.send(`🔇 ${target.user} muted`);
    await sendLog(message, "Mute", reason);

    setTimeout(() => {
      target.roles.remove(role).catch(()=>{});
    }, duration);
  }

  // 🔥 UNMUTE
  if (cmd === "unmute") {
    const target = message.mentions.members.first();
    if (!target) return;

    const role = message.guild.roles.cache.find(r => r.name === "Muted");

    await target.roles.remove(role).catch(()=>{});
    await message.channel.send(`🔓 Unmuted`);

    await sendLog(message, "Unmute", "Manual");
  }
});

// 🔥 LOGIN
client.login(process.env.TOKEN);

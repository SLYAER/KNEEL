// ================== IMPORTS ==================
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

// ================== DATABASE ==================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🟢 Mongo connected"))
  .catch(err => console.log("❌ Mongo error:", err));

// ================== CLIENT ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ================== SECURITY ==================
const dangerousPerms = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageGuild
];

const WHITELIST = ["YOUR_USER_ID_HERE"];

function hasDangerousPerms(permissions) {
  return dangerousPerms.some(p => permissions.has(p));
}

// ================== TRACKERS ==================
const userMessages = new Map();

// ================== READY ==================
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// ================== LOG SYSTEM ==================
async function getLogChannel(guild) {
  const data = await LogConfig.findOne({ guildId: guild.id });
  if (!data) return null;
  return guild.channels.cache.get(data.logChannelId);
}

async function sendLog(guild, text) {
  const logChannel = await getLogChannel(guild);
  if (!logChannel) return;
  logChannel.send(text);
}

// ================== SECURITY EVENTS ==================

// 🚫 ROLE PERMISSION CHANGE
client.on("roleUpdate", async (oldRole, newRole) => {
  const added = newRole.permissions.bitfield & ~oldRole.permissions.bitfield;
  if (!added) return;

  const dangerous = dangerousPerms.some(p => (added & p) === p);
  if (!dangerous) return;

  await newRole.setPermissions(oldRole.permissions);

  const logs = await newRole.guild.fetchAuditLogs({ type: 31, limit: 1 });
  const entry = logs.entries.first();
  if (!entry || WHITELIST.includes(entry.executor.id)) return;

  const member = await newRole.guild.members.fetch(entry.executor.id).catch(()=>null);
  if (!member) return;

  await member.roles.set([]);
  sendLog(newRole.guild, `🚫 ${entry.executor.tag} tried to add dangerous perms`);
});

// 🚫 ROLE DELETE
client.on("roleDelete", async (role) => {
  const logs = await role.guild.fetchAuditLogs({ type: 32, limit: 1 });
  const entry = logs.entries.first();
  if (!entry || WHITELIST.includes(entry.executor.id)) return;

  const member = await role.guild.members.fetch(entry.executor.id).catch(()=>null);
  if (!member) return;

  await member.roles.set([]);
  sendLog(role.guild, `🚫 ${entry.executor.tag} deleted a role`);
});

// 🚫 ROLE CREATE
client.on("roleCreate", async (role) => {
  if (!hasDangerousPerms(role.permissions)) return;

  await role.delete();

  const logs = await role.guild.fetchAuditLogs({ type: 30, limit: 1 });
  const entry = logs.entries.first();
  if (!entry || WHITELIST.includes(entry.executor.id)) return;

  const member = await role.guild.members.fetch(entry.executor.id).catch(()=>null);
  if (!member) return;

  await member.roles.set([]);
  sendLog(role.guild, `🚫 Dangerous role created by ${entry.executor.tag}`);
});

// 🚫 ROLE GIVE
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  if (!addedRoles.size) return;

  for (const role of addedRoles.values()) {
    if (!hasDangerousPerms(role.permissions)) continue;

    await newMember.roles.remove(role);

    const logs = await newMember.guild.fetchAuditLogs({ type: 25, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || WHITELIST.includes(entry.executor.id)) return;

    const attacker = await newMember.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!attacker) return;

    await attacker.roles.set([]);
    sendLog(newMember.guild, `🚫 ${entry.executor.tag} gave dangerous role`);
  }
});

// ================== MESSAGE ==================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // 🔴 BAD WORD
  if (isBadWord(message)) {
    await message.delete().catch(()=>{});
    addWarn(message.author.id);
    return;
  }

  // 🔥 COMMANDS
  if (!content.startsWith("!")) return;

  const args = content.slice(1).split(/ +/);
  const cmd = args.shift();

  // ⚠️ WARN
  if (cmd === "warn") {
    const user = message.mentions.members.first();
    if (!user) return;
    const count = addWarn(user.id);
    message.channel.send(`Warned (${count})`);
  }

  // 🧹 CLEAR WARN
  if (cmd === "clearwarn") {
    const user = message.mentions.members.first();
    if (!user) return;
    resetWarns(user.id);
    message.channel.send("Cleared");
  }

  // 🔇 MUTE
  if (cmd === "mute") {
    const user = message.mentions.members.first();
    const duration = ms(args[0]);
    if (!user || !duration) return;

    const mutedRole = message.guild.roles.cache.find(r => r.name === "Muted");
    if (!mutedRole) return;

    const roles = user.roles.cache.map(r => r.id);

    await RoleBackup.findOneAndUpdate(
      { userId: user.id },
      { roles },
      { upsert: true }
    );

    await user.roles.set([mutedRole]);

    setTimeout(async () => {
      const data = await RoleBackup.findOne({ userId: user.id });
      if (!data) return;
      await user.roles.set(data.roles);
    }, duration);
  }

  // 🧹 PURGE
  if (cmd === "purge") {
    const amount = parseInt(args[0]);
    if (!amount) return;
    await message.channel.bulkDelete(amount, true);
  }

  // 💤 AFK
  if (cmd === "afk") {
    const reason = args.join(" ");
    await AFK.findOneAndUpdate(
      { userId: message.author.id },
      { reason, time: Date.now() },
      { upsert: true }
    );
    message.channel.send("AFK set");
  }

  // 🛑 SET SPAM
  if (cmd === "setspam") {
    const limit = parseInt(args[0]);
    const interval = ms(args[1]);

    await SpamConfig.findOneAndUpdate(
      { guildId: message.guild.id },
      { limit, interval },
      { upsert: true }
    );

    message.channel.send("Spam updated");
  }

  // 📜 HELP
  if (cmd === "help") {
    message.channel.send("Commands: warn, clearwarn, mute, purge, afk, setspam");
  }
});

// ================== LOGIN ==================
client.login(process.env.TOKEN);

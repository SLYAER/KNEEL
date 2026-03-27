console.log("🔥 BOT FILE STARTED");

// ================== IMPORTS ==================
const { addWarn, getWarns, resetWarns } = require("./utils/warnSystem");
const { isBadWord } = require("./filters/badWords");

const LogConfig = require("./models/logConfig");
const AFK = require("./models/afkModel");
const SpamConfig = require("./models/spamConfig");
const RoleBackup = require("./models/roleBackup");

const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
require("dotenv").config();
const mongoose = require("mongoose");
const ms = require("ms");

// ================== ERROR PREVENTION ==================
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

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

const WHITELIST = ["767128886990733342"];

function hasDangerousPerms(permissions) {
  return dangerousPerms.some(p => permissions.has(p));
}

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
  logChannel.send(text).catch(()=>{});
}

// ================== HELPER ==================
async function stripRoles(member) {
  const removableRoles = member.roles.cache.filter(r =>
    r.id !== member.guild.id &&
    r.editable
  );

  await member.roles.remove(removableRoles).catch(()=>{});
}

// ================== SECURITY EVENTS ==================

// 🚫 ROLE PERMISSION CHANGE
client.on("roleUpdate", async (oldRole, newRole) => {
  try {
    const added = newRole.permissions.bitfield & ~oldRole.permissions.bitfield;
    if (!added) return;

    const dangerous = dangerousPerms.some(p => (added & p) === p);
    if (!dangerous) return;

    await newRole.setPermissions(oldRole.permissions).catch(()=>{});

    const logs = await newRole.guild.fetchAuditLogs({ type: 31, limit: 5 });
    const entry = logs.entries.find(e =>
      Date.now() - e.createdTimestamp < 5000
    );

    if (!entry || WHITELIST.includes(entry.executor.id)) return;

    const member = await newRole.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!member) return;

    await stripRoles(member);

    sendLog(newRole.guild, `🚫 ${entry.executor.tag} tried to add dangerous perms`);
  } catch (err) {
    console.log("roleUpdate error:", err);
  }
});

// 🚫 ROLE DELETE
client.on("roleDelete", async (role) => {
  try {
    const logs = await role.guild.fetchAuditLogs({ type: 32, limit: 5 });
    const entry = logs.entries.find(e =>
      Date.now() - e.createdTimestamp < 5000
    );

    if (!entry || WHITELIST.includes(entry.executor.id)) return;

    const member = await role.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!member) return;

    await stripRoles(member);

    sendLog(role.guild, `🚫 ${entry.executor.tag} deleted a role`);
  } catch (err) {
    console.log("roleDelete error:", err);
  }
});

// 🚫 ROLE CREATE
client.on("roleCreate", async (role) => {
  try {
    if (!hasDangerousPerms(role.permissions)) return;

    await role.delete().catch(()=>{});

    const logs = await role.guild.fetchAuditLogs({ type: 30, limit: 5 });
    const entry = logs.entries.find(e =>
      Date.now() - e.createdTimestamp < 5000
    );

    if (!entry || WHITELIST.includes(entry.executor.id)) return;

    const member = await role.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!member) return;

    await stripRoles(member);

    sendLog(role.guild, `🚫 Dangerous role created by ${entry.executor.tag}`);
  } catch (err) {
    console.log("roleCreate error:", err);
  }
});

// 🚫 ROLE GIVE (FIXED VERSION)
const recentActions = new Map();

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    if (!addedRoles.size) return;

    const now = Date.now();

    for (const role of addedRoles.values()) {
      if (!hasDangerousPerms(role.permissions)) continue;

      if (recentActions.has(newMember.id) && now - recentActions.get(newMember.id) < 3000) {
        return;
      }

      recentActions.set(newMember.id, now);

      await newMember.roles.remove(role).catch(()=>{});

      const logs = await newMember.guild.fetchAuditLogs({
        type: 25,
        limit: 5
      });

      const entry = logs.entries.find(e =>
        e.target.id === newMember.id &&
        Date.now() - e.createdTimestamp < 5000
      );

      if (!entry || WHITELIST.includes(entry.executor.id)) return;

      const attacker = await newMember.guild.members.fetch(entry.executor.id).catch(()=>null);
      if (!attacker) return;

      await stripRoles(attacker);

      sendLog(newMember.guild, `🚫 ${entry.executor.tag} gave dangerous role`);
    }
  } catch (err) {
    console.log("memberUpdate error:", err);
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

  if (!content.startsWith("!")) return;

  const args = content.slice(1).split(/ +/);
  const cmd = args.shift();

  if (cmd === "warn") {
    const user = message.mentions.members.first();
    if (!user) return;
    const count = addWarn(user.id);
    message.channel.send(`Warned (${count})`);
  }

  if (cmd === "clearwarn") {
    const user = message.mentions.members.first();
    if (!user) return;
    resetWarns(user.id);
    message.channel.send("Cleared");
  }

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

  if (cmd === "purge") {
    const amount = parseInt(args[0]);
    if (!amount) return;
    await message.channel.bulkDelete(amount, true);
  }

  if (cmd === "afk") {
    const reason = args.join(" ");
    await AFK.findOneAndUpdate(
      { userId: message.author.id },
      { reason, time: Date.now() },
      { upsert: true }
    );
    message.channel.send("AFK set");
  }

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

  if (cmd === "help") {
    message.channel.send("Commands: warn, clearwarn, mute, purge, afk, setspam");
  }
});

// ================== LOGIN ==================
client.login(process.env.TOKEN);

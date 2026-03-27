console.log("🔥 BOT FILE STARTED");

require("dotenv").config();
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require("discord.js");

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🟢 Mongo connected"))
  .catch(err => console.log(err));

// ================= MODELS =================
const Whitelist = mongoose.model("Whitelist", new mongoose.Schema({
  guildId: String,
  userId: String
}));

const Log = mongoose.model("Log", new mongoose.Schema({
  guildId: String,
  channelId: String
}));

const Backup = mongoose.model("Backup", new mongoose.Schema({
  guildId: String,
  data: Object
}));

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= CONFIG =================
const OWNER_ID = "767128886990733342";

const dangerousPerms = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers
];

function hasDangerousPerms(permissions) {
  return dangerousPerms.some(p => permissions.has(p));
}

async function isWhitelisted(guildId, userId) {
  if (userId === OWNER_ID) return true;
  const data = await Whitelist.findOne({ guildId, userId });
  return !!data;
}

// ================= STORAGE =================
const antiNuke = new Map();
const roleBackup = new Map();

// ================= LOG =================
async function sendLog(guild, embed) {
  const data = await Log.findOne({ guildId: guild.id });
  if (!data) return;

  const channel = guild.channels.cache.get(data.channelId);
  if (!channel) return;

  channel.send({ embeds: [embed] }).catch(()=>{});
}

// ================= READY =================
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// ================= STRIP =================
async function stripRoles(member) {
  try {
    const botMember = member.guild.members.me;

    if (member.roles.highest.position >= botMember.roles.highest.position) {
      console.log("❌ Cannot strip (user above bot)");
      return;
    }

    const roles = member.roles.cache.filter(r =>
      r.id !== member.guild.id && r.editable
    );

    if (!roles.size) return;

    await member.roles.remove(roles).catch(()=>{});

    sendLog(member.guild, new EmbedBuilder()
      .setColor("Red")
      .setTitle("🚨 USER STRIPPED")
      .setDescription(`${member.user.tag}`)
      .setTimestamp());

  } catch (err) {
    console.log(err);
  }
}

// ================= ANTI NUKE =================
function trackAction(userId) {
  if (!antiNuke.has(userId)) {
    antiNuke.set(userId, { count: 0, time: Date.now() });
  }

  const data = antiNuke.get(userId);

  if (Date.now() - data.time > 10000) {
    data.count = 0;
    data.time = Date.now();
  }

  data.count++;
  return data.count;
}

// ================= EVENTS =================

// ROLE UPDATE
client.on("roleUpdate", async (oldRole, newRole) => {
  const added = newRole.permissions.bitfield & ~oldRole.permissions.bitfield;
  if (!added) return;

  if (!dangerousPerms.some(p => (added & p) === p)) return;

  await newRole.setPermissions(oldRole.permissions).catch(()=>{});

  const logs = await newRole.guild.fetchAuditLogs({ type: 31, limit: 5 });
  const entry = logs.entries.first();
  if (!entry) return;

  if (await isWhitelisted(newRole.guild.id, entry.executor.id)) return;

  const attacker = await newRole.guild.members.fetch(entry.executor.id).catch(()=>null);
  if (!attacker) return;

  await stripRoles(attacker);

  if (trackAction(attacker.id) >= 3) {
    sendLog(newRole.guild, new EmbedBuilder()
      .setColor("DarkRed")
      .setTitle("💀 Anti-Nuke Triggered")
      .setDescription(attacker.user.tag));
  }
});

// ROLE CREATE
client.on("roleCreate", async (role) => {
  if (!hasDangerousPerms(role.permissions)) return;

  await role.delete().catch(()=>{});

  const logs = await role.guild.fetchAuditLogs({ type: 30, limit: 5 });
  const entry = logs.entries.first();
  if (!entry) return;

  if (await isWhitelisted(role.guild.id, entry.executor.id)) return;

  const attacker = await role.guild.members.fetch(entry.executor.id).catch(()=>null);
  if (!attacker) return;

  await stripRoles(attacker);
  trackAction(attacker.id);
});

// ROLE DELETE
client.on("roleDelete", async (role) => {
  const logs = await role.guild.fetchAuditLogs({ type: 32, limit: 5 });
  const entry = logs.entries.first();
  if (!entry) return;

  if (await isWhitelisted(role.guild.id, entry.executor.id)) return;

  const attacker = await role.guild.members.fetch(entry.executor.id).catch(()=>null);
  if (!attacker) return;

  await stripRoles(attacker);
  trackAction(attacker.id);
});

// MEMBER UPDATE + BACKUP
client.on("guildMemberUpdate", async (oldMember, newMember) => {

  if (!roleBackup.has(newMember.id)) {
    roleBackup.set(newMember.id, oldMember.roles.cache.map(r => r.id));
  }

  const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  if (!addedRoles.size) return;

  const logs = await newMember.guild.fetchAuditLogs({ type: 25, limit: 5 });
  const entry = logs.entries.first();
  if (!entry) return;

  if (await isWhitelisted(newMember.guild.id, entry.executor.id)) return;

  for (const role of addedRoles.values()) {
    if (!hasDangerousPerms(role.permissions)) continue;

    await newMember.roles.remove(role).catch(()=>{});

    const attacker = await newMember.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!attacker) return;

    await stripRoles(attacker);

    if (trackAction(attacker.id) >= 3) {
      sendLog(newMember.guild, new EmbedBuilder()
        .setColor("DarkRed")
        .setTitle("💀 Anti-Nuke Triggered")
        .setDescription(attacker.user.tag));
    }
  }
});

// ================= COMMANDS =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");
  const cmd = args[0];

  if (cmd === "!ping") return message.reply("🏓 Pong!");

  if (cmd === "!setlog") {
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply("Mention channel");

    await Log.findOneAndUpdate(
      { guildId: message.guild.id },
      { channelId: channel.id },
      { upsert: true }
    );

    return message.reply("✅ Log set");
  }

  if (cmd === "!whitelist") {
    if (message.author.id !== OWNER_ID) return;

    const sub = args[1];
    const user = message.mentions.users.first();

    if (sub === "add") {
      await Whitelist.findOneAndUpdate(
        { guildId: message.guild.id, userId: user.id },
        {},
        { upsert: true }
      );
      return message.reply("Added");
    }

    if (sub === "remove") {
      await Whitelist.deleteOne({ guildId: message.guild.id, userId: user.id });
      return message.reply("Removed");
    }

    if (sub === "list") {
      const data = await Whitelist.find({ guildId: message.guild.id });
      return message.reply(data.map(x => `<@${x.userId}>`).join("\n") || "Empty");
    }
  }

  if (cmd === "!backup") {
    const guild = message.guild;

    const data = {
      roles: guild.roles.cache.map(r => ({
        name: r.name,
        color: r.color,
        permissions: r.permissions.bitfield
      })),
      channels: guild.channels.cache.map(c => ({
        name: c.name,
        type: c.type
      }))
    };

    await Backup.findOneAndUpdate(
      { guildId: guild.id },
      { data },
      { upsert: true }
    );

    message.reply("Backup saved");
  }

  if (cmd === "!restoreserver") {
    if (message.author.id !== OWNER_ID) return;

    const backup = await Backup.findOne({ guildId: message.guild.id });
    if (!backup) return message.reply("No backup");

    const guild = message.guild;

    for (const c of guild.channels.cache.values()) {
      await c.delete().catch(()=>{});
    }

    for (const r of guild.roles.cache.values()) {
      if (r.editable && r.id !== guild.id) await r.delete().catch(()=>{});
    }

    for (const r of backup.data.roles) {
      await guild.roles.create(r).catch(()=>{});
    }

    for (const c of backup.data.channels) {
      await guild.channels.create(c).catch(()=>{});
    }

    message.reply("Server restored");
  }

  if (cmd === "!restore") {
    const user = message.mentions.members.first();
    if (!user) return;

    const backup = roleBackup.get(user.id);
    if (!backup) return message.reply("No backup");

    await user.roles.set(backup).catch(()=>{});
    message.reply("Roles restored");
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);

console.log("🔥 BOT FILE STARTED");

require("dotenv").config();
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require("discord.js");

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🟢 Mongo connected"))
  .catch(err => console.log(err));

// ================= MODELS =================
const whitelistSchema = new mongoose.Schema({
  guildId: String,
  userId: String
});
const Whitelist = mongoose.model("Whitelist", whitelistSchema);

const logSchema = new mongoose.Schema({
  guildId: String,
  channelId: String
});
const Log = mongoose.model("Log", logSchema);

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

// ================= LOG SYSTEM =================
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
      console.log("❌ Cannot strip (role higher than bot)");
      return;
    }

    const roles = member.roles.cache.filter(r => r.id !== member.guild.id && r.editable);
    if (!roles.size) return;

    await member.roles.remove(roles).catch(()=>{});

    const embed = new EmbedBuilder()
      .setColor("Red")
      .setTitle("🚨 USER STRIPPED")
      .setDescription(`${member.user.tag} had all roles removed`)
      .setTimestamp();

    sendLog(member.guild, embed);

  } catch (err) {
    console.log(err);
  }
}

// ================= EVENTS =================

// ROLE UPDATE (perm abuse)
client.on("roleUpdate", async (oldRole, newRole) => {
  const added = newRole.permissions.bitfield & ~oldRole.permissions.bitfield;
  if (!added) return;

  const dangerous = dangerousPerms.some(p => (added & p) === p);
  if (!dangerous) return;

  await newRole.setPermissions(oldRole.permissions).catch(()=>{});

  const logs = await newRole.guild.fetchAuditLogs({ type: 31, limit: 5 });
  const entry = logs.entries.first();
  if (!entry) return;

  if (await isWhitelisted(newRole.guild.id, entry.executor.id)) return;

  const attacker = await newRole.guild.members.fetch(entry.executor.id).catch(()=>null);
  if (!attacker) return;

  await stripRoles(attacker);

  const embed = new EmbedBuilder()
    .setColor("Orange")
    .setTitle("⚠️ Dangerous Permission Added")
    .addFields(
      { name: "User", value: `${entry.executor.tag}` },
      { name: "Role", value: `${newRole.name}` }
    )
    .setTimestamp();

  sendLog(newRole.guild, embed);
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

  sendLog(role.guild, new EmbedBuilder()
    .setColor("Red")
    .setTitle("🚨 Dangerous Role Created")
    .setDescription(`${entry.executor.tag}`)
    .setTimestamp());
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

  sendLog(role.guild, new EmbedBuilder()
    .setColor("Red")
    .setTitle("🚨 Role Deleted")
    .setDescription(`${entry.executor.tag}`)
    .setTimestamp());
});

// MEMBER ROLE ADD
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  if (!addedRoles.size) return;

  const logs = await newMember.guild.fetchAuditLogs({ type: 25, limit: 5 });
  const entry = logs.entries.first();
  if (!entry) return;

  // ✅ whitelist FIRST
  if (await isWhitelisted(newMember.guild.id, entry.executor.id)) return;

  for (const role of addedRoles.values()) {
    if (!hasDangerousPerms(role.permissions)) continue;

    await newMember.roles.remove(role).catch(()=>{});

    const attacker = await newMember.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!attacker) return;

    await stripRoles(attacker);

    sendLog(newMember.guild, new EmbedBuilder()
      .setColor("Red")
      .setTitle("🚨 Dangerous Role Given")
      .addFields(
        { name: "Target", value: `${newMember.user.tag}` },
        { name: "By", value: `${entry.executor.tag}` }
      )
      .setTimestamp());
  }
});

// ================= COMMANDS =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");
  const cmd = args[0];

  if (cmd === "!ping") return message.reply("🏓 Pong!");

  // SET LOG CHANNEL
  if (cmd === "!setlog") {
    if (!message.member.permissions.has("Administrator")) return;

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply("Mention a channel");

    await Log.findOneAndUpdate(
      { guildId: message.guild.id },
      { channelId: channel.id },
      { upsert: true }
    );

    message.reply("✅ Log channel set");
  }

  // WHITELIST
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
      return message.reply("✅ Added");
    }

    if (sub === "remove") {
      await Whitelist.deleteOne({ guildId: message.guild.id, userId: user.id });
      return message.reply("❌ Removed");
    }

    if (sub === "list") {
      const data = await Whitelist.find({ guildId: message.guild.id });
      const list = data.map(x => `<@${x.userId}>`).join("\n");
      return message.reply(list || "Empty");
    }
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);

console.log("🔥 BOT FILE STARTED");

// ================== IMPORTS ==================
require("dotenv").config();
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");

// ================== WHITELIST MODEL ==================
const whitelistSchema = new mongoose.Schema({
  guildId: String,
  userId: String
});
const Whitelist = mongoose.model("Whitelist", whitelistSchema);

// ================== ERROR SAFETY ==================
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================== CONFIG ==================
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

// ================== READY ==================
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// ================== STRIP ==================
async function stripRoles(member) {
  try {
    console.log("⚡ Stripping:", member.user.tag);

    const botMember = member.guild.members.me;

    console.log(
      "Bot highest:", botMember.roles.highest.position,
      "| User highest:", member.roles.highest.position
    );

    if (member.roles.highest.position >= botMember.roles.highest.position) {
      console.log("❌ Cannot strip (user above bot)");
      return;
    }

    const roles = member.roles.cache.filter(r =>
      r.id !== member.guild.id && r.editable
    );

    if (!roles.size) return;

    await member.roles.remove(roles).catch(()=>{});

    setTimeout(async () => {
      const remaining = member.roles.cache.filter(r =>
        r.id !== member.guild.id && r.editable
      );

      if (remaining.size) {
        await member.roles.remove(remaining).catch(()=>{});
      }
    }, 1500);

  } catch (err) {
    console.log("❌ strip error:", err);
  }
}

// ================== SECURITY ==================

client.on("roleUpdate", async (oldRole, newRole) => {
  try {
    const added = newRole.permissions.bitfield & ~oldRole.permissions.bitfield;
    if (!added) return;

    const dangerous = dangerousPerms.some(p => (added & p) === p);
    if (!dangerous) return;

    await newRole.setPermissions(oldRole.permissions).catch(()=>{});

    const logs = await newRole.guild.fetchAuditLogs({ type: 31, limit: 5 });
    const entry = logs.entries.find(e => Date.now() - e.createdTimestamp < 5000);

    if (!entry) return;

    if (await isWhitelisted(newRole.guild.id, entry.executor.id)) return;

    const attacker = await newRole.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!attacker) return;

    await stripRoles(attacker);

  } catch (err) {
    console.log(err);
  }
});

client.on("roleCreate", async (role) => {
  try {
    if (!hasDangerousPerms(role.permissions)) return;

    await role.delete().catch(()=>{});

    const logs = await role.guild.fetchAuditLogs({ type: 30, limit: 5 });
    const entry = logs.entries.find(e => Date.now() - e.createdTimestamp < 5000);

    if (!entry) return;

    if (await isWhitelisted(role.guild.id, entry.executor.id)) return;

    const attacker = await role.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!attacker) return;

    await stripRoles(attacker);

  } catch (err) {
    console.log(err);
  }
});

client.on("roleDelete", async (role) => {
  try {
    const logs = await role.guild.fetchAuditLogs({ type: 32, limit: 5 });
    const entry = logs.entries.find(e => Date.now() - e.createdTimestamp < 5000);

    if (!entry) return;

    if (await isWhitelisted(role.guild.id, entry.executor.id)) return;

    const attacker = await role.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!attacker) return;

    await stripRoles(attacker);

  } catch (err) {
    console.log(err);
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    if (!addedRoles.size) return;

    for (const role of addedRoles.values()) {
      if (!hasDangerousPerms(role.permissions)) continue;

      await newMember.roles.remove(role).catch(()=>{});

      const logs = await newMember.guild.fetchAuditLogs({ type: 25, limit: 5 });
      const entry = logs.entries.find(e =>
        e.target.id === newMember.id &&
        Date.now() - e.createdTimestamp < 5000
      );

      if (!entry) return;

      if (await isWhitelisted(newMember.guild.id, entry.executor.id)) return;

      const attacker = await newMember.guild.members.fetch(entry.executor.id).catch(()=>null);
      if (!attacker) return;

      await stripRoles(attacker);
    }

  } catch (err) {
    console.log(err);
  }
});

// ================== COMMANDS ==================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");
  const cmd = args[0];

  if (cmd === "!ping") {
    return message.reply("🏓 Pong!");
  }

  // 🔥 WHITELIST COMMANDS
  if (cmd === "!whitelist") {
    if (message.author.id !== OWNER_ID) return;

    const sub = args[1];
    const user = message.mentions.users.first();

    if (sub === "add") {
      if (!user) return message.reply("Mention user");

      await Whitelist.findOneAndUpdate(
        { guildId: message.guild.id, userId: user.id },
        {},
        { upsert: true }
      );

      return message.reply(`✅ Added ${user.tag}`);
    }

    if (sub === "remove") {
      if (!user) return message.reply("Mention user");

      await Whitelist.deleteOne({
        guildId: message.guild.id,
        userId: user.id
      });

      return message.reply(`❌ Removed ${user.tag}`);
    }

    if (sub === "list") {
      const data = await Whitelist.find({ guildId: message.guild.id });

      if (!data.length) return message.reply("Empty");

      const list = data.map(x => `<@${x.userId}>`).join("\n");

      return message.reply(`📜 Whitelist:\n${list}`);
    }
  }
});

// ================== LOGIN ==================
client.login(process.env.TOKEN);

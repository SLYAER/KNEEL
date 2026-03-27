console.log("🔥 BOT FILE STARTED");

// ================== IMPORTS ==================
require("dotenv").config();
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");

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
const WHITELIST = ["767128886990733342"]; // YOUR ID

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

// ================== READY ==================
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// ================== 🔥 FINAL STRIP FUNCTION ==================
async function stripRoles(member) {
  try {
    console.log("⚡ Stripping:", member.user.tag);

    const botMember = member.guild.members.me;

    console.log(
      "Bot highest:", botMember.roles.highest.position,
      "| User highest:", member.roles.highest.position
    );

    // ❌ hierarchy check
    if (member.roles.highest.position >= botMember.roles.highest.position) {
      console.log("❌ Cannot strip (user above bot)");
      return;
    }

    // remove all roles except @everyone
    const roles = member.roles.cache.filter(r =>
      r.id !== member.guild.id &&
      r.editable
    );

    if (!roles.size) {
      console.log("⚠️ No removable roles");
      return;
    }

    await member.roles.remove(roles).catch(err => {
      console.log("Remove failed:", err.message);
    });

    // 🔁 retry after delay
    setTimeout(async () => {
      const remaining = member.roles.cache.filter(r =>
        r.id !== member.guild.id &&
        r.editable
      );

      if (remaining.size) {
        console.log("🔁 Retrying strip...");
        await member.roles.remove(remaining).catch(()=>{});
      }
    }, 1500);

  } catch (err) {
    console.log("❌ strip error:", err);
  }
}

// ================== SECURITY ==================

// 🚫 ROLE UPDATE (perm abuse)
client.on("roleUpdate", async (oldRole, newRole) => {
  try {
    const added = newRole.permissions.bitfield & ~oldRole.permissions.bitfield;
    if (!added) return;

    const dangerous = dangerousPerms.some(p => (added & p) === p);
    if (!dangerous) return;

    // revert perms
    await newRole.setPermissions(oldRole.permissions).catch(()=>{});

    const logs = await newRole.guild.fetchAuditLogs({ type: 31, limit: 5 });
    const entry = logs.entries.find(e =>
      Date.now() - e.createdTimestamp < 5000
    );

    if (!entry || WHITELIST.includes(entry.executor.id)) return;

    const attacker = await newRole.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!attacker) return;

    await stripRoles(attacker);

  } catch (err) {
    console.log("roleUpdate error:", err);
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

    const attacker = await role.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!attacker) return;

    await stripRoles(attacker);

  } catch (err) {
    console.log("roleCreate error:", err);
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

    const attacker = await role.guild.members.fetch(entry.executor.id).catch(()=>null);
    if (!attacker) return;

    await stripRoles(attacker);

  } catch (err) {
    console.log("roleDelete error:", err);
  }
});

// 🚫 ROLE GIVE
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    if (!addedRoles.size) return;

    for (const role of addedRoles.values()) {
      if (!hasDangerousPerms(role.permissions)) continue;

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
    }

  } catch (err) {
    console.log("memberUpdate error:", err);
  }
});

// ================== BASIC COMMAND ==================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    message.reply("🏓 Pong!");
  }
});

// ================== LOGIN ==================
client.login(process.env.TOKEN);

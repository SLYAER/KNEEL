// ⚠️ VERY LARGE FILE — FULL SYSTEM

console.log("🔥 FINAL GOD BOT STARTED");

require("dotenv").config();
const mongoose = require("mongoose");
const cron = require("node-cron");

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

// ================= DB =================
mongoose.connect(process.env.MONGO_URI);

// ================= MODELS =================
const Warn = mongoose.model("Warn", new mongoose.Schema({
  userId: String,
  count: Number
}));

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
  data: Object,
  createdAt: { type: Date, default: Date.now }
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
const APPROVER_ROLE = "Security Admin";

// ================= MEMORY =================
const antiNuke = new Map();
const restoreVotes = new Map();
const spamMap = new Map();
const afkMap = new Map();

// ================= HELPERS =================
async function isWhitelisted(gid, uid) {
  if (uid === OWNER_ID) return true;
  return !!(await Whitelist.findOne({ guildId: gid, userId: uid }));
}

async function log(guild, text) {
  const d = await Log.findOne({ guildId: guild.id });
  if (!d) return;
  const ch = guild.channels.cache.get(d.channelId);
  if (ch) ch.send(text).catch(()=>{});
}

// ================= AUTO BACKUP =================
client.on("ready", () => {
  console.log(`🤖 ${client.user.tag}`);

  cron.schedule("*/10 * * * *", async () => {
    client.guilds.cache.forEach(async g => {
      const data = {
        roles: g.roles.cache.map(r => ({
          name: r.name,
          color: r.color,
          permissions: r.permissions.bitfield
        })),
        channels: g.channels.cache.map(c => ({
          name: c.name,
          type: c.type
        }))
      };
      await Backup.create({ guildId: g.id, data });
      console.log("💾 Auto backup");
    });
  });
});

// ================= STRIP =================
async function strip(member) {
  const bot = member.guild.members.me;
  if (member.roles.highest.position >= bot.roles.highest.position) return;

  const roles = member.roles.cache.filter(r => r.editable);
  await member.roles.remove(roles).catch(()=>{});
}

// ================= ANTI NUKE =================
function track(id) {
  if (!antiNuke.has(id)) antiNuke.set(id, { c: 0, t: Date.now() });

  const d = antiNuke.get(id);
  if (Date.now() - d.t > 10000) {
    d.c = 0;
    d.t = Date.now();
  }
  d.c++;
  return d.c;
}

// ================= SECURITY =================
client.on("channelDelete", async ch => {
  const logs = await ch.guild.fetchAuditLogs({ limit: 1 });
  const entry = logs.entries.first();
  if (!entry) return;

  const u = entry.executor;
  if (await isWhitelisted(ch.guild.id, u.id)) return;

  const m = await ch.guild.members.fetch(u.id).catch(()=>null);
  if (!m) return;

  await strip(m);
  log(ch.guild, `💀 Channel delete by ${u.tag}`);
});

client.on("guildMemberAdd", async m => {
  if (!m.user.bot) return;

  const logs = await m.guild.fetchAuditLogs({ limit: 1 });
  const entry = logs.entries.first();
  if (!entry) return;

  const u = entry.executor;
  if (await isWhitelisted(m.guild.id, u.id)) return;

  const attacker = await m.guild.members.fetch(u.id).catch(()=>null);
  if (!attacker) return;

  await strip(attacker);
  await m.kick().catch(()=>{});
});

// ================= MESSAGE =================
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  // AFK RETURN
  if (afkMap.has(msg.author.id)) {
    const time = Date.now() - afkMap.get(msg.author.id);
    afkMap.delete(msg.author.id);
    msg.reply(`Welcome back! AFK ${Math.floor(time/1000)}s`);
  }

  // AFK MENTION
  msg.mentions.users.forEach(u => {
    if (afkMap.has(u.id)) {
      msg.reply(`${u.tag} is AFK`);
    }
  });

  // BAD WORD (simple)
  if (msg.content.includes("badword")) {
    await msg.delete().catch(()=>{});
    let w = await Warn.findOne({ userId: msg.author.id });
    if (!w) w = await Warn.create({ userId: msg.author.id, count: 0 });
    w.count++;
    await w.save();
  }

  // SPAM
  if (!spamMap.has(msg.author.id)) {
    spamMap.set(msg.author.id, { count: 0, time: Date.now() });
  }

  const s = spamMap.get(msg.author.id);
  if (Date.now() - s.time > 5000) {
    s.count = 0;
    s.time = Date.now();
  }

  s.count++;
  if (s.count > 5) {
    await msg.delete().catch(()=>{});
  }

  // ================= COMMANDS =================
  const [cmd, ...args] = msg.content.split(" ");

  if (cmd === "!warn") {
    const u = msg.mentions.users.first();
    let w = await Warn.findOne({ userId: u.id });
    if (!w) w = await Warn.create({ userId: u.id, count: 0 });
    w.count++;
    await w.save();
    msg.reply(`Warns: ${w.count}`);
  }

  if (cmd === "!clearwarn") {
    const u = msg.mentions.users.first();
    await Warn.deleteOne({ userId: u.id });
    msg.reply("Cleared");
  }

  if (cmd === "!purge") {
    const n = parseInt(args[0]);
    msg.channel.bulkDelete(n);
  }

  if (cmd === "!afk") {
    afkMap.set(msg.author.id, Date.now());
    msg.reply("AFK set");
  }

  if (cmd === "!setlog") {
    const ch = msg.mentions.channels.first();
    await Log.findOneAndUpdate(
      { guildId: msg.guild.id },
      { channelId: ch.id },
      { upsert: true }
    );
    msg.reply("Log set");
  }

  if (cmd === "!backup") {
    const g = msg.guild;
    const data = {
      roles: g.roles.cache.map(r => ({
        name: r.name,
        color: r.color,
        permissions: r.permissions.bitfield
      })),
      channels: g.channels.cache.map(c => ({
        name: c.name,
        type: c.type
      }))
    };
    await Backup.create({ guildId: g.id, data });
    msg.reply("Backup saved");
  }

  if (cmd === "!restoreserver") {
    if (!msg.member.roles.cache.some(r => r.name === APPROVER_ROLE)) return;

    restoreVotes.set(msg.guild.id, { voters: [] });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("vote").setLabel("Confirm").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    );

    msg.channel.send({ content: "Need 2 approvals", components: [row] });
  }

  if (cmd === "!forceRestore") {
    if (msg.author.id !== OWNER_ID) return;

    const backup = await Backup.findOne({ guildId: msg.guild.id }).sort({ createdAt: -1 });
    await restore(msg.guild, backup);

    msg.reply("Emergency restore");
  }
});

// ================= BUTTON =================
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;

  const data = restoreVotes.get(i.guild.id);
  if (!data) return;

  if (i.customId === "cancel") {
    return i.update({ content: "Cancelled", components: [] });
  }

  if (i.customId === "vote") {
    if (data.voters.includes(i.user.id)) return;

    data.voters.push(i.user.id);

    if (data.voters.length < 2) {
      return i.reply({ content: "Vote added", ephemeral: true });
    }

    const backup = await Backup.findOne({ guildId: i.guild.id }).sort({ createdAt: -1 });
    await restore(i.guild, backup);

    i.update({ content: "Restored", components: [] });
  }
});

// ================= RESTORE =================
async function restore(guild, backup) {
  for (const c of guild.channels.cache.values()) {
    await c.delete().catch(()=>{});
  }

  for (const r of guild.roles.cache.values()) {
    if (r.editable && r.id !== guild.id) {
      await r.delete().catch(()=>{});
    }
  }

  for (const r of backup.data.roles) {
    await guild.roles.create(r).catch(()=>{});
  }

  for (const c of backup.data.channels) {
    await guild.channels.create(c).catch(()=>{});
  }
}

// ================= LOGIN =================
client.login(process.env.TOKEN);

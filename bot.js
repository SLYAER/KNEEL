require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const mongoose = require("mongoose");
const ms = require("ms");
const { Manager } = require("erela.js");

const client = new Client({
  intents: Object.values(GatewayIntentBits)
});

client.login(process.env.TOKEN);

// ===== DB =====
mongoose.connect(process.env.MONGO_URI);

// ===== CONFIG STORAGE =====
let config = {
  log: null,
  welcome: null,
  approver: null
};

// ===== MEMORY =====
let whitelist = new Set();
let warns = new Map();
let afk = new Map();
let levels = new Map();
let backup = null;
let restoreVotes = new Set();
let restorePending = false;

// ===== READY =====
client.on("ready", () => {
  console.log("🔥 GOD BOT V5 ONLINE");
});

// ===== LAVALINK =====
const manager = new Manager({
  nodes: [{
    host: "lava.link",
    port: 80,
    password: "youshallnotpass",
    secure: false
  }],
  send(id, payload) {
    const guild = client.guilds.cache.get(id);
    if (guild) guild.shard.send(payload);
  }
});

client.on("raw", d => manager.updateVoiceState(d));
client.once("ready", () => manager.init(client.user.id));

// ===== MESSAGE =====
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  const args = message.content.split(" ");
  const cmd = args[0];

  // ===== SETUP COMMANDS =====
  if (cmd === "!setlog") {
    if (!message.member.permissions.has("Administrator")) return;
    const ch = message.mentions.channels.first();
    config.log = ch.id;
    message.reply("✅ Log channel set");
  }

  if (cmd === "!setwelcome") {
    if (!message.member.permissions.has("Administrator")) return;
    const ch = message.mentions.channels.first();
    config.welcome = ch.id;
    message.reply("✅ Welcome channel set");
  }

  if (cmd === "!setapprover") {
    if (!message.member.permissions.has("Administrator")) return;
    const role = message.mentions.roles.first();
    config.approver = role.id;
    message.reply("✅ Approver role set");
  }

  // ===== BASIC =====
  if (cmd === "!ping") return message.reply("🏓 Pong");

  // ===== XP =====
  let xp = levels.get(message.author.id) || 0;
  xp += 10;
  levels.set(message.author.id, xp);

  if (xp % 100 === 0) {
    message.channel.send(`🎉 ${message.author} leveled up! (${xp/100})`);
  }

  // ===== AFK =====
  if (cmd === "!afk") {
    afk.set(message.author.id, args.slice(1).join(" ") || "AFK");
    message.reply("💤 AFK set");
  }

  if (afk.has(message.author.id)) {
    afk.delete(message.author.id);
    message.reply("✅ AFK removed");
  }

  // ===== AUTOMOD =====
  const badWords = ["fuck","shit","bitch"];
  if (badWords.some(w => message.content.toLowerCase().includes(w))) {
    await message.delete();
    return message.channel.send(`🚫 ${message.author}`);
  }

  // ===== WARN =====
  if (cmd === "!warn") {
    const user = message.mentions.users.first();
    let count = warns.get(user.id) || 0;
    count++;
    warns.set(user.id, count);

    message.reply(`⚠️ Warned (${count})`);

    if (count >= 3) {
      const member = await message.guild.members.fetch(user.id);
      await member.timeout(ms("10m"));
      message.channel.send("🔇 Muted");
    }
  }

  // ===== WHITELIST =====
  if (cmd === "!whitelist") {
    const user = message.mentions.users.first();
    whitelist.add(user.id);
    message.reply("✅ Whitelisted");
  }

  // ===== BACKUP =====
  if (cmd === "!backup") {
    backup = {
      roles: message.guild.roles.cache.map(r => ({
        name: r.name,
        perms: r.permissions.bitfield
      })),
      channels: message.guild.channels.cache.map(c => ({
        name: c.name,
        type: c.type
      }))
    };
    message.reply("💾 Backup saved");
  }

  // ===== RESTORE =====
  if (cmd === "!restoreserver") {
    if (!backup) return message.reply("No backup");

    restoreVotes.clear();
    restorePending = true;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("approve").setLabel("Approve").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("deny").setLabel("Cancel").setStyle(ButtonStyle.Danger)
    );

    message.channel.send({ content: "⚠️ Need 2 approvals", components: [row] });
  }

  // ===== MUSIC =====
  if (cmd === "!play") {
    const query = args.slice(1).join(" ");
    const vc = message.member.voice.channel;
    if (!vc) return message.reply("Join VC");

    let player = manager.players.get(message.guild.id);
    if (!player) {
      player = manager.create({
        guild: message.guild.id,
        voiceChannel: vc.id,
        textChannel: message.channel.id
      });
      player.connect();
    }

    const res = await manager.search(query, message.author);
    if (res.loadType === "NO_MATCHES") return message.reply("No results");

    player.queue.add(res.tracks[0]);
    if (!player.playing) player.play();
  }

});

// ===== BUTTON =====
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  if (!i.member.roles.cache.has(config.approver)) {
    return i.reply({ content: "No permission", ephemeral: true });
  }

  if (i.customId === "approve") {
    restoreVotes.add(i.user.id);

    if (restoreVotes.size >= 2 && restorePending) {
      restorePending = false;

      for (const r of backup.roles) {
        await i.guild.roles.create({
          name: r.name,
          permissions: r.perms
        }).catch(()=>{});
      }

      i.channel.send("✅ Restored");
    } else {
      i.reply("Vote added");
    }
  }

  if (i.customId === "deny") {
    restorePending = false;
    i.channel.send("❌ Cancelled");
  }
});

// ===== WELCOME =====
client.on("guildMemberAdd", m => {
  const ch = m.guild.channels.cache.get(config.welcome);
  if (ch) ch.send(`👋 Welcome ${m.user}`);
});

client.on("guildMemberRemove", m => {
  const ch = m.guild.channels.cache.get(config.welcome);
  if (ch) ch.send(`😢 ${m.user.tag} left`);
});

// ===== SECURITY =====
client.on("guildMemberUpdate", async (oldM,newM)=>{
  const added=newM.roles.cache.filter(r=>!oldM.roles.cache.has(r.id));
  if(!added.size)return;

  const logs=await newM.guild.fetchAuditLogs({limit:1,type:25});
  const entry=logs.entries.first();
  if(!entry)return;

  if(whitelist.has(entry.executor.id))return;

  await newM.roles.set([]);
});

// ===== LOGIN =====
client.login(process.env.TOKEN);

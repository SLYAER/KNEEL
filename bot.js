require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const mongoose = require("mongoose");
const ms = require("ms");
const { Manager } = require("erela.js");

process.on("unhandledRejection", err => console.error("ERR:", err));
process.on("uncaughtException", err => console.error("CRASH:", err));

const client = new Client({
  intents: Object.values(GatewayIntentBits)
});

// ===== DB =====
mongoose.connect(process.env.MONGO_URI);

// ===== SCHEMAS =====
const userSchema = new mongoose.Schema({
  userId: String,
  warns: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  afk: { type: String, default: null }
});
const User = mongoose.model("User", userSchema);

const configSchema = new mongoose.Schema({
  guildId: String,
  log: String,
  welcome: String,
  approver: String
});
const Config = mongoose.model("Config", configSchema);

// ===== MEMORY =====
let whitelist = new Set();
let backup = null;
let restoreVotes = new Set();
let restorePending = false;

// ===== READY =====
client.on("ready", () => {
  console.log("🔥 V6 BOT ONLINE");
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

  let config = await Config.findOne({ guildId: message.guild.id });
  if (!config) config = await Config.create({ guildId: message.guild.id });

  let user = await User.findOne({ userId: message.author.id });
  if (!user) user = await User.create({ userId: message.author.id });

  // ===== SETUP =====
  if (cmd === "!setlog") {
    if (!message.member.permissions.has("Administrator")) return;
    const ch = message.mentions.channels.first();
    if (!ch) return message.reply("❌ Mention channel");
    config.log = ch.id;
    await config.save();
    return message.reply("✅ Log set");
  }

  if (cmd === "!setwelcome") {
    if (!message.member.permissions.has("Administrator")) return;
    const ch = message.mentions.channels.first();
    if (!ch) return message.reply("❌ Mention channel");
    config.welcome = ch.id;
    await config.save();
    return message.reply("✅ Welcome set");
  }

  if (cmd === "!setapprover") {
    if (!message.member.permissions.has("Administrator")) return;
    const role = message.mentions.roles.first();
    if (!role) return message.reply("❌ Mention role");
    config.approver = role.id;
    await config.save();
    return message.reply("✅ Approver set");
  }

  // ===== XP =====
  user.xp += 10;
  await user.save();

  if (user.xp % 100 === 0) {
    message.channel.send(`🎉 Level up (${user.xp/100})`);
  }

  // ===== AFK =====
  if (cmd === "!afk") {
    user.afk = args.slice(1).join(" ") || "AFK";
    await user.save();
    return message.reply("💤 AFK set");
  }

  if (user.afk) {
    user.afk = null;
    await user.save();
    message.reply("✅ AFK removed");
  }

  // ===== AUTOMOD =====
  if (["fuck","shit","bitch"].some(w=>message.content.toLowerCase().includes(w))) {
    await message.delete().catch(()=>{});
    return message.channel.send("🚫 Language");
  }

  // ===== WARN =====
  if (cmd === "!warn") {
    const target = message.mentions.users.first();
    if (!target) return;

    let tUser = await User.findOne({ userId: target.id });
    if (!tUser) tUser = await User.create({ userId: target.id });

    tUser.warns++;
    await tUser.save();

    message.reply(`⚠️ Warn ${tUser.warns}`);

    if (tUser.warns >= 3) {
      const member = await message.guild.members.fetch(target.id);
      await member.timeout(ms("10m")).catch(()=>{});
    }
  }

  // ===== MUSIC (FIXED) =====
  if (cmd === "!play") {
    const member = await message.guild.members.fetch(message.author.id).catch(()=>null);
    if (!member) return;

    const vc = member.voice.channel;
    if (!vc) return message.reply("Join VC");

    const query = args.slice(1).join(" ");
    if (!query) return message.reply("Give song");

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

    if (!res || res.loadType === "NO_MATCHES") {
      return message.reply("No results");
    }

    player.queue.add(res.tracks[0]);
    if (!player.playing) player.play();
  }

  // ===== BACKUP =====
  if (cmd === "!backup") {
    backup = {
      roles: message.guild.roles.cache.map(r=>({name:r.name, perms:r.permissions.bitfield}))
    };
    message.reply("💾 Backup saved");
  }

  // ===== RESTORE =====
  if (cmd === "!restore") {
    if (!backup) return message.reply("No backup");

    restoreVotes.clear();
    restorePending = true;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("yes").setLabel("Approve").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("no").setLabel("Cancel").setStyle(ButtonStyle.Danger)
    );

    message.channel.send({ content: "⚠️ Need 2 approvals", components: [row] });
  }
});

// ===== BUTTON =====
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  const config = await Config.findOne({ guildId: i.guild.id });
  if (!config || !i.member.roles.cache.has(config.approver)) {
    return i.reply({ content: "No permission", ephemeral: true });
  }

  if (i.customId === "yes") {
    restoreVotes.add(i.user.id);

    if (restoreVotes.size >= 2 && restorePending) {
      restorePending = false;

      for (const r of backup.roles) {
        await i.guild.roles.create({ name: r.name, permissions: r.perms }).catch(()=>{});
      }

      i.channel.send("✅ Restored");
    } else {
      i.reply("Vote added");
    }
  }

  if (i.customId === "no") {
    restorePending = false;
    i.channel.send("❌ Cancelled");
  }
});

// ===== WELCOME =====
client.on("guildMemberAdd", async (m) => {
  const config = await Config.findOne({ guildId: m.guild.id });
  if (!config || !config.welcome) return;

  const ch = m.guild.channels.cache.get(config.welcome);
  if (ch) ch.send(`👋 Welcome ${m.user}`);
});

client.on("guildMemberRemove", async (m) => {
  const config = await Config.findOne({ guildId: m.guild.id });
  if (!config || !config.welcome) return;

  const ch = m.guild.channels.cache.get(config.welcome);
  if (ch) ch.send(`😢 ${m.user.tag} left`);
});

// ===== LOGIN =====
client.login(process.env.TOKEN);

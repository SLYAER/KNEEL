require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  AuditLogEvent,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const { Manager } = require("erela.js");

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
});

// ===== LAVALINK (FIXED CONFIG) =====
const manager = new Manager({
  nodes: [
    {
      host: process.env.LAVA_HOST,
      port: 443, // ✅ FIXED
      password: process.env.LAVA_PASS,
      secure: true, // ✅ FIXED
    },
  ],
  send(id, payload) {
    const guild = client.guilds.cache.get(id);
    if (guild) guild.shard.send(payload);
  },
});

// ===== DATA =====
const whitelist = new Set();
let logChannelId = null;
let backupData = {};
let restoreVotes = new Set();
let restorePending = false;
let approvedRoleId = null;

// ===== READY =====
client.once("ready", () => {
  console.log("🔥 FINAL GOD BOT ONLINE");
  manager.init(client.user.id);
});

// ===== VOICE =====
client.on("raw", (d) => manager.updateVoiceState(d));

// ===== COMMANDS =====
client.on("messageCreate", async (message) => {
  try {
    if (!message.guild || message.author.bot) return;

    const args = message.content.split(" ");
    const cmd = args[0];

    // ===== BASIC =====
    if (cmd === "!ping") return message.reply("🏓 Pong");

    if (cmd === "!setlog") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
      logChannelId = message.channel.id;
      message.reply("✅ Log channel set");
    }

    // ===== WHITELIST =====
    if (cmd === "!whitelist") {
      const user = message.mentions.users.first();
      whitelist.add(user.id);
      message.reply("✅ Whitelisted");
    }

    if (cmd === "!unwhitelist") {
      const user = message.mentions.users.first();
      whitelist.delete(user.id);
      message.reply("❌ Removed");
    }

    // ===== APPROVAL ROLE =====
    if (cmd === "!setapprovalrole") {
      const role = message.mentions.roles.first();
      approvedRoleId = role.id;
      message.reply("✅ Approval role set");
    }

    // ===== BACKUP =====
    if (cmd === "!backup") {
      backupData = {
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
      if (!backupData.roles) return message.reply("No backup");

      restorePending = true;
      restoreVotes.clear();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("approve_restore").setLabel("Approve").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("deny_restore").setLabel("Cancel").setStyle(ButtonStyle.Danger)
      );

      message.channel.send({
        content: "⚠️ Need 2 approvals",
        components: [row]
      });
    }

    if (cmd === "!override") {
      restorePending = false;
      message.reply("🚨 Override used");
    }

    // ================= MUSIC =================

    if (cmd === "!play") {
      const query = args.slice(1).join(" ");
      if (!query) return message.reply("Provide song");

      const vc = message.member.voice.channel;
      if (!vc) return message.reply("Join VC");

      const player = manager.create({
        guild: message.guild.id,
        voiceChannel: vc.id,
        textChannel: message.channel.id,
        selfDeafen: true,
      });

      player.connect();

      const res = await manager.search(query, message.author);

      if (res.loadType === "NO_MATCHES") {
        return message.reply("No results");
      }

      if (res.loadType === "PLAYLIST_LOADED") {
        player.queue.add(res.tracks);
        message.reply("📜 Playlist added");
      } else {
        player.queue.add(res.tracks[0]);
        message.reply(`🎶 Added: ${res.tracks[0].title}`);
      }

      if (!player.playing && !player.paused) {
        player.play();
      }
    }

    if (cmd === "!skip") {
      const player = manager.players.get(message.guild.id);
      if (!player) return;
      player.stop();
      message.reply("⏭ Skipped");
    }

    if (cmd === "!stop") {
      const player = manager.players.get(message.guild.id);
      if (!player) return;
      player.destroy();
      message.reply("⏹ Stopped");
    }

    if (cmd === "!queue") {
      const player = manager.players.get(message.guild.id);
      if (!player || !player.queue.size) return message.reply("No queue");

      const list = player.queue.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
      message.reply(`📜 Queue:\n${list}`);
    }

    if (cmd === "!loop") {
      const player = manager.players.get(message.guild.id);
      if (!player) return;

      player.setTrackRepeat(!player.trackRepeat);
      message.reply(`🔁 Loop: ${player.trackRepeat}`);
    }

  } catch (err) {
    console.error(err);
  }
});

// ===== BUTTONS =====
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  if (i.customId === "approve_restore") {
    if (!restorePending) return;

    if (approvedRoleId && !i.member.roles.cache.has(approvedRoleId))
      return i.reply({ content: "No permission", ephemeral: true });

    restoreVotes.add(i.user.id);

    if (restoreVotes.size >= 2) {
      restorePending = false;

      for (const role of backupData.roles) {
        await i.guild.roles.create({
          name: role.name,
          permissions: role.perms
        }).catch(()=>{});
      }

      i.channel.send("✅ Restored");
    } else {
      i.reply("Vote added");
    }
  }

  if (i.customId === "deny_restore") {
    restorePending = false;
    i.channel.send("❌ Cancelled");
  }
});

// ===== ANTI ROLE ADD =====
client.on("guildMemberUpdate", async (oldM, newM) => {
  const added = newM.roles.cache.filter(r => !oldM.roles.cache.has(r.id));
  if (!added.size) return;

  const logs = await newM.guild.fetchAuditLogs({
    limit: 1,
    type: AuditLogEvent.MemberRoleUpdate
  });

  const entry = logs.entries.first();
  if (!entry) return;

  const executor = entry.executor;
  if (whitelist.has(executor.id)) return;

  const bot = newM.guild.members.me;

  if (bot.roles.highest.position > newM.roles.highest.position) {
    await newM.roles.set([]);
  }
});

// ===== MUSIC EVENT =====
manager.on("trackStart", (player, track) => {
  const channel = client.channels.cache.get(player.textChannel);
  if (channel) channel.send(`▶️ Now playing: ${track.title}`);
});

// ===== LOGIN =====
client.login(process.env.TOKEN);

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  AuditLogEvent,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require("@discordjs/voice");

const play = require("play-dl");

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

// ===== ERROR PROTECTION =====
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ===== DATA =====
const whitelist = new Set();
let logChannelId = null;
let backupData = {};
let restoreVotes = new Set();
let restorePending = false;
let approvedRoleId = null;

// ===== MUSIC SYSTEM V2 =====
const queue = new Map();

async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  const stream = await play.stream(song.url, {
    discordPlayerCompatibility: true
  });

  const resource = createAudioResource(stream.stream, {
    inputType: stream.type,
    inlineVolume: true
  });

  const player = serverQueue.player;
  player.play(resource);
  resource.volume.setVolume(1);

  player.once(AudioPlayerStatus.Idle, () => {
    if (serverQueue.loop) {
      playSong(guild, song);
    } else {
      serverQueue.songs.shift();
      playSong(guild, serverQueue.songs[0]);
    }
  });

  player.on("error", console.error);
}

// ===== READY =====
client.once("ready", () => {
  console.log("🔥 FINAL GOD BOT ONLINE");
});

// ===== COMMANDS =====
client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

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

      let serverQueue = queue.get(message.guild.id);

      const search = await play.search(query, { limit: 1 });
      if (!search.length) return message.reply("No results");

      const song = {
        title: search[0].title,
        url: search[0].url
      };

      if (!serverQueue) {
        const connection = joinVoiceChannel({
          channelId: vc.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();

        serverQueue = {
          connection,
          player,
          songs: [],
          loop: false
        };

        queue.set(message.guild.id, serverQueue);
        serverQueue.songs.push(song);

        connection.subscribe(player);
        playSong(message.guild, serverQueue.songs[0]);

        return message.reply(`🎶 Playing: ${song.title}`);
      }

      serverQueue.songs.push(song);
      message.reply(`➕ Added: ${song.title}`);
    }

    if (cmd === "!skip") {
      const serverQueue = queue.get(message.guild.id);
      if (!serverQueue) return;

      serverQueue.songs.shift();
      playSong(message.guild, serverQueue.songs[0]);
      message.reply("⏭ Skipped");
    }

    if (cmd === "!loop") {
      const serverQueue = queue.get(message.guild.id);
      if (!serverQueue) return;

      serverQueue.loop = !serverQueue.loop;
      message.reply(`🔁 Loop: ${serverQueue.loop}`);
    }

    if (cmd === "!stop") {
      const serverQueue = queue.get(message.guild.id);
      if (!serverQueue) return;

      serverQueue.songs = [];
      serverQueue.connection.destroy();
      queue.delete(message.guild.id);

      message.reply("⏹ Stopped");
    }

    if (cmd === "!queue") {
      const serverQueue = queue.get(message.guild.id);
      if (!serverQueue) return message.reply("No queue");

      const list = serverQueue.songs.map((s, i) => `${i+1}. ${s.title}`).join("\n");
      message.reply(`📜 Queue:\n${list}`);
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

// ===== LOGIN =====
client.login(process.env.TOKEN);

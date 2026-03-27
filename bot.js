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

// ===== MUSIC =====
const player = createAudioPlayer();
let connection;

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
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
      const user = message.mentions.users.first();
      if (!user) return message.reply("Mention user");
      whitelist.add(user.id);
      message.reply(`✅ Whitelisted ${user.tag}`);
    }

    if (cmd === "!unwhitelist") {
      const user = message.mentions.users.first();
      whitelist.delete(user.id);
      message.reply("❌ Removed");
    }

    // ===== APPROVAL ROLE =====
    if (cmd === "!setapprovalrole") {
      const role = message.mentions.roles.first();
      if (!role) return;
      approvedRoleId = role.id;
      message.reply("✅ Approval role set");
    }

    // ===== BACKUP =====
    if (cmd === "!backup") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

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
      if (!backupData.roles) return message.reply("❌ No backup");

      restorePending = true;
      restoreVotes.clear();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("approve_restore")
          .setLabel("Approve Restore")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("deny_restore")
          .setLabel("Deny")
          .setStyle(ButtonStyle.Danger)
      );

      message.channel.send({
        content: "⚠️ Restore requires 2 approvals",
        components: [row],
      });
    }

    // ===== OVERRIDE =====
    if (cmd === "!override") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
      restorePending = false;
      message.reply("🚨 Emergency override used");
    }

    // ================= MUSIC =================

    if (cmd === "!play") {
      const query = args.slice(1).join(" ");
      if (!query) return message.reply("❌ Provide song");

      const vc = message.member.voice.channel;
      if (!vc) return message.reply("❌ Join VC first");

      connection = joinVoiceChannel({
        channelId: vc.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      const result = await play.search(query, { limit: 1 });
      if (!result.length) return message.reply("❌ No results");

      const stream = await play.stream(result[0].url);

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });

      player.play(resource);
      connection.subscribe(player);

      message.reply(`🎶 Playing: ${result[0].title}`);
    }

    if (cmd === "!stop") {
      if (connection) {
        connection.destroy();
        message.reply("⏹ Stopped");
      }
    }

    if (cmd === "!leave") {
      if (connection) {
        connection.destroy();
        message.reply("👋 Left VC");
      }
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
      return i.reply({ content: "❌ No permission", ephemeral: true });

    restoreVotes.add(i.user.id);

    if (restoreVotes.size >= 2) {
      restorePending = false;

      for (const role of backupData.roles) {
        await i.guild.roles.create({
          name: role.name,
          permissions: role.perms
        }).catch(() => {});
      }

      i.channel.send("✅ Server restored");
    } else {
      i.reply("✅ Vote added");
    }
  }

  if (i.customId === "deny_restore") {
    restorePending = false;
    i.channel.send("❌ Restore cancelled");
  }
});

// ===== ANTI ROLE ADD =====
client.on("guildMemberUpdate", async (oldM, newM) => {
  try {
    const added = newM.roles.cache.filter(r => !oldM.roles.cache.has(r.id));
    if (!added.size) return;

    const logs = await newM.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberRoleUpdate,
    });

    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (whitelist.has(executor.id)) return;

    const bot = newM.guild.members.me;

    if (bot.roles.highest.position > newM.roles.highest.position) {
      await newM.roles.set([]);
    }

    for (const r of added.values()) {
      if (bot.roles.highest.position > r.position) {
        await newM.roles.remove(r).catch(() => {});
      }
    }

    log(newM.guild, `🚨 Role abuse by ${executor.tag}`);
  } catch {}
});

// ===== ANTI ROLE DELETE =====
client.on("roleDelete", async (role) => {
  try {
    const logs = await role.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.RoleDelete,
    });

    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (whitelist.has(executor.id)) return;

    const member = role.guild.members.cache.get(executor.id);
    const bot = role.guild.members.me;

    if (member && bot.roles.highest.position > member.roles.highest.position) {
      await member.roles.set([]).catch(() => {});
    }

    log(role.guild, `🚨 Role deleted by ${executor.tag}`);
  } catch {}
});

// ===== ANTI ADMIN PERM =====
client.on("roleUpdate", async (oldR, newR) => {
  if (
    !oldR.permissions.has(PermissionsBitField.Flags.Administrator) &&
    newR.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    await newR.setPermissions(0);
  }
});

// ===== LOG =====
function log(guild, msg) {
  if (!logChannelId) return;
  const ch = guild.channels.cache.get(logChannelId);
  if (ch) ch.send(msg);
}

// ===== LOGIN =====
client.login(process.env.TOKEN);

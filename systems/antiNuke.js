
const { AuditLogEvent } = require("discord.js");

module.exports = (client) => {
  client.on("channelDelete", async (channel) => {
    const logs = await channel.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.ChannelDelete
    });

    const entry = logs.entries.first();
    if (!entry) return;

    const executor = await channel.guild.members.fetch(entry.executor.id);

    await executor.roles.set([]);
    await executor.timeout(10 * 60 * 1000);

    channel.guild.systemChannel?.send("🚨 Anti-nuke triggered");
  });
};

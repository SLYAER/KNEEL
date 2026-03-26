const { AuditLogEvent } = require("discord.js");

module.exports = (client) => {
  client.on("roleDelete", async (role) => {
    try {
      const fetchedLogs = await role.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.RoleDelete
      });

      const deletionLog = fetchedLogs.entries.first();
      if (!deletionLog) return;

      const { executor } = deletionLog;

      // Ignore bot itself
      if (executor.id === client.user.id) return;

      const member = await role.guild.members.fetch(executor.id);
      if (!member) return;

      // 🚨 Punishment: remove all roles
      await member.roles.set([]);

      console.log(`🚨 ${executor.tag} deleted a role → roles removed`);
    } catch (err) {
      console.error("Role delete guard error:", err);
    }
  });
};

const Guild = require("../models/Guild");

module.exports = (client) => {

  // AUTO ROLE
  client.on("guildMemberAdd", async (member) => {
    const guild = await Guild.findOne({ guildId: member.guild.id });
    if (!guild || !guild.autoRole) return;

    const role = member.guild.roles.cache.get(guild.autoRole);
    if (role) member.roles.add(role);
  });

};

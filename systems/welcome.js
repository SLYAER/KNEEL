const Guild = require("../models/Guild");

module.exports = (client) => {
  client.on("guildMemberAdd", async (member) => {
    const guild = await Guild.findOne({ guildId: member.guild.id });
    if (!guild) return;

    const msg = (guild.welcomeMessage || "Welcome {user}")
      .replace("{user}", member);

    member.guild.systemChannel?.send(msg);
  });

  client.on("guildMemberRemove", async (member) => {
    const guild = await Guild.findOne({ guildId: member.guild.id });
    if (!guild) return;

    member.guild.systemChannel?.send(`😢 ${member.user.tag} left`);
  });
};

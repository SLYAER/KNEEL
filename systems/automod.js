const Guild = require("../models/Guild");

module.exports = (client) => {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    const guild = await Guild.findOne({ guildId: msg.guild.id });
    if (!guild) return;

    if (guild.anti.links && msg.content.includes("http")) {
      msg.delete();
      msg.channel.send("🚫 Links blocked");
    }
  });
};

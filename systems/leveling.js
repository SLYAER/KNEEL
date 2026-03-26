
const Guild = require("../models/Guild");

module.exports = (client) => {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    let guild = await Guild.findOne({ guildId: msg.guild.id });
    if (!guild) return;

    if (!guild.users) guild.users = {};

    if (!guild.users[msg.author.id]) {
      guild.users[msg.author.id] = { xp: 0, level: 1 };
    }

    let user = guild.users[msg.author.id];

    user.xp += 5;

    if (user.xp >= 100) {
      user.level++;
      user.xp = 0;
      msg.channel.send(`${msg.author} leveled up`);
    }

    await guild.save();
  });
};

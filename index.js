require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");

const client = new Client({
  intents: Object.values(GatewayIntentBits),
});

client.once("ready", () => {
  console.log("KNEEL bot is online");

  client.user.setPresence({
    activities: [{ name: "KNEEL Security", type: 3 }],
    status: "online",
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");
  const command = args[0];

  // PING
  if (command === "!ping") {
    return message.reply("KNEEL X is active.");
  }

  // KICK
  if (command === "!kick") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return message.reply("No permission.");

    const user = message.mentions.members.first();
    if (!user) return message.reply("Mention a user.");

    await user.kick();
    return message.reply(`${user.user.tag} has been kicked.`);
  }

  // BAN
  if (command === "!ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return message.reply("No permission.");

    const user = message.mentions.members.first();
    if (!user) return message.reply("Mention a user.");

    await user.ban();
    return message.reply(`${user.user.tag} has been banned.`);
  }

  // CLEAR
  if (command === "!clear") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return message.reply("No permission.");

    const amount = parseInt(args[1]);
    if (!amount) return message.reply("Enter number.");

    await message.channel.bulkDelete(amount, true);
    return message.channel.send(`Deleted ${amount} messages.`);
  }

  // MUTE (TIMEOUT)
  if (command === "!mute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply("No permission.");

    const user = message.mentions.members.first();
    if (!user) return message.reply("Mention a user.");

    await user.timeout(10 * 60 * 1000); // 10 mins
    return message.reply(`${user.user.tag} muted for 10 min.`);
  }
});

client.login(process.env.TOKEN);

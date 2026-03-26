
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: Object.values(GatewayIntentBits)
});

client.on("ready", () => {
  console.log(`KNEEL bot is online`);

  client.user.setPresence({
    activities: [{ name: "KNEEL Security", type: 3 }],
    status: "online"
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    message.reply("KNEEL ⚔️ is active.");
  }
});

client.login(process.env.TOKEN);

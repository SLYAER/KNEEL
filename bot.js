console.log("🚀 Bot file loaded");
console.log("TOKEN:", process.env.TOKEN ? "OK" : "MISSING");
const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN).catch(err => {
  console.error("❌ Login failed:", err);
});

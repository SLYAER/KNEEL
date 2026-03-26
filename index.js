require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: Object.values(GatewayIntentBits)
});

client.once("ready", () => {
  console.log("🔥 KNEEL BOT ONLINE");
});

// LOAD SYSTEMS
require("./systems/automod")(client);
require("./systems/antiNuke")(client);
require("./systems/leveling")(client);
require("./systems/welcome")(client);
require("./systems/roles")(client);
require("./systems/warns")(client);

// LOAD DASHBOARD
require("./server");

client.login(process.env.TOKEN);

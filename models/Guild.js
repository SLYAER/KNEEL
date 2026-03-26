
const mongoose = require("mongoose");

const guildSchema = new mongoose.Schema({
  guildId: String,
  autoRole: String,
  welcomeMessage: String,

  anti: {
    spam: Boolean,
    links: Boolean,
    badWords: Boolean
  }
});

module.exports = mongoose.model("Guild", guildSchema);

const mongoose = require("mongoose");

const guildSchema = new mongoose.Schema({
  guildId: String,

  autoRole: String,

  welcomeMessage: String,
  leaveMessage: String,

  anti: {
    spam: Boolean,
    links: Boolean,
    badWords: Boolean
  },

  warnLimit: Number,
  punishment: String,

  users: Object,
  warns: Object
});

module.exports = mongoose.model("Guild", guildSchema);

const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  guildId: String,
  logChannelId: String
});

module.exports = mongoose.model("LogConfig", logSchema);

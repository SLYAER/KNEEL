const mongoose = require("mongoose");

const afkSchema = new mongoose.Schema({
  userId: String,
  guildId: String,
  reason: String,
  time: Number
});

module.exports = mongoose.model("AFK", afkSchema);

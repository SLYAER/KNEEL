const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  guildId: String,
  userId: String
});

module.exports = mongoose.model("Whitelist", schema);

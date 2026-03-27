const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: String,
  guildId: String,
  roles: [String]
});

module.exports = mongoose.model("RoleBackup", schema);

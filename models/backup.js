const mongoose = require("mongoose");

const backupSchema = new mongoose.Schema({
  guildId: String,
  data: Object
});

module.exports = mongoose.model("Backup", backupSchema);

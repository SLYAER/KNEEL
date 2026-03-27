const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  guildId: String,
  limit: { type: Number, default: 5 }, // msgs per interval
  interval: { type: Number, default: 5000 } // ms
});

module.exports = mongoose.model("SpamConfig", schema);

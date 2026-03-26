const express = require("express");
const router = express.Router();
const Guild = require("../models/Guild");

router.get("/guild/:id", async (req, res) => {
  let guild = await Guild.findOne({ guildId: req.params.id });

  if (!guild) {
    guild = await Guild.create({
      guildId: req.params.id,
      anti: { spam: true, links: true, badWords: true }
    });
  }

  res.json(guild);
});

router.post("/guild/:id/toggle/:type", async (req, res) => {
  const { id, type } = req.params;

  let guild = await Guild.findOne({ guildId: id });

  guild.anti[type] = !guild.anti[type];
  await guild.save();

  res.json(guild);
});

module.exports = router;

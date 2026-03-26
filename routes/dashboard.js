const express = require("express");
const router = express.Router();
const Guild = require("../models/Guild");

router.get("/guild/:id", async (req, res) => {
  let guild = await Guild.findOne({ guildId: req.params.id });

  if (!guild) {
    guild = await Guild.create({
      guildId: req.params.id,
      autoRole: "",
      welcomeMessage: "Welcome {user}",
      anti: { spam: true, links: true, badWords: true },
      warnLimit: 3,
      punishment: "timeout"
    });
  }

  res.json(guild);
});

router.post("/guild/:id/toggle/:type", async (req, res) => {
  const guild = await Guild.findOne({ guildId: req.params.id });

  guild.anti[req.params.type] = !guild.anti[req.params.type];
  await guild.save();

  res.json(guild);
});

module.exports = router;

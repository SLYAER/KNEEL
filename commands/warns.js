module.exports = {
  name: "warns",
  execute(message, args) {
    const { getWarns } = require("../utils/warnSystem");

    const user = message.mentions.users.first() || message.author;
    const count = getWarns(user.id);

    message.channel.send(`⚠️ ${user} has ${count} warnings.`);
  }
};

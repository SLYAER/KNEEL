const logChannels = new Map();

// set log channel
function setLogChannel(guildId, channelId) {
  logChannels.set(guildId, channelId);
}

// get log channel
function getLogChannel(guildId) {
  return logChannels.get(guildId);
}

module.exports = { setLogChannel, getLogChannel };

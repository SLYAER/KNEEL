module.exports = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.send("❌ Not logged in");
  }
  next();
};

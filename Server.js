// 🔥 Error handlers (very important)
process.on("uncaughtException", err => {
  console.error("❌ Uncaught Exception:", err);
});

process.on("unhandledRejection", err => {
  console.error("❌ Unhandled Rejection:", err);
});

// 🔥 Load env + start bot
require("dotenv").config();
require("./bot"); // ✅ THIS STARTS YOUR DISCORD BOT

// 🔥 Imports
const express = require("express");
const session = require("express-session");

const passport = require("./routes/auth");
const mongo = require("./Database/mongo");

const app = express();

// 🔥 Connect DB
mongo();

// 🔥 Middleware
app.use(express.json());
app.use(express.static("public"));

app.use(session({
  secret: "kneel-secret",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// 🔥 Routes
app.use("/api", require("./routes/dashboard"));

app.get("/", (req, res) => {
  res.send("🔥 KNEEL SaaS Running");
});

// 🔥 Start server
app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Dashboard running");
});

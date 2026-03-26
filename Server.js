const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

console.log("🚀 Server starting...");

// 🔥 Error handlers (prevents crashes)
process.on("uncaughtException", err => {
  console.error("❌ Uncaught Exception:", err);
});

process.on("unhandledRejection", err => {
  console.error("❌ Unhandled Rejection:", err);
});

require("dotenv").config();

// 🚨 Stop if token missing
if (!process.env.TOKEN) {
  console.log("❌ TOKEN missing, exiting...");
  process.exit(1);
}

// 🔥 Start Discord bot
let botStarted = false;

if (!botStarted) {
  botStarted = true;
  require("./bot");
}

// Imports
const express = require("express");
const session = require("express-session");
const passport = require("./routes/auth");
const mongo = require("./Database/mongo");

const app = express();

// 🔥 Connect DB safely
mongo().catch(err => {
  console.error("❌ Mongo startup error:", err);
});

// Middleware
app.use(express.json());
app.use(express.static("public"));

app.use(session({
  secret: "kneel-secret",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use("/api", require("./routes/dashboard"));

app.get("/", (req, res) => {
  res.status(200).send("OK");
});
});

// 🔥 Start server (REQUIRED for Railway)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// 💓 Keep alive (prevents Railway kill)
setInterval(() => {
  fetch(`http://localhost:${process.env.PORT || 3000}`)
    .then(() => console.log("🔁 Self ping"))
    .catch(() => console.log("⚠️ Ping failed"));
}, 25000);

// ⚠️ Graceful shutdown log
process.on("SIGTERM", () => {
  console.log("⚠️ SIGTERM received");
});

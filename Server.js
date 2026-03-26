require("dotenv").config();
const express = require("express");
const session = require("express-session");

const passport = require("./routes/auth");
const mongo = require("./database/mongo");

const app = express();

mongo();

app.use(session({
  secret: "kneel-secret",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

app.use("/api", require("./routes/dashboard"));

app.get("/", (req, res) => {
  res.send("🔥 KNEEL SaaS Dashboard Running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Dashboard online");
});

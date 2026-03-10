const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const leadsRouter = require("./routes/leads");
const authRouter = require("./routes/auth");
const notificationsRouter = require("./routes/notifications");
const { requireAuth } = require("./auth");
const { startNotificationScheduler } = require("./notifications/scheduler");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();

const corsOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(cors(corsOrigins.length ? { origin: corsOrigins } : undefined));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Backward-compatible health route for deployments where proxy strips "/api".
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api", requireAuth, leadsRouter);
app.use("/api/notifications", requireAuth, notificationsRouter);

// Compatibility routes when reverse proxy strips "/api" from upstream path.
app.use("/auth", authRouter);
app.use("/", requireAuth, leadsRouter);
app.use("/notifications", requireAuth, notificationsRouter);

startNotificationScheduler();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

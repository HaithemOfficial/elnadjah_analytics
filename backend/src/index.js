const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const leadsRouter = require("./routes/leads");
const authRouter = require("./routes/auth");
const { requireAuth } = require("./auth");

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

app.use("/api/auth", authRouter);
app.use("/api", requireAuth, leadsRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

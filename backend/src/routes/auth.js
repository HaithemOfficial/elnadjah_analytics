const express = require("express");
const {
  findUserByEmail,
  createSession,
  readSession,
  removeSession,
  parseBearerToken,
} = require("../auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = findUserByEmail(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const session = createSession(user);
  return res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      email: user.email,
      role: user.role,
      name: user.name,
    },
  });
});

router.get("/me", (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const session = readSession(token);
  if (!session) {
    return res.status(401).json({ error: "Session expired" });
  }

  return res.json({
    user: {
      email: session.email,
      role: session.role,
      name: session.name,
    },
    expiresAt: session.expiresAt,
  });
});

router.post("/logout", (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (token) {
    removeSession(token);
  }
  return res.json({ ok: true });
});

module.exports = router;

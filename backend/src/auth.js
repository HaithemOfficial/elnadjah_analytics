const crypto = require("crypto");

const AUTH_TOKEN_TTL_HOURS = Number(process.env.AUTH_TOKEN_TTL_HOURS || 24);
const TOKEN_TTL_MS = Math.max(1, AUTH_TOKEN_TTL_HOURS) * 60 * 60 * 1000;

const sessions = new Map();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getUsers() {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || "admin@elnadjah.com");
  const adminPassword = String(process.env.ADMIN_PASSWORD || "Admin@123456");

  const founder1Email = normalizeEmail(process.env.FOUNDER1_EMAIL || "");
  const founder1Password = String(process.env.FOUNDER1_PASSWORD || "");

  const founder2Email = normalizeEmail(process.env.FOUNDER2_EMAIL || "");
  const founder2Password = String(process.env.FOUNDER2_PASSWORD || "");

  const managerEmail = normalizeEmail(process.env.MANAGER_EMAIL || "");
  const managerPassword = String(process.env.MANAGER_PASSWORD || "");

  const users = [
    {
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      name: "Admin",
    },
  ];

  if (founder1Email && founder1Password) {
    users.push({
      email: founder1Email,
      password: founder1Password,
      role: "admin",
      name: "Founder 1",
    });
  }

  if (founder2Email && founder2Password) {
    users.push({
      email: founder2Email,
      password: founder2Password,
      role: "admin",
      name: "Founder 2",
    });
  }

  if (managerEmail && managerPassword) {
    users.push({
      email: managerEmail,
      password: managerPassword,
      role: "manager",
      name: "Manager",
    });
  }

  return users;
}

function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  return getUsers().find((user) => user.email === normalized) || null;
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_MS;

  sessions.set(token, {
    email: user.email,
    role: user.role,
    name: user.name,
    createdAt: now,
    expiresAt,
  });

  return { token, expiresAt };
}

function readSession(token) {
  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function removeSession(token) {
  sessions.delete(token);
}

function parseBearerToken(authHeader) {
  if (!authHeader) return "";
  const [scheme, token] = String(authHeader).split(" ");
  if (!scheme || !token) return "";
  if (scheme.toLowerCase() !== "bearer") return "";
  return token.trim();
}

function requireAuth(req, res, next) {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const session = readSession(token);
  if (!session) {
    return res.status(401).json({ error: "Session expired" });
  }

  req.auth = {
    token,
    user: {
      email: session.email,
      role: session.role,
      name: session.name,
    },
  };

  return next();
}

module.exports = {
  findUserByEmail,
  createSession,
  readSession,
  removeSession,
  parseBearerToken,
  requireAuth,
};

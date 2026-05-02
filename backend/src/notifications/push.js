const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const webpush = require("web-push");
const { getSheetRows } = require("../sheets");
const { buildDailySummary, rowsToMinimalLeads } = require("./dailySummary");

dayjs.extend(utc);
dayjs.extend(timezone);

const dataDir = path.join(__dirname, "..", "..", "data");
const subscriptionsPath = path.join(dataDir, "push-subscriptions.json");
const statePath = path.join(dataDir, "push-state.json");

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function getVapidPublicKey() {
  return String(process.env.VAPID_PUBLIC_KEY || "").trim();
}

function configureWebPush() {
  const subject = String(process.env.VAPID_SUBJECT || "mailto:admin@elnadjah.com").trim();
  const publicKey = getVapidPublicKey();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function readSubscriptions() {
  return readJson(subscriptionsPath, []).filter((item) => item?.endpoint);
}

function writeSubscriptions(subscriptions) {
  const unique = new Map();
  subscriptions
    .filter((item) => item?.endpoint)
    .forEach((item) => unique.set(item.endpoint, item));
  writeJson(subscriptionsPath, Array.from(unique.values()));
}

function saveSubscription(subscription, user) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error("Invalid push subscription.");
  }

  const subscriptions = readSubscriptions().filter(
    (item) => item.endpoint !== subscription.endpoint
  );

  subscriptions.push({
    ...subscription,
    user: user?.email || "",
    updatedAt: new Date().toISOString(),
  });

  writeSubscriptions(subscriptions);
  return { count: subscriptions.length };
}

function removeSubscription(endpoint) {
  if (!endpoint) return { count: readSubscriptions().length };
  const subscriptions = readSubscriptions().filter((item) => item.endpoint !== endpoint);
  writeSubscriptions(subscriptions);
  return { count: subscriptions.length };
}

async function sendPushToAll(payload) {
  if (!configureWebPush()) {
    throw new Error("VAPID keys are not configured.");
  }

  const subscriptions = readSubscriptions();
  const deadEndpoints = new Set();
  const deliveries = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(subscription, JSON.stringify(payload)).catch((error) => {
        if (error.statusCode === 404 || error.statusCode === 410) {
          deadEndpoints.add(subscription.endpoint);
        }
        throw error;
      })
    )
  );

  if (deadEndpoints.size) {
    writeSubscriptions(
      subscriptions.filter((subscription) => !deadEndpoints.has(subscription.endpoint))
    );
  }

  const sent = deliveries.filter((item) => item.status === "fulfilled").length;
  const failed = deliveries.length - sent;
  return { sent, failed, removed: deadEndpoints.size, total: subscriptions.length };
}

function readPushState() {
  return readJson(statePath, {});
}

function writePushState(state) {
  writeJson(statePath, state);
}

async function checkLeadThresholdAndNotify(trigger = "manual", targetDate, options = {}) {
  const limit = Number(process.env.LEAD_THRESHOLD_PUSH_LIMIT || 100);
  const thresholdTimezone =
    process.env.LEAD_THRESHOLD_PUSH_TIMEZONE ||
    process.env.DAILY_SUMMARY_TIMEZONE ||
    "UTC";
  const effectiveTargetDate =
    targetDate || dayjs().tz(thresholdTimezone).format("YYYY-MM-DD");
  const rows = await getSheetRows();
  const leads = rowsToMinimalLeads(rows);
  const summary = buildDailySummary(leads, effectiveTargetDate);
  const passed = summary.total > limit;
  const state = readPushState();
  const stateKey = `lead-threshold:${summary.date}:${limit}`;
  const alreadySent = Boolean(state[stateKey]);

  const result = {
    trigger,
    threshold: limit,
    passed,
    alreadySent,
    summary: {
      date: summary.date,
      total: summary.total,
      period: summary.period,
    },
    delivery: null,
  };

  if (!passed || alreadySent || options.dryRun) {
    return result;
  }

  const payload = {
    title: "Lead threshold passed",
    body: `Today reached ${summary.total} leads, above the ${limit} lead target.`,
    url: "/",
    tag: stateKey,
    data: {
      date: summary.date,
      total: summary.total,
      threshold: limit,
    },
  };

  result.delivery = await sendPushToAll(payload);
  state[stateKey] = {
    sentAt: new Date().toISOString(),
    total: summary.total,
  };
  writePushState(state);

  return result;
}

module.exports = {
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
  sendPushToAll,
  checkLeadThresholdAndNotify,
};

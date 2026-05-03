const express = require("express");
const {
  runDailySummaryEmail,
  runWeeklySummaryEmail,
  runAgentAlertsEmail,
  runWeeklyManagerPack,
} = require("../notifications/dailySummary");
const {
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
  sendPushToAll,
  checkLeadThresholdAndNotify,
} = require("../notifications/push");

const router = express.Router();
const CUSTOM_PUSH_ALLOWED_EMAILS = new Set([
  "loukrichi.mohamedfouad@gmail.com",
  "haithemofficial@gmail.com",
]);

function canSendCustomPush(req) {
  const email = String(req.auth?.user?.email || "").trim().toLowerCase();
  return CUSTOM_PUSH_ALLOWED_EMAILS.has(email);
}

router.post("/daily-summary/send", async (req, res) => {
  try {
    const targetDate = req.body?.date || req.query?.date || null;
    const result = await runDailySummaryEmail("manual", targetDate);
    res.json({
      ok: true,
      message: "Daily summary email sent.",
      result,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/weekly-summary/send", async (req, res) => {
  try {
    const targetDate = req.body?.date || req.query?.date || null;
    const result = await runWeeklySummaryEmail("manual", targetDate);
    res.json({
      ok: true,
      message: "Weekly summary email sent.",
      result,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/agent-alerts/send", async (req, res) => {
  try {
    const targetDate = req.body?.date || req.query?.date || null;
    const result = await runAgentAlertsEmail("manual", targetDate);
    res.json({
      ok: true,
      message: "Agent alert emails sent.",
      result,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/weekly-manager-pack/send", async (req, res) => {
  try {
    const targetDate = req.body?.date || req.query?.date || null;
    const result = await runWeeklyManagerPack("manual", targetDate);
    res.json({
      ok: true,
      message: "Weekly manager pack sent.",
      result,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.get("/push/public-key", (_req, res) => {
  const publicKey = getVapidPublicKey();
  res.json({
    ok: true,
    enabled: Boolean(publicKey),
    publicKey,
    threshold: Number(process.env.LEAD_THRESHOLD_PUSH_LIMIT || 100),
  });
});

router.post("/push/subscribe", (req, res) => {
  try {
    const result = saveSubscription(req.body?.subscription || req.body, req.auth?.user);
    res.json({
      ok: true,
      message: "Push subscription saved.",
      result,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/push/unsubscribe", (req, res) => {
  const result = removeSubscription(req.body?.endpoint || "");
  res.json({
    ok: true,
    message: "Push subscription removed.",
    result,
  });
});

router.post("/push/test", async (_req, res) => {
  try {
    const result = await sendPushToAll({
      title: "ElNadjah test notification",
      body: "Your phone push notifications are working.",
      url: "/",
      tag: `test-push-${Date.now()}`,
      data: {
        type: "test",
      },
    });

    res.json({
      ok: true,
      message: "Test push sent.",
      result,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/push/custom", async (req, res) => {
  if (!canSendCustomPush(req)) {
    return res.status(403).json({
      ok: false,
      error: "You are not allowed to send custom push notifications.",
    });
  }

  const text = String(req.body?.text || "").trim();
  if (!text) {
    return res.status(400).json({
      ok: false,
      error: "Notification text is required.",
    });
  }
  if (text.length > 240) {
    return res.status(400).json({
      ok: false,
      error: "Notification text must be 240 characters or less.",
    });
  }

  try {
    const result = await sendPushToAll({
      title: "ElNadjah notification",
      body: text,
      url: "/",
      tag: `custom-push-${Date.now()}`,
      data: {
        type: "custom",
        sender: req.auth?.user?.email || "",
      },
    });

    return res.json({
      ok: true,
      message: "Custom push sent.",
      result,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/lead-threshold/check", async (req, res) => {
  try {
    const targetDate = req.body?.date || req.query?.date || null;
    const dryRun =
      req.body?.dryRun === true || String(req.query?.dryRun || "").toLowerCase() === "true";
    const result = await checkLeadThresholdAndNotify("manual", targetDate, { dryRun });
    res.json({
      ok: true,
      result,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;

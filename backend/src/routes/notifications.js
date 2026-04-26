const express = require("express");
const {
  runDailySummaryEmail,
  runWeeklySummaryEmail,
  runAgentAlertsEmail,
  runWeeklyManagerPack,
} = require("../notifications/dailySummary");

const router = express.Router();

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

module.exports = router;

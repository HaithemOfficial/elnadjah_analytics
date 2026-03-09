const express = require("express");
const { runDailySummaryEmail, runWeeklySummaryEmail } = require("../notifications/dailySummary");

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

module.exports = router;

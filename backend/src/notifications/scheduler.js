const cron = require("node-cron");
const { runDailySummaryEmail } = require("./dailySummary");

let task = null;

function startNotificationScheduler() {
  const enabled = String(process.env.DAILY_SUMMARY_ENABLED || "false").toLowerCase() === "true";
  if (!enabled) {
    return null;
  }

  const cronExpr = process.env.DAILY_SUMMARY_CRON || "0 9 * * *";

  if (!cron.validate(cronExpr)) {
    console.error(`[notifications] Invalid DAILY_SUMMARY_CRON expression: ${cronExpr}`);
    return null;
  }

  task = cron.schedule(
    cronExpr,
    async () => {
      try {
        const result = await runDailySummaryEmail("scheduler");
        console.log(
          `[notifications] Daily summary sent for ${result.summary.date} to ${result.delivery.recipients.join(", ")}`
        );
      } catch (error) {
        console.error(`[notifications] Daily summary failed: ${error.message}`);
      }
    },
    { timezone: process.env.DAILY_SUMMARY_TIMEZONE || "UTC" }
  );

  console.log(
    `[notifications] Daily summary scheduler enabled: '${cronExpr}' (${process.env.DAILY_SUMMARY_TIMEZONE || "UTC"})`
  );

  return task;
}

module.exports = {
  startNotificationScheduler,
};

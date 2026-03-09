const cron = require("node-cron");
const { runDailySummaryEmail, runWeeklySummaryEmail } = require("./dailySummary");

let dailyTask = null;
let weeklyTask = null;

function startNotificationScheduler() {
  const dailyEnabled =
    String(process.env.DAILY_SUMMARY_ENABLED || "false").toLowerCase() === "true";
  const weeklyEnabled =
    String(process.env.WEEKLY_SUMMARY_ENABLED || "false").toLowerCase() === "true";

  if (dailyEnabled) {
    const dailyCronExpr = process.env.DAILY_SUMMARY_CRON || "0 9 * * *";
    const dailyTimezone = process.env.DAILY_SUMMARY_TIMEZONE || "UTC";

    if (!cron.validate(dailyCronExpr)) {
      console.error(`[notifications] Invalid DAILY_SUMMARY_CRON expression: ${dailyCronExpr}`);
    } else {
      dailyTask = cron.schedule(
        dailyCronExpr,
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
        { timezone: dailyTimezone }
      );

      console.log(`[notifications] Daily summary scheduler enabled: '${dailyCronExpr}' (${dailyTimezone})`);
    }
  }

  if (weeklyEnabled) {
    const weeklyCronExpr = process.env.WEEKLY_SUMMARY_CRON || "0 21 * * 5";
    const weeklyTimezone =
      process.env.WEEKLY_SUMMARY_TIMEZONE ||
      process.env.DAILY_SUMMARY_TIMEZONE ||
      "UTC";

    if (!cron.validate(weeklyCronExpr)) {
      console.error(`[notifications] Invalid WEEKLY_SUMMARY_CRON expression: ${weeklyCronExpr}`);
    } else {
      weeklyTask = cron.schedule(
        weeklyCronExpr,
        async () => {
          try {
            const result = await runWeeklySummaryEmail("scheduler");
            console.log(
              `[notifications] Weekly summary sent for ${result.summary.period.start} to ${result.delivery.recipients.join(", ")}`
            );
          } catch (error) {
            console.error(`[notifications] Weekly summary failed: ${error.message}`);
          }
        },
        { timezone: weeklyTimezone }
      );

      console.log(`[notifications] Weekly summary scheduler enabled: '${weeklyCronExpr}' (${weeklyTimezone})`);
    }
  }

  if (!dailyEnabled && !weeklyEnabled) {
    return null;
  }

  return { dailyTask, weeklyTask };
}

module.exports = {
  startNotificationScheduler,
};

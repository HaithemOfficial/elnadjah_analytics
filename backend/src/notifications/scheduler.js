const cron = require("node-cron");
const {
  runDailySummaryEmail,
  runWeeklySummaryEmail,
  runAgentAlertsEmail,
  runWeeklyManagerPack,
} = require("./dailySummary");

let dailyTask = null;
let weeklyTask = null;
let alertsTask = null;

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

  const alertsEnabled =
    String(process.env.AGENT_ALERTS_ENABLED || "false").toLowerCase() === "true";
  if (alertsEnabled) {
    const alertsCronExpr = process.env.AGENT_ALERTS_CRON || process.env.DAILY_SUMMARY_CRON || "0 9 * * *";
    const alertsTimezone =
      process.env.AGENT_ALERTS_TIMEZONE ||
      process.env.WEEKLY_SUMMARY_TIMEZONE ||
      process.env.DAILY_SUMMARY_TIMEZONE ||
      "UTC";

    if (!cron.validate(alertsCronExpr)) {
      console.error(`[notifications] Invalid AGENT_ALERTS_CRON expression: ${alertsCronExpr}`);
    } else {
      alertsTask = cron.schedule(
        alertsCronExpr,
        async () => {
          try {
            const result = await runAgentAlertsEmail("scheduler");
            console.log(
              `[notifications] Agent alerts check completed: ${result.weekly.alertsCount} agents flagged, ${result.delivery.count} emails sent`
            );
          } catch (error) {
            console.error(`[notifications] Agent alerts failed: ${error.message}`);
          }
        },
        { timezone: alertsTimezone }
      );

      console.log(`[notifications] Agent alerts scheduler enabled: '${alertsCronExpr}' (${alertsTimezone})`);
    }
  }

  if (weeklyEnabled) {
    const weeklyCronExpr = process.env.WEEKLY_SUMMARY_CRON || "0 11 * * 5";
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
            const result = await runWeeklyManagerPack("scheduler");
            console.log(
              `[notifications] Weekly manager pack sent for ${result.summary.period.start}; summary to ${result.delivery.summary.recipients.join(", ")}`
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

  if (!dailyEnabled && !weeklyEnabled && !alertsEnabled) {
    return null;
  }

  return { dailyTask, weeklyTask, alertsTask };
}

module.exports = {
  startNotificationScheduler,
};

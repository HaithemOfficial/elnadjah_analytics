const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const isoWeek = require("dayjs/plugin/isoWeek");
const nodemailer = require("nodemailer");
const { getSheetRows } = require("../sheets");

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const HEADER_MAP = {
  timestamp: ["timestamp", "time", "submitted at", "تاريخ"],
  counselor: ["counselor", "counsellor", "مستشار", "استشار"],
  status: ["lead status", "status", "stage", "الحالة", "مرحلة"],
  destination: ["destination", "country", "وجهة", "الدولة", "بلد"],
};

const normalize = (value) => String(value || "").trim().toLowerCase();

function isEmptyStatusValue(value) {
  return (
    !value ||
    value === "-" ||
    value === "--" ||
    value === "n/a" ||
    value === "na" ||
    value === "none" ||
    value === "null" ||
    value === "undefined"
  );
}

function normalizeStatusCategory(status) {
  const value = normalize(status);
  if (isEmptyStatusValue(value)) return "No status";

  if (
    value.includes("not interested") ||
    value.includes("disqualified") ||
    value.includes("رفض")
  ) {
    return "Not Interested / Disqualified";
  }
  if (
    value.includes("not obvious") ||
    value.includes("you don't know") ||
    value.includes("dont know") ||
    value.includes("unknown") ||
    value.includes("غير واضح")
  ) {
    return "Not obvious / You Don't Know";
  }
  if (
    value.includes("follow") ||
    value.includes("follow up") ||
    value.includes("follow-up") ||
    value.includes("followup") ||
    value.includes("no reply") ||
    value.includes("no response")
  ) {
    return "Follow-Up / No Reply";
  }
  if (
    value.includes("needs more info") ||
    value.includes("need more info") ||
    value.includes("needs info") ||
    value.includes("thinking") ||
    value.includes("pending")
  ) {
    return "Needs More Info / Thinking";
  }
  if (
    value.includes("interested") ||
    value.includes("will apply") ||
    value.includes("apply") ||
    value.includes("مهتم")
  ) {
    return "Interested / Will apply";
  }
  return "Other";
}

function parseDate(value) {
  if (!value) return null;
  const asString = String(value).trim();
  const strictFormats = [
    "DD/MM/YYYY HH:mm:ss",
    "DD/MM/YYYY H:mm:ss",
    "DD/MM/YYYY HH:mm",
    "DD/MM/YYYY H:mm",
    "YYYY-MM-DD HH:mm:ss",
    "YYYY-MM-DD",
  ];

  const strictParsed = dayjs(asString, strictFormats, true);
  if (strictParsed.isValid()) return strictParsed.toDate();

  const fallback = dayjs(asString);
  if (fallback.isValid()) return fallback.toDate();

  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + asNumber * 86400000);
  }

  return null;
}

function mapHeaders(headers) {
  const normalized = headers.map((h) => normalize(h));
  const result = {};

  Object.entries(HEADER_MAP).forEach(([key, options]) => {
    const index = normalized.findIndex((header) =>
      options.some((opt) => header.includes(opt))
    );

    const envIndexRaw = process.env[`COLUMN_${key.toUpperCase()}_INDEX`];
    const envIndex =
      envIndexRaw !== undefined && envIndexRaw !== ""
        ? Number(envIndexRaw)
        : null;

    result[key] = Number.isInteger(envIndex) ? envIndex : index;
  });

  return result;
}

function rowsToMinimalLeads(rows) {
  if (!rows.length) return [];
  const [headerRow, ...dataRows] = rows;
  const headerIndex = mapHeaders(headerRow);

  return dataRows
    .filter((row) => row.length)
    .map((row) => {
      const getValue = (key) =>
        headerIndex[key] >= 0 ? row[headerIndex[key]] : "";

      return {
        timestamp: parseDate(getValue("timestamp")),
        counselor: getValue("counselor") || "",
        status: getValue("status") || "",
        destination: getValue("destination") || "",
      };
    });
}

function hasAssignedAgent(lead) {
  return Boolean(String(lead.counselor || "").trim());
}

function getSummaryWindow(targetDate) {
  const summaryTimezone = process.env.DAILY_SUMMARY_TIMEZONE || "UTC";

  if (targetDate) {
    const start = dayjs.tz(targetDate, "YYYY-MM-DD", summaryTimezone).startOf("day");
    if (!start.isValid()) {
      throw new Error("Invalid target date. Use YYYY-MM-DD.");
    }

    return {
      timezone: summaryTimezone,
      start,
      end: start.add(1, "day"),
    };
  }

  const end = dayjs().tz(summaryTimezone).startOf("day");

  return {
    timezone: summaryTimezone,
    start: end.subtract(1, "day"),
    end,
  };
}

function getWeeklySummaryWindow(targetDate) {
  const summaryTimezone =
    process.env.WEEKLY_SUMMARY_TIMEZONE ||
    process.env.DAILY_SUMMARY_TIMEZONE ||
    "UTC";

  if (targetDate) {
    const ref = dayjs.tz(targetDate, "YYYY-MM-DD", summaryTimezone);
    if (!ref.isValid()) {
      throw new Error("Invalid target date. Use YYYY-MM-DD.");
    }

    const start = ref.startOf("isoWeek");
    return {
      timezone: summaryTimezone,
      start,
      end: start.add(7, "day"),
    };
  }

  const now = dayjs().tz(summaryTimezone);
  return {
    timezone: summaryTimezone,
    start: now.startOf("isoWeek"),
    end: now,
  };
}

function buildSummaryForWindow(leads, window, label) {
  const { start, end, timezone: summaryTimezone } = window;

  const periodLeads = leads.filter((lead) => {
    if (!lead.timestamp) return false;
    const ts = dayjs(lead.timestamp).tz(summaryTimezone);
    return (ts.isAfter(start) || ts.isSame(start)) && ts.isBefore(end);
  });

  const total = periodLeads.length;
  const interested = periodLeads.filter(
    (lead) => normalizeStatusCategory(lead.status) === "Interested / Will apply"
  ).length;
  const assigned = periodLeads.filter(hasAssignedAgent).length;
  const notContacted = Math.max(total - assigned, 0);

  const destinationStats = {};
  const byAgent = {};

  periodLeads.forEach((lead) => {
    const destination = lead.destination || "Unknown";
    const isInterested =
      normalizeStatusCategory(lead.status) === "Interested / Will apply";

    if (!destinationStats[destination]) {
      destinationStats[destination] = { total: 0, assigned: 0, interested: 0 };
    }
    destinationStats[destination].total += 1;
    if (isInterested) {
      destinationStats[destination].interested += 1;
    }

    if (hasAssignedAgent(lead)) {
      const agent = lead.counselor.trim();
      if (!byAgent[agent]) {
        byAgent[agent] = {
          contacted: 0,
          interested: 0,
          destinations: {},
        };
      }

      byAgent[agent].contacted += 1;
      if (isInterested) {
        byAgent[agent].interested += 1;
      }

      byAgent[agent].destinations[destination] =
        (byAgent[agent].destinations[destination] || 0) + 1;

      destinationStats[destination].assigned += 1;
    }
  });

  const destinations = Object.entries(destinationStats)
    .map(([name, stats]) => ({
      name,
      total: stats.total,
      assigned: stats.assigned,
      interested: stats.interested,
      notContacted: Math.max(stats.total - stats.assigned, 0),
      contactedRate: stats.total
        ? ((stats.assigned / stats.total) * 100).toFixed(1)
        : "0.0",
    }))
    .sort((a, b) => b.total - a.total);

  const topDestination = destinations[0] || null;
  const daysCount = Math.max(end.diff(start, "day", true), 1);
  const topAgents = Object.entries(byAgent)
    .map(([name, stats]) => {
      const topDestinationEntry = Object.entries(stats.destinations).sort(
        (a, b) => b[1] - a[1]
      )[0];

      return {
        name,
        contacted: stats.contacted,
        interested: stats.interested,
        interestedRate: stats.contacted
          ? ((stats.interested / stats.contacted) * 100).toFixed(1)
          : "0.0",
        avgPerDay: (stats.contacted / daysCount).toFixed(1),
        topDestination: topDestinationEntry
          ? { name: topDestinationEntry[0], count: topDestinationEntry[1] }
          : null,
      };
    })
    .sort((a, b) => b.contacted - a.contacted)
    .slice(0, 10)
    .map((agent, index) => ({
      rank: index + 1,
      ...agent,
    }));

  return {
    type: label,
    date: start.format("YYYY-MM-DD"),
    period: {
      start: start.format("YYYY-MM-DD HH:mm"),
      end: end.format("YYYY-MM-DD HH:mm"),
      timezone: summaryTimezone,
    },
    total,
    interested,
    assigned,
    notContacted,
    interestedRate: total ? ((interested / total) * 100).toFixed(1) : "0.0",
    assignedRate: total ? ((assigned / total) * 100).toFixed(1) : "0.0",
    topDestination: topDestination
      ? { name: topDestination.name, count: topDestination.total }
      : null,
    destinations,
    topAgents,
  };
}

function buildDailySummary(leads, targetDate) {
  const window = getSummaryWindow(targetDate);
  return buildSummaryForWindow(leads, window, "daily");
}

function buildWeeklySummary(leads, targetDate) {
  const window = getWeeklySummaryWindow(targetDate);
  return buildSummaryForWindow(leads, window, "weekly");
}

function parseRecipients(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function buildEmailHtml(summary) {
  const heading = summary.type === "weekly" ? "ElNadjah Weekly Summary" : "ElNadjah Daily Summary";
  const destinationsRows = summary.destinations.length
    ? summary.destinations
        .map((item) => {
          const weeklyCols =
            summary.type === "weekly"
              ? `<td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.interested}</td><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.notContacted}</td>`
              : `<td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.contactedRate}%</td>`;

          return `<tr><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.name}</td><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.total}</td><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.assigned}</td>${weeklyCols}</tr>`;
        })
        .join("")
    : "<tr><td colspan=\"5\" style=\"padding:6px 10px;color:#64748b;\">No destination data in this period.</td></tr>";

  const topAgentsRows = summary.topAgents.length
    ? summary.topAgents
        .map((item, index) => {
          if (summary.type === "weekly") {
            return `<tr><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.rank || index + 1}</td><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.name}</td><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.contacted}</td><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.interested}</td><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.interestedRate}%</td><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.avgPerDay}</td><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.topDestination ? `${item.topDestination.name} (${item.topDestination.count})` : "-"}</td></tr>`;
          }

          return `<tr><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${index + 1}</td><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.name}</td><td style=\"padding:6px 10px;border-bottom:1px solid #e2e8f0;\">${item.contacted}</td></tr>`;
        })
        .join("")
    : "<tr><td colspan=\"7\" style=\"padding:6px 10px;color:#64748b;\">No assigned agents in this period.</td></tr>";

  return `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a;">
      <h2 style="margin-bottom:4px;">${heading}</h2>
      <p style="margin-top:0;color:#475569;">Period: ${summary.period.start} -> ${summary.period.end} (${summary.period.timezone})</p>

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;"><strong>Total leads</strong><br/>${summary.total}</div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;"><strong>Assigned</strong><br/>${summary.assigned} (${summary.assignedRate}%)</div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;"><strong>Interested</strong><br/>${summary.interested} (${summary.interestedRate}%)</div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;"><strong>Not contacted</strong><br/>${summary.notContacted}</div>
      </div>

      <p><strong>Top destination:</strong> ${summary.topDestination ? `${summary.topDestination.name} (${summary.topDestination.count})` : "-"}</p>

      <h3 style="margin-bottom:8px;">Destinations leaderboard</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <thead>
          <tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:6px 10px;">Destination</th>
            <th style="padding:6px 10px;">Total leads</th>
            <th style="padding:6px 10px;">Assigned</th>
            ${
              summary.type === "weekly"
                ? '<th style="padding:6px 10px;">Interested</th><th style="padding:6px 10px;">Not contacted</th>'
                : '<th style="padding:6px 10px;">Contacted ratio</th>'
            }
          </tr>
        </thead>
        <tbody>${destinationsRows}</tbody>
      </table>

      <h3 style="margin-bottom:8px;">Team leaderboard</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:6px 10px;">#</th>
            <th style="padding:6px 10px;">Agent</th>
            ${
              summary.type === "weekly"
                ? '<th style="padding:6px 10px;">Contacted</th><th style="padding:6px 10px;">Interested</th><th style="padding:6px 10px;">Interested rate</th><th style="padding:6px 10px;">Avg/day</th><th style="padding:6px 10px;">Top destination</th>'
                : '<th style="padding:6px 10px;">Assigned leads</th>'
            }
          </tr>
        </thead>
        <tbody>${topAgentsRows}</tbody>
      </table>
    </div>
  `;
}

async function sendDailySummaryEmail(summary) {
  const recipients = parseRecipients(process.env.DAILY_SUMMARY_RECIPIENTS);
  const from = process.env.SMTP_FROM;
  const transporter = getTransporter();

  if (!recipients.length) {
    throw new Error("DAILY_SUMMARY_RECIPIENTS is not configured.");
  }
  if (!from) {
    throw new Error("SMTP_FROM is not configured.");
  }
  if (!transporter) {
    throw new Error("SMTP settings are incomplete (SMTP_HOST/PORT/USER/PASS).");
  }

  const subject = `ElNadjah Daily Summary - ${summary.date}`;
  const text = [
    `ElNadjah Daily Summary (${summary.period.start} -> ${summary.period.end} ${summary.period.timezone})`,
    `Total leads: ${summary.total}`,
    `Assigned: ${summary.assigned} (${summary.assignedRate}%)`,
    `Not contacted: ${summary.notContacted}`,
    `Interested: ${summary.interested} (${summary.interestedRate}%)`,
    `Top destination: ${summary.topDestination ? `${summary.topDestination.name} (${summary.topDestination.count})` : "-"}`,
  ].join("\n");

  const info = await transporter.sendMail({
    from,
    to: recipients.join(","),
    subject,
    text,
    html: buildEmailHtml(summary),
  });

  return { messageId: info.messageId, recipients };
}

async function sendWeeklySummaryEmail(summary) {
  const recipients = parseRecipients(
    process.env.WEEKLY_SUMMARY_RECIPIENTS || process.env.DAILY_SUMMARY_RECIPIENTS
  );
  const from = process.env.SMTP_FROM;
  const transporter = getTransporter();

  if (!recipients.length) {
    throw new Error("WEEKLY_SUMMARY_RECIPIENTS (or DAILY_SUMMARY_RECIPIENTS) is not configured.");
  }
  if (!from) {
    throw new Error("SMTP_FROM is not configured.");
  }
  if (!transporter) {
    throw new Error("SMTP settings are incomplete (SMTP_HOST/PORT/USER/PASS).");
  }

  const subject = `ElNadjah Weekly Summary - Week of ${summary.date}`;
  const text = [
    `ElNadjah Weekly Summary (${summary.period.start} -> ${summary.period.end} ${summary.period.timezone})`,
    `Total leads: ${summary.total}`,
    `Assigned: ${summary.assigned} (${summary.assignedRate}%)`,
    `Not contacted: ${summary.notContacted}`,
    `Interested: ${summary.interested} (${summary.interestedRate}%)`,
    "Team leaderboard:",
    ...summary.topAgents.slice(0, 5).map(
      (agent) =>
        `- #${agent.rank} ${agent.name}: Contacted ${agent.contacted}, Interested ${agent.interested}, Interested rate ${agent.interestedRate}%, Avg/day ${agent.avgPerDay}, Top destination ${agent.topDestination ? `${agent.topDestination.name} (${agent.topDestination.count})` : "-"}`
    ),
  ].join("\n");

  const info = await transporter.sendMail({
    from,
    to: recipients.join(","),
    subject,
    text,
    html: buildEmailHtml(summary),
  });

  return { messageId: info.messageId, recipients };
}

async function runDailySummaryEmail(trigger = "manual", targetDate) {
  const rows = await getSheetRows();
  const leads = rowsToMinimalLeads(rows);
  const summary = buildDailySummary(leads, targetDate);
  const delivery = await sendDailySummaryEmail(summary);

  return {
    trigger,
    summary,
    delivery,
  };
}

async function runWeeklySummaryEmail(trigger = "manual", targetDate) {
  const rows = await getSheetRows();
  const leads = rowsToMinimalLeads(rows);
  const summary = buildWeeklySummary(leads, targetDate);
  const delivery = await sendWeeklySummaryEmail(summary);

  return {
    trigger,
    summary,
    delivery,
  };
}

module.exports = {
  runDailySummaryEmail,
  runWeeklySummaryEmail,
};

const express = require("express");
const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
const { getSheetRows } = require("../sheets");

dayjs.extend(customParseFormat);

const router = express.Router();

const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60000);
let cachedPayload = {
  fetchedAt: 0,
  rows: null,
  leads: null,
};

async function getCachedLeads() {
  const now = Date.now();
  if (cachedPayload.rows && now - cachedPayload.fetchedAt < CACHE_TTL_MS) {
    return { rows: cachedPayload.rows, leads: cachedPayload.leads };
  }

  const rows = await getSheetRows();
  const leads = rowsToLeads(rows);
  cachedPayload = { fetchedAt: now, rows, leads };
  return { rows, leads };
}

const HEADER_MAP = {
  timestamp: ["timestamp", "time", "submitted at", "date", "تاريخ", "التاريخ", "الوقت"],
  email: ["email", "email address", "mail", "البريد", "الايميل"],
  eligibility: ["eligibility", "eligible", "not eligible", "مؤهل", "غير مؤهل"],
  name: ["name", "full name", "lead name", "الاسم", "اسم"],
  phone: ["phone", "phone number", "mobile", "mobile number", "الهاتف", "رقم"],
  counselor: [
    "counselor",
    "counsellor",
    "agent",
    "owner",
    "advisor",
    "مستشار",
    "استشار",
    "الوكيل",
    "المكلف",
  ],
  status: [
    "lead status",
    "status",
    "stage",
    "pipeline",
    "الحالة",
    "مرحلة",
    "المرحلة",
  ],
  adFlag: ["ad", "ads", "camp", "اعلان", "إعلان"],
  destination: ["destination", "country", "target country", "وجهة", "الوجهة", "الدولة", "بلد"],
  bac: [
    "bac",
    "baccalaureate",
    "average",
    "score",
    "moyenne",
    "معدل البكالوريا",
    "البكالوريا",
    "المالية",
    "تمويل",
  ],
  budget: [
    "budget",
    "estimated budget",
    "financial budget",
    "كم تقدر ميزانيتك",
    "ميزانيتك",
  ],
  source: [
    "source",
    "channel",
    "how did you find",
    "كيف وجدتنا",
    "مصدر",
    "السوشيال",
    "instagram",
    "tiktok",
    "facebook",
    "youtube",
  ],
  level: ["level", "المستوى", "مستواك", "niveau"],
  year: ["year", "السنة", "سنة"],
  lastStateUpdate: [
    "edited timestamp",
    "edited at",
    "stage edited",
    "last state",
    "last update",
    "updated at",
    "آخر تعديل",
    "آخر تحديث",
  ],
  firstContact: ["first contact", "contacted", "contact date", "تواصل", "اتصال", "أول تواصل"],
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

  // Match negative/unclear statuses first to avoid false positives like
  // "not interested" being counted as "interested".
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

function rowsToLeads(rows) {
  if (!rows.length) return [];
  const [headerRow, ...dataRows] = rows;
  const headerIndex = mapHeaders(headerRow);

  return dataRows
    .filter((row) => row.length)
    .map((row) => {
      const getValue = (key) =>
        headerIndex[key] >= 0 ? row[headerIndex[key]] : "";

      const timestamp = parseDate(getValue("timestamp"));
      const lastStateUpdate = parseDate(getValue("lastStateUpdate"));
      const firstContact = parseDate(getValue("firstContact"));

      return {
        timestamp,
        email: getValue("email") || "",
        eligibility: getValue("eligibility") || "",
        name: getValue("name") || "",
        phone: getValue("phone") || "",
        counselor: getValue("counselor") || "",
        status: getValue("status") || "",
        adFlag: getValue("adFlag") || "",
        destination: getValue("destination") || "",
        bac: getValue("bac") || "",
        budget: getValue("budget") || "",
        source: getValue("source") || "",
        level: getValue("level") || "",
        year: getValue("year") || "",
        lastStateUpdate,
        firstContact,
      };
    });
}

function getLeadDate(lead, dateField) {
  if (dateField === "lastStateUpdate") {
    return lead.lastStateUpdate || null;
  }
  if (dateField === "timestamp") {
    return lead.timestamp || null;
  }
  return lead.timestamp || lead.lastStateUpdate || null;
}

function getContactDate(lead) {
  // Contacted is defined strictly by column V (Edited timestamp).
  return lead.lastStateUpdate || null;
}

function hasContactedLead(lead) {
  return Boolean(getContactDate(lead));
}

function filterLeads(leads, {
  startDate,
  endDate,
  counselor,
  destination,
  dateField,
}) {
  return leads.filter((lead) => {
    if (counselor && lead.counselor !== counselor) return false;
    if (destination && lead.destination !== destination) return false;
    const leadDate = getLeadDate(lead, dateField);
    if (!leadDate) return false;

    if (startDate && dayjs(leadDate).isBefore(startDate, "day")) {
      return false;
    }
    if (endDate && dayjs(leadDate).isAfter(endDate, "day")) {
      return false;
    }

    return true;
  });
}

function groupCount(leads, key, emptyLabel = "Unknown") {
  const counts = {};
  leads.forEach((lead) => {
    const rawValue = lead[key];
    const value = rawValue ? rawValue : emptyLabel;
    counts[value] = (counts[value] || 0) + 1;
  });
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function groupStatusCategories(leads) {
  const counts = {};
  leads.forEach((lead) => {
    const category = normalizeStatusCategory(lead.status);
    counts[category] = (counts[category] || 0) + 1;
  });

  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function buildDetails(leads, key, emptyLabel = "Unknown") {
  const detailsMap = new Map();

  leads.forEach((lead) => {
    const rawValue = lead[key];
    const name = rawValue ? rawValue : emptyLabel;
    const category = normalizeStatusCategory(lead.status);

    if (!detailsMap.has(name)) {
      detailsMap.set(name, {
        name,
        total: 0,
        interested: 0,
        followUp: 0,
        noReply: 0,
        needsMoreInfo: 0,
      });
    }

    const entry = detailsMap.get(name);
    entry.total += 1;

    if (category === "Interested / Will apply") entry.interested += 1;
    if (category === "Follow-Up / No Reply") {
      entry.followUp += 1;
      entry.noReply += 1;
    }
    if (category === "Needs More Info / Thinking") entry.needsMoreInfo += 1;
  });

  return Array.from(detailsMap.values()).sort((a, b) => b.total - a.total);
}

function leadsOverTime(leads, dateField, granularity) {
  const counts = {};
  const format = granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  leads.forEach((lead) => {
    const leadDate = getLeadDate(lead, dateField);
    if (!leadDate) return;
    const dateKey = dayjs(leadDate).format(format);
    counts[dateKey] = (counts[dateKey] || 0) + 1;
  });

  return Object.keys(counts)
    .sort()
    .map((date) => ({ date, count: counts[date] }));
}

function leadsOverTimeByDestination(leads, dateField, granularity) {
  const dates = {};
  const format = granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  leads.forEach((lead) => {
    const leadDate = getLeadDate(lead, dateField);
    if (!leadDate) return;
    const dateKey = dayjs(leadDate).format(format);
    const destination = lead.destination || "Unknown";
    dates[dateKey] = dates[dateKey] || {};
    dates[dateKey][destination] = (dates[dateKey][destination] || 0) + 1;
  });

  return Object.keys(dates)
    .sort()
    .map((date) => ({ date, ...dates[date] }));
}

function leadsOverTimeBySource(leads, dateField, granularity) {
  const buckets = {};
  const format = granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  leads.forEach((lead) => {
    const leadDate = getLeadDate(lead, dateField);
    if (!leadDate) return;
    const key = dayjs(leadDate).format(format);
    const source = lead.source || "Unknown";

    if (!buckets[key]) buckets[key] = { date: key };
    buckets[key][source] = (buckets[key][source] || 0) + 1;
  });

  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
}

function leadsOverTimeBySourceInterested(leads, dateField, granularity) {
  const buckets = {};
  const format = granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  leads.forEach((lead) => {
    const leadDate = getLeadDate(lead, dateField);
    if (!leadDate) return;
    if (normalizeStatusCategory(lead.status) !== "Interested / Will apply") return;

    const key = dayjs(leadDate).format(format);
    const source = lead.source || "Unknown";

    if (!buckets[key]) buckets[key] = { date: key };
    buckets[key][source] = (buckets[key][source] || 0) + 1;
  });

  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
}

function leadsOverTimeInterested(leads, dateField, granularity) {
  const counts = {};
  const format = granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  leads.forEach((lead) => {
    const leadDate = getLeadDate(lead, dateField);
    if (!leadDate) return;
    if (normalizeStatusCategory(lead.status) !== "Interested / Will apply") return;
    const key = dayjs(leadDate).format(format);
    counts[key] = (counts[key] || 0) + 1;
  });

  return Object.keys(counts)
    .sort()
    .map((date) => ({ date, count: counts[date] }));
}

function leadsOverTimeByCounselor(leads, granularity, startDate, endDate) {
  const buckets = {};
  const format = granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  leads.forEach((lead) => {
    if (!lead.counselor) return;
    const contactDate = getContactDate(lead);
    if (!contactDate) return;
    if (startDate && dayjs(contactDate).isBefore(startDate, "day")) return;
    if (endDate && dayjs(contactDate).isAfter(endDate, "day")) return;
    const key = dayjs(contactDate).format(format);
    const counselor = lead.counselor;

    if (!buckets[key]) buckets[key] = { date: key };
    buckets[key][counselor] = (buckets[key][counselor] || 0) + 1;
  });

  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
}

function leadsOverTimePerformance(leads, dateField, granularity, startDate, endDate) {
  const totals = {};
  const contacted = {};
  const format = granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  leads.forEach((lead) => {
    const leadDate = getLeadDate(lead, dateField);
    if (
      leadDate &&
      (!startDate || !dayjs(leadDate).isBefore(startDate, "day")) &&
      (!endDate || !dayjs(leadDate).isAfter(endDate, "day"))
    ) {
      const key = dayjs(leadDate).format(format);
      totals[key] = (totals[key] || 0) + 1;
      const contactDate = getContactDate(lead);
      if (
        contactDate &&
        (!startDate || !dayjs(contactDate).isBefore(startDate, "day")) &&
        (!endDate || !dayjs(contactDate).isAfter(endDate, "day"))
      ) {
        const contactKey = dayjs(contactDate).format(format);
        contacted[contactKey] = (contacted[contactKey] || 0) + 1;
      }
    }
  });

  const allDates = new Set([...Object.keys(totals), ...Object.keys(contacted)]);
  return Array.from(allDates)
    .sort()
    .map((date) => ({
      date,
      total: totals[date] || 0,
      contacted: contacted[date] || 0,
    }));
}

function buildOverallPerformance(series) {
  if (!series || series.length < 2) return [];
  return series
    .map((point, index) => {
      if (index === 0) return null;
      const prev = series[index - 1];
      const demandGrowth = prev.total
        ? Math.trunc(((point.total - prev.total) / prev.total) * 100)
        : point.total
        ? 100
        : 0;
      const contactedGrowth = prev.contacted
        ? Math.trunc(((point.contacted - prev.contacted) / prev.contacted) * 100)
        : point.contacted
        ? 100
        : 0;
      return {
        date: point.date,
        performance: Math.trunc((demandGrowth + contactedGrowth) / 2),
      };
    })
    .filter(Boolean);
}

function getLatestTimestamp(leads, dateField) {
  const timestamps = leads
    .map((lead) => getLeadDate(lead, dateField))
    .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));

  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps.map((value) => value.getTime())));
}

function getEarliestTimestamp(leads, dateField) {
  const timestamps = leads
    .map((lead) => getLeadDate(lead, dateField))
    .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));

  if (!timestamps.length) return null;
  return new Date(Math.min(...timestamps.map((value) => value.getTime())));
}

function calcLastMonthStats(leads) {
  const end = dayjs();
  const last30Start = end.subtract(30, "day");
  const prev30Start = end.subtract(60, "day");

  const last30 = leads.filter((lead) =>
    lead.timestamp ? dayjs(lead.timestamp).isAfter(last30Start) : false
  );
  const prev30 = leads.filter((lead) =>
    lead.timestamp
      ? dayjs(lead.timestamp).isAfter(prev30Start) &&
        dayjs(lead.timestamp).isBefore(last30Start)
      : false
  );

  const pctChange = (current, previous) => {
    if (!previous) return current ? 100 : 0;
    return Math.trunc(((current - previous) / previous) * 100);
  };

  return {
    total: {
      current: last30.length,
      previous: prev30.length,
      pctChange: pctChange(last30.length, prev30.length),
    },
  };
}

function countLeadsInRange(leads, startDate, endDate, dateField) {
  return leads.filter((lead) => {
    const leadDate = getLeadDate(lead, dateField);
    if (!leadDate) return false;

    if (startDate && dayjs(leadDate).isBefore(startDate, "day")) {
      return false;
    }
    if (endDate && dayjs(leadDate).isAfter(endDate, "day")) {
      return false;
    }

    return true;
  }).length;
}

function countStatusInRange(leads, startDate, endDate, dateField) {
  const filtered = leads.filter((lead) => {
    const leadDate = getLeadDate(lead, dateField);
    if (!leadDate) return false;

    if (startDate && dayjs(leadDate).isBefore(startDate, "day")) {
      return false;
    }
    if (endDate && dayjs(leadDate).isAfter(endDate, "day")) {
      return false;
    }

    return true;
  });

  const counts = {
    total: filtered.length,
    interested: 0,
    followUp: 0,
    needsMoreInfo: 0,
    notInterested: 0,
    notObvious: 0,
    notContacted: 0,
  };

  filtered.forEach((lead) => {
    if (!hasContactedLead(lead)) counts.notContacted += 1;
    const category = normalizeStatusCategory(lead.status);
    if (category === "Interested / Will apply") counts.interested += 1;
    if (category === "Follow-Up / No Reply") counts.followUp += 1;
    if (category === "Needs More Info / Thinking") counts.needsMoreInfo += 1;
    if (category === "Not Interested / Disqualified") counts.notInterested += 1;
    if (category === "Not obvious / You Don't Know") counts.notObvious += 1;
  });

  return counts;
}

function pctChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.trunc(((current - previous) / previous) * 100);
}

function calcPeriodComparison(leads, startDate, endDate, dateField) {
  if (!startDate || !endDate) return null;

  const periodStart = dayjs(startDate).startOf("day");
  const periodEnd = dayjs(endDate).endOf("day");
  const lengthDays = periodEnd.diff(periodStart, "day") + 1;

  const previousEnd = periodStart.subtract(1, "day").endOf("day");
  const previousStart = previousEnd.subtract(lengthDays - 1, "day").startOf("day");

  const current = countStatusInRange(leads, periodStart, periodEnd, dateField);
  const previous = countStatusInRange(
    leads,
    previousStart,
    previousEnd,
    dateField
  );

  return {
    label: `${previousStart.format("YYYY-MM-DD")} → ${previousEnd.format(
      "YYYY-MM-DD"
    )}`,
    totals: {
      current: current.total,
      previous: previous.total,
      pctChange: pctChange(current.total, previous.total),
    },
    interested: {
      current: current.interested,
      previous: previous.interested,
      pctChange: pctChange(current.interested, previous.interested),
    },
    followUp: {
      current: current.followUp,
      previous: previous.followUp,
      pctChange: pctChange(current.followUp, previous.followUp),
    },
    needsMoreInfo: {
      current: current.needsMoreInfo,
      previous: previous.needsMoreInfo,
      pctChange: pctChange(current.needsMoreInfo, previous.needsMoreInfo),
    },
    notInterested: {
      current: current.notInterested,
      previous: previous.notInterested,
      pctChange: pctChange(current.notInterested, previous.notInterested),
    },
    notObvious: {
      current: current.notObvious,
      previous: previous.notObvious,
      pctChange: pctChange(current.notObvious, previous.notObvious),
    },
    notContacted: {
      current: current.notContacted,
      previous: previous.notContacted,
      pctChange: pctChange(current.notContacted, previous.notContacted),
    },
  };
}

function countByDestinationInRange(leads, startDate, endDate, dateField) {
  const counts = {};
  leads.forEach((lead) => {
    const leadDate = getLeadDate(lead, dateField);
    if (!leadDate) return;
    if (startDate && dayjs(leadDate).isBefore(startDate, "day")) return;
    if (endDate && dayjs(leadDate).isAfter(endDate, "day")) return;

    const destination = lead.destination || "Unknown";
    counts[destination] = (counts[destination] || 0) + 1;
  });
  return counts;
}

function topCountryByGrowth(leads, startDate, endDate, dateField) {
  if (!startDate || !endDate) return null;

  const periodStart = dayjs(startDate).startOf("day");
  const periodEnd = dayjs(endDate).endOf("day");
  const lengthDays = periodEnd.diff(periodStart, "day") + 1;
  const previousEnd = periodStart.subtract(1, "day").endOf("day");
  const previousStart = previousEnd.subtract(lengthDays - 1, "day").startOf("day");

  const current = countByDestinationInRange(leads, periodStart, periodEnd, dateField);
  const previous = countByDestinationInRange(
    leads,
    previousStart,
    previousEnd,
    dateField
  );

  let best = null;
  Object.keys(current).forEach((name) => {
    const curr = current[name] || 0;
    const prev = previous[name] || 0;
    const pct = prev ? ((curr - prev) / prev) * 100 : curr ? 100 : 0;
    if (!best || pct > best.pctChange) {
      best = { name, current: curr, previous: prev, pctChange: Math.trunc(pct) };
    }
  });

  return best;
}

function buildAgentLeaderboard(leads, startDate, endDate, dateField) {
  const periodStart = startDate ? dayjs(startDate).startOf("day") : null;
  const periodEnd = endDate ? dayjs(endDate).endOf("day") : null;
  const lengthDays =
    periodStart && periodEnd ? periodEnd.diff(periodStart, "day") + 1 : null;
  const prevEnd = periodStart ? periodStart.subtract(1, "day").endOf("day") : null;
  const prevStart =
    prevEnd && lengthDays ? prevEnd.subtract(lengthDays - 1, "day") : null;

  const initRow = () => ({
    contacted: 0,
    interested: 0,
    responseCount: 0,
    responseHoursSum: 0,
    followUpCount: 0,
    followUpDaysSum: 0,
    destinationCounts: {},
  });

  const current = new Map();
  const previous = new Map();

  leads.forEach((lead) => {
    if (!lead.counselor) return;
    const contactDate = getContactDate(lead);
    if (!contactDate) return;

    const targetMap =
      periodStart && periodEnd
        ? dayjs(contactDate).isBefore(periodStart, "day") ||
          dayjs(contactDate).isAfter(periodEnd, "day")
          ? null
          : current
        : current;

    if (!targetMap) return;

    if (!targetMap.has(lead.counselor)) targetMap.set(lead.counselor, initRow());
    const row = targetMap.get(lead.counselor);
    row.contacted += 1;

    const destination = lead.destination || "Unknown";
    row.destinationCounts[destination] =
      (row.destinationCounts[destination] || 0) + 1;

    if (normalizeStatusCategory(lead.status) === "Interested / Will apply") {
      row.interested += 1;
    }

    if (lead.timestamp && contactDate) {
      const days = dayjs(contactDate)
        .startOf("day")
        .diff(dayjs(lead.timestamp).startOf("day"), "day");
      if (days >= 0) {
        row.responseCount += 1;
        row.responseHoursSum += days;
      }

      const inRange =
        (!periodStart || !dayjs(contactDate).isBefore(periodStart, "day")) &&
        (!periodEnd || !dayjs(contactDate).isAfter(periodEnd, "day"));
      if (inRange && days >= 0) {
        row.followUpCount += 1;
        row.followUpDaysSum += days;
      }
    }
  });

  if (prevStart && prevEnd) {
    leads.forEach((lead) => {
      if (!lead.counselor) return;
      const contactDate = getContactDate(lead);
      if (!contactDate) return;
      if (
        dayjs(contactDate).isBefore(prevStart, "day") ||
        dayjs(contactDate).isAfter(prevEnd, "day")
      ) {
        return;
      }

      if (!previous.has(lead.counselor)) previous.set(lead.counselor, initRow());
      const row = previous.get(lead.counselor);
      row.contacted += 1;

      const destination = lead.destination || "Unknown";
      row.destinationCounts[destination] =
        (row.destinationCounts[destination] || 0) + 1;
      if (normalizeStatusCategory(lead.status) === "Interested / Will apply") {
        row.interested += 1;
      }
      if (lead.timestamp && contactDate) {
        const days = dayjs(contactDate)
          .startOf("day")
          .diff(dayjs(lead.timestamp).startOf("day"), "day");
        if (days >= 0) {
          row.responseCount += 1;
          row.responseHoursSum += days;
        }
      }
    });
  }

  const leaderboard = Array.from(current.entries()).map(([name, row]) => {
    const avgResponseDays = row.responseCount
      ? Math.trunc(row.responseHoursSum / row.responseCount)
      : null;
    const prev = previous.get(name);
    const prevAvg = prev && prev.responseCount
      ? prev.responseHoursSum / prev.responseCount
      : null;
    const responseChangePct =
      prevAvg !== null && avgResponseDays !== null
        ? Number((((avgResponseDays - prevAvg) / prevAvg) * 100).toFixed(1))
        : null;
    const contactedChangePct = prev
      ? pctChange(row.contacted, prev.contacted)
      : null;
    const interestedChangePct = prev
      ? pctChange(row.interested, prev.interested)
      : null;
    const followUpSpeedDays = row.followUpCount
      ? Math.trunc(row.followUpDaysSum / row.followUpCount)
      : null;
    const topCountry = Object.entries(row.destinationCounts).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0] || "-";
    const interestedRate = row.contacted
      ? Math.trunc((row.interested / row.contacted) * 100)
      : 0;
    const avgContactedPerDay = lengthDays
      ? Number((row.contacted / lengthDays).toFixed(2))
      : null;

    return {
      name,
      contacted: row.contacted,
      interested: row.interested,
      interestedRate,
      topCountry,
      followUpSpeedDays,
      avgContactedPerDay,
      avgResponseDays,
      responseChangePct,
      contactedChangePct,
      interestedChangePct,
    };
  });

  return leaderboard.sort((a, b) => b.contacted - a.contacted);
}

function uniqueAgents(leads) {
  const set = new Set();
  leads.forEach((lead) => {
    if (lead.counselor) set.add(lead.counselor);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

router.get("/debug/sheet-columns", async (req, res) => {
  try {
    const { getSheetRows } = require("../sheets");
    const rows = await getSheetRows();
    if (!rows.length) return res.json({ ok: false, error: "No rows returned from sheet." });

    const headerRow = rows[0];
    const headerIndex = mapHeaders(headerRow);

    const sample = rows.slice(1, 6).map((row, i) => ({
      row: i + 2,
      counselor: headerIndex.counselor >= 0 ? (row[headerIndex.counselor] || "") : "(col not found)",
      lastStateUpdate_raw: headerIndex.lastStateUpdate >= 0 ? (row[headerIndex.lastStateUpdate] ?? "(empty)") : "(col not found)",
      lastStateUpdate_parsed: headerIndex.lastStateUpdate >= 0 ? String(parseDate(row[headerIndex.lastStateUpdate])) : null,
      timestamp_raw: headerIndex.timestamp >= 0 ? (row[headerIndex.timestamp] ?? "(empty)") : "(col not found)",
    }));

    res.json({
      ok: true,
      totalRows: rows.length - 1,
      headers: headerRow.map((h, i) => ({ index: i, col: String.fromCharCode(65 + i), header: h })),
      detectedIndices: headerIndex,
      sample,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/leads", async (req, res) => {
  try {
    const { leads } = await getCachedLeads();

    res.json({
      count: leads.length,
      leads,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const { leads } = await getCachedLeads();

    const allTime = req.query.all === "true";
    const dateField = req.query.dateField || "timestamp";
    const hasStart = Boolean(req.query.startDate) && !allTime;
    const hasEnd = Boolean(req.query.endDate) && !allTime;
    const latestTimestamp = getLatestTimestamp(leads, dateField);
    const latestDate = latestTimestamp ? dayjs(latestTimestamp) : dayjs();
    const earliestTimestamp = getEarliestTimestamp(leads, dateField);
    const earliestDate = earliestTimestamp ? dayjs(earliestTimestamp) : dayjs();
    const defaultEnd = dayjs().endOf("day");
    const defaultStart = dayjs().startOf("month");

    const startDate = allTime
      ? null
      : hasStart
      ? dayjs(req.query.startDate).startOf("day")
      : defaultStart;
    const endDate = allTime
      ? null
      : hasEnd
      ? dayjs(req.query.endDate).endOf("day")
      : defaultEnd;
    const counselor = req.query.counselor || "";
    const destination = req.query.destination || "";

    const filtered = filterLeads(leads, {
      startDate,
      endDate,
      counselor,
      destination,
      dateField,
    });

    const rangeDays = startDate && endDate ? dayjs(endDate).diff(startDate, "day") + 1 : null;
    const granularity = rangeDays && rangeDays <= 60 ? "day" : "month";

    const statusGroups = groupStatusCategories(filtered);
    const counselorGroups = groupCount(filtered, "counselor", "Not assigned yet");
    const destinationGroups = groupCount(filtered, "destination");
    const sourceGroups = groupCount(filtered, "source");
    const financeGroups = groupCount(filtered, "bac");
    const eligibilityGroups = groupCount(filtered, "eligibility", "Unknown");
    const stageGroups = groupCount(filtered, "status", "No stage");

    const totals = {
      total: filtered.length,
      eligible: filtered.filter((lead) => {
        const value = normalize(lead.eligibility);
        return value.includes("eligible") && !value.includes("not");
      }).length,
      notEligible: filtered.filter((lead) => {
        const value = normalize(lead.eligibility);
        return value.includes("not eligible");
      }).length,
      interested: filtered.filter(
        (lead) => normalizeStatusCategory(lead.status) === "Interested / Will apply"
      ).length,
      followUp: filtered.filter(
        (lead) => normalizeStatusCategory(lead.status) === "Follow-Up / No Reply"
      ).length,
      needsMoreInfo: filtered.filter(
        (lead) =>
          normalizeStatusCategory(lead.status) === "Needs More Info / Thinking"
      ).length,
      notInterested: filtered.filter(
        (lead) =>
          normalizeStatusCategory(lead.status) === "Not Interested / Disqualified"
      ).length,
      notObvious: filtered.filter(
        (lead) =>
          normalizeStatusCategory(lead.status) === "Not obvious / You Don't Know"
      ).length,
      notContacted: filtered.filter((lead) => !hasContactedLead(lead)).length,
    };

    const contactedCount = filtered.filter(hasContactedLead).length;
    const responseRate = filtered.length
      ? Math.trunc((contactedCount / filtered.length) * 100)
      : 0;
    const responseSpeedDays = (() => {
      let totalDays = 0;
      let validCount = 0;
      filtered.forEach((lead) => {
        const contactDate = getContactDate(lead);
        if (!lead.timestamp || !contactDate) return;
        if (startDate && dayjs(contactDate).isBefore(startDate, "day")) return;
        if (endDate && dayjs(contactDate).isAfter(endDate, "day")) return;
        const days = dayjs(contactDate)
          .startOf("day")
          .diff(dayjs(lead.timestamp).startOf("day"), "day");
        if (days >= 0) {
          totalDays += days;
          validCount += 1;
        }
      });
      if (!validCount) return 0;
      return Math.trunc(totalDays / validCount);
    })();

    res.json({
      latestDate: latestDate.format("YYYY-MM-DD"),
      range: {
        startDate: (startDate || earliestDate).format("YYYY-MM-DD"),
        endDate: (endDate || latestDate).format("YYYY-MM-DD"),
      },
         avgPerDay: (() => {
           const effectiveStart = startDate || earliestDate;
           const effectiveEnd = endDate || latestDate;
           const days = effectiveEnd.diff(effectiveStart, "day") + 1;
           if (!days || days <= 0) return 0;
           return Number((filtered.length / days).toFixed(2));
         })(),
      totals,
      responseRate,
      responseSpeedDays,
      comparison: calcPeriodComparison(leads, startDate, endDate, dateField),
      topCountryGrowth: topCountryByGrowth(leads, startDate, endDate, dateField),
      lastMonth: calcLastMonthStats(leads),
      byStatus: statusGroups,
      byStage: stageGroups,
      byCounselor: counselorGroups,
      byDestination: destinationGroups,
      bySource: sourceGroups,
      byFinanceState: financeGroups,
      byEligibility: eligibilityGroups,
      byCounselorDetails: buildDetails(filtered, "counselor", "Not assigned yet"),
      byDestinationDetails: buildDetails(filtered, "destination", "Unknown"),
      agentLeaderboard: buildAgentLeaderboard(leads, startDate, endDate, dateField),
      allAgents: uniqueAgents(leads),
      timeGranularity: granularity,
      leadsOverTime: leadsOverTime(filtered, dateField, granularity),
      leadsOverTimeInterested: leadsOverTimeInterested(filtered, dateField, granularity),
      leadsOverTimeByDestination: leadsOverTimeByDestination(filtered, dateField, granularity),
      leadsOverTimeBySource: leadsOverTimeBySource(filtered, dateField, granularity),
      leadsOverTimeBySourceInterested: leadsOverTimeBySourceInterested(
        filtered,
        dateField,
        granularity
      ),
      leadsOverTimeByCounselor: leadsOverTimeByCounselor(
        leads,
        granularity,
        startDate,
        endDate
      ),
      leadsOverTimePerformance: leadsOverTimePerformance(
        filtered,
        dateField,
        granularity,
        startDate,
        endDate
      ),
      overallPerformance: buildOverallPerformance(
        leadsOverTimePerformance(filtered, dateField, granularity, startDate, endDate)
      ),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

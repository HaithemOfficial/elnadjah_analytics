import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STATUS_COLORS = [
  "#6366F1",
  "#22C55E",
  "#F97316",
  "#E11D48",
  "#0EA5E9",
  "#A855F7",
];
const SOURCE_COLORS = [
  "#38BDF8",
  "#F59E0B",
  "#22C55E",
  "#A855F7",
  "#F97316",
  "#E11D48",
];
const configuredApiBase = String(import.meta.env.VITE_API_URL || "").trim();
const isLocalApiHost = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(
  configuredApiBase
);

const API_BASE = (() => {
  // In production, never use a localhost API URL because browsers resolve it to each visitor's machine.
  if (!import.meta.env.DEV && isLocalApiHost) return "";
  return configuredApiBase.replace(/\/$/, "");
})();

const normalizeApiPath = (path) => (path.startsWith("/") ? path : `/${path}`);
const stripApiPrefix = (path) => path.replace(/^\/api(?=\/)/, "");

const apiFetch = async (path, options) => {
  const normalizedPath = normalizeApiPath(path);
  const primaryResponse = await fetch(`${API_BASE}${normalizedPath}`, options);

  // Some production proxies strip "/api" before forwarding to backend.
  const canRetryWithoutApiPrefix =
    primaryResponse.status === 404 &&
    normalizedPath.startsWith("/api/") &&
    !/^https?:\/\//i.test(API_BASE);

  if (!canRetryWithoutApiPrefix) {
    return primaryResponse;
  }

  const fallbackPath = stripApiPrefix(normalizedPath);
  return fetch(`${API_BASE}${fallbackPath}`, options);
};
const AUTH_TOKEN_KEY = "leadAnalyzerAuthToken";
const AUTH_USER_KEY = "leadAnalyzerAuthUser";

const formatDate = (value, granularity = "month") => {
  if (!value) return "";
  const asDate = value.length === 7 ? new Date(`${value}-01`) : new Date(value);
  if (Number.isNaN(asDate.getTime())) return "";
  const options =
    granularity === "year"
      ? { year: "numeric" }
      : {
          year: "numeric",
          month: "short",
          ...(granularity === "day" ? { day: "2-digit" } : {}),
        };
  return asDate.toLocaleDateString(undefined, options);
};

const formatPct = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) return "0%";
  const truncated = Math.trunc(num);
  return `${truncated > 0 ? "+" : ""}${truncated}%`;
};

const formatNumber = (value) =>
  Number.isFinite(Number(value))
    ? Math.trunc(Number(value)).toLocaleString()
    : "0";

const calcPctChange = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return Math.trunc(((current - previous) / previous) * 100);
};

const toLocalDateString = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())
    .toLocaleDateString("en-CA");

// ISO date-only strings ("YYYY-MM-DD") are parsed as UTC by the Date constructor,
// which shifts the date by the local timezone offset (e.g. UTC+1 → off by 1 day).
// This parser treats the string as a local calendar date instead.
const parseLocalDate = (str) => {
  if (!str) return null;
  const parts = str.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const StatCard = ({ title, value, subtitle, helper, helperTone }) => (
  <div className="rounded-2xl bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-900/30 p-5 border border-slate-800 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.8)] transition hover:border-slate-700">
    <p className="text-[13px] uppercase tracking-wide text-slate-400">{title}</p>
    <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
    {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
    {helper && (
      <p
        className={`mt-2 text-xs font-medium ${
          helperTone === "positive"
            ? "text-emerald-400"
            : helperTone === "negative"
            ? "text-rose-400"
            : "text-slate-400"
        }`}
      >
        {helper}
      </p>
    )}
  </div>
);

const MiniStat = ({ title, value, subtitle, helper }) => (
  <div className="rounded-lg bg-slate-900/50 p-2 border border-slate-800 transition hover:border-slate-700 min-h-[60px] flex flex-col justify-center">
    <p className="text-[10px] uppercase tracking-wide text-slate-400 leading-tight">{title}</p>
    <p className="mt-1 text-base font-semibold text-slate-50 leading-tight">{value}</p>
    {subtitle && <p className="mt-0.5 text-[10px] text-slate-500 leading-tight">{subtitle}</p>}
    {helper && <p className="mt-0.5 text-[10px] text-slate-500 leading-tight">{helper}</p>}
  </div>
);

const ChartCard = ({ title, children }) => (
  <div className="rounded-2xl bg-slate-900/70 p-5 border border-slate-800 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.8)]">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-semibold text-slate-100">{title}</h3>
    </div>
    <div className="h-72">{children}</div>
  </div>
);

function areFiltersEqual(a, b) {
  return (
    a.counselor === b.counselor &&
    a.destination === b.destination &&
    a.monthKey === b.monthKey &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.allTime === b.allTime &&
    a.dateField === b.dateField &&
    a.filterMode === b.filterMode
  );
}

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

const safeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const dayKey = (date) => toLocalDateString(date);
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const startOfAlgeriaWeek = (date = new Date()) => {
  const day = date.getDay(); // 0 Sunday ... 6 Saturday
  const sinceSaturday = (day + 1) % 7;
  const start = startOfDay(date);
  start.setDate(start.getDate() - sinceSaturday);
  return start;
};

const endOfAlgeriaWeek = (date = new Date()) => {
  const start = startOfAlgeriaWeek(date);
  return endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
};

// Returns the last COMPLETED Algeria week (Sat→Fri).
// On Friday the current week ends today, so it is returned.
// On any other day the previous Saturday→Friday is returned.
const getLastCompletedAlgeriaWeek = (now = new Date()) => {
  const day = now.getDay(); // 0=Sun ... 5=Fri, 6=Sat
  const daysSinceFriday = (day - 5 + 7) % 7; // 0 on Fri, 1 on Sat, 2 on Sun …
  const lastFriday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceFriday);
  return {
    weekStart: startOfDay(new Date(lastFriday.getFullYear(), lastFriday.getMonth(), lastFriday.getDate() - 6)),
    weekEnd: endOfDay(lastFriday),
  };
};

const getLeadDate = (lead, dateField) => {
  if (dateField === "lastStateUpdate") return lead.lastStateUpdate || null;
  if (dateField === "timestamp") return lead.timestamp || null;
  return lead.timestamp || lead.lastStateUpdate || null;
};

const resolveDateField = (filters) => {
  const hasStart = Boolean(filters?.startDate) && !filters?.allTime;
  const hasEnd = Boolean(filters?.endDate) && !filters?.allTime;
  const field = filters?.dateField || "timestamp";

  // For selected periods, default to Edited timestamp to keep all
  // contacted-related metrics consistent across tabs.
  if ((hasStart || hasEnd) && (field === "timestamp" || !field)) {
    return "lastStateUpdate";
  }

  return field;
};

const getContactDate = (lead) => lead.lastStateUpdate || null;
const hasAssignedAgent = (lead) => Boolean(String(lead?.counselor || "").trim());
const hasContactedLead = (lead) => Boolean(getContactDate(lead));

const normalizeText = (value) => normalize(String(value || "")).replace(/\s+/g, " ").trim();

function evaluateDestinationEligibility(lead) {
  const destination = normalizeText(lead?.destination);
  const bac = normalizeText(lead?.bac);
  const budget = normalizeText(lead?.budget);
  const level = normalizeText(lead?.level);

  const isLithuania = destination.includes("ليتوانيا");
  if (isLithuania) {
    return { applicable: true, eligible: budget.includes("أكثر من 100 مليون") };
  }

  const isItaly = destination.includes("إيطاليا") || destination.includes("ايطاليا");
  if (isItaly) {
    const bacScore = parseFloat(bac);
    const hasValidBac = !isNaN(bacScore) && bacScore >= 10;
    const hasValidLevel = level.includes("b1") || level.includes("b2") || level.includes("c1") || level.includes("c2");
    return { applicable: true, eligible: hasValidBac && hasValidLevel };
  }

  return { applicable: false, eligible: null };
}

function inRange(date, startDate, endDate) {
  if (!date) return false;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

const diffDaysInclusive = (startDate, endDate) =>
  Math.max(1, Math.floor((endOfDay(endDate).getTime() - startOfDay(startDate).getTime()) / 86400000) + 1);

function groupCount(leads, key, emptyLabel = "Unknown") {
  const counts = {};
  leads.forEach((lead) => {
    const value = lead[key] || emptyLabel;
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
  const map = new Map();
  leads.forEach((lead) => {
    const name = lead[key] || emptyLabel;
    if (!map.has(name)) {
      map.set(name, {
        name,
        total: 0,
        interested: 0,
        followUp: 0,
        noReply: 0,
        needsMoreInfo: 0,
      });
    }
    const row = map.get(name);
    const category = normalizeStatusCategory(lead.status);
    row.total += 1;
    if (category === "Interested / Will apply") row.interested += 1;
    if (category === "Follow-Up / No Reply") {
      row.followUp += 1;
      row.noReply += 1;
    }
    if (category === "Needs More Info / Thinking") row.needsMoreInfo += 1;
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function seriesByDate(leads, dateField, granularity, selector) {
  const counts = {};
  leads.forEach((lead) => {
    if (selector && !selector(lead)) return;
    const date = getLeadDate(lead, dateField);
    if (!date) return;
    const key = granularity === "month" ? monthKey(date) : dayKey(date);
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.keys(counts)
    .sort()
    .map((date) => ({ date, count: counts[date] }));
}

function leadsOverTimeByDimension(leads, dateField, granularity, keyName) {
  const buckets = {};
  leads.forEach((lead) => {
    const date = getLeadDate(lead, dateField);
    if (!date) return;
    const key = granularity === "month" ? monthKey(date) : dayKey(date);
    const dim = lead[keyName] || "Unknown";
    if (!buckets[key]) buckets[key] = { date: key };
    buckets[key][dim] = (buckets[key][dim] || 0) + 1;
  });
  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
}

function contactedOverTimeByCounselor(leads, granularity, startDate, endDate) {
  const buckets = {};
  leads.forEach((lead) => {
    if (!hasAssignedAgent(lead)) return;
    const contactDate = getContactDate(lead);
    if (!contactDate || !inRange(contactDate, startDate, endDate)) return;
    const key = granularity === "month" ? monthKey(contactDate) : dayKey(contactDate);
    const counselor = lead.counselor;
    if (!buckets[key]) buckets[key] = { date: key };
    buckets[key][counselor] = (buckets[key][counselor] || 0) + 1;
  });
  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
}

function leadsOverTimePerformance(leads, dateField, granularity, startDate, endDate) {
  const totals = {};
  const contacted = {};
  leads.forEach((lead) => {
    const leadDate = getLeadDate(lead, dateField);
    if (leadDate && inRange(leadDate, startDate, endDate)) {
      const key = granularity === "month" ? monthKey(leadDate) : dayKey(leadDate);
      totals[key] = (totals[key] || 0) + 1;
      const contactDate = getContactDate(lead);
      if (contactDate && inRange(contactDate, startDate, endDate)) {
        const contactKey = granularity === "month" ? monthKey(contactDate) : dayKey(contactDate);
        contacted[contactKey] = (contacted[contactKey] || 0) + 1;
      }
    }
  });
  const allDates = new Set([...Object.keys(totals), ...Object.keys(contacted)]);
  return Array.from(allDates)
    .sort()
    .map((date) => ({ date, total: totals[date] || 0, contacted: contacted[date] || 0 }));
}

function buildOverallPerformance(series) {
  if (!series || series.length < 2) return [];
  return series
    .map((point, index) => {
      if (index === 0) return null;
      const prev = series[index - 1];
      const demandGrowth = prev.total ? Math.trunc(((point.total - prev.total) / prev.total) * 100) : point.total ? 100 : 0;
      const contactedGrowth = prev.contacted
        ? Math.trunc(((point.contacted - prev.contacted) / prev.contacted) * 100)
        : point.contacted
        ? 100
        : 0;
      return { date: point.date, performance: Math.trunc((demandGrowth + contactedGrowth) / 2) };
    })
    .filter(Boolean);
}

function formatResponseTime(days) {
  if (!Number.isFinite(days) || days <= 0) return "-";
  if (days >= 1) return `${days.toFixed(1)} d`;
  const hours = days * 24;
  if (hours >= 1) return `${Math.round(hours)} h`;
  return `${Math.round(hours * 60)} min`;
}

function pctChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.trunc(((current - previous) / previous) * 100);
}

function countStatusInRange(leads, startDate, endDate, dateField) {
  const filtered = leads.filter((lead) => inRange(getLeadDate(lead, dateField), startDate, endDate));
  const counts = {
    total: filtered.length,
    contacted: 0,
    interested: 0,
    followUp: 0,
    needsMoreInfo: 0,
    notInterested: 0,
    notObvious: 0,
    notContacted: 0,
  };
  filtered.forEach((lead) => {
    const contactedInPeriod = inRange(getContactDate(lead), startDate, endDate);
    const category = normalizeStatusCategory(lead.status);
    if (contactedInPeriod) {
      counts.contacted += 1;
    } else {
      counts.notContacted += 1;
    }
    if (category === "Interested / Will apply") counts.interested += 1;
    if (category === "Follow-Up / No Reply") counts.followUp += 1;
    if (category === "Needs More Info / Thinking") counts.needsMoreInfo += 1;
    if (category === "Not Interested / Disqualified") counts.notInterested += 1;
    if (category === "Not obvious / You Don't Know") counts.notObvious += 1;
  });
  return counts;
}

function calcPeriodComparison(leads, startDate, endDate, dateField) {
  if (!startDate || !endDate) return null;
  const lengthDays = diffDaysInclusive(startDate, endDate);
  const previousEnd = endOfDay(new Date(startOfDay(startDate).getTime() - 86400000));
  const previousStart = startOfDay(new Date(startOfDay(previousEnd).getTime() - (lengthDays - 1) * 86400000));
  const current = countStatusInRange(leads, startDate, endDate, dateField);
  const previous = countStatusInRange(leads, previousStart, previousEnd, dateField);
  return {
    label: `${toLocalDateString(previousStart)} -> ${toLocalDateString(previousEnd)}`,
    totals: { current: current.total, previous: previous.total, pctChange: pctChange(current.total, previous.total) },
    interested: {
      current: current.interested,
      previous: previous.interested,
      pctChange: pctChange(current.interested, previous.interested),
    },
    followUp: { current: current.followUp, previous: previous.followUp, pctChange: pctChange(current.followUp, previous.followUp) },
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
    notObvious: { current: current.notObvious, previous: previous.notObvious, pctChange: pctChange(current.notObvious, previous.notObvious) },
    notContacted: {
      current: current.notContacted,
      previous: previous.notContacted,
      pctChange: pctChange(current.notContacted, previous.notContacted),
    },
  };
}

function topCountryByGrowth(leads, startDate, endDate, dateField) {
  if (!startDate || !endDate) return null;
  const lengthDays = diffDaysInclusive(startDate, endDate);
  const previousEnd = endOfDay(new Date(startOfDay(startDate).getTime() - 86400000));
  const previousStart = startOfDay(new Date(startOfDay(previousEnd).getTime() - (lengthDays - 1) * 86400000));

  const countByDestination = (from, to) => {
    const counts = {};
    leads.forEach((lead) => {
      const leadDate = getLeadDate(lead, dateField);
      if (!inRange(leadDate, from, to)) return;
      const destination = lead.destination || "Unknown";
      counts[destination] = (counts[destination] || 0) + 1;
    });
    return counts;
  };

  const current = countByDestination(startDate, endDate);
  const previous = countByDestination(previousStart, previousEnd);

  const ranked = Object.keys(current)
    .map((name) => {
      const curr = current[name] || 0;
      const prev = previous[name] || 0;
      const delta = curr - prev;
      const pct = prev ? ((delta) / prev) * 100 : curr ? 100 : 0;
      return {
        name,
        current: curr,
        previous: prev,
        delta,
        pctChange: Math.trunc(pct),
      };
    })
    .filter((item) => item.delta > 0)
    .sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      if (b.pctChange !== a.pctChange) return b.pctChange - a.pctChange;
      return b.current - a.current;
    });

  return ranked[0] || null;
}

function buildAgentLeaderboard(leads, startDate, endDate, dateField) {
  const lengthDays = startDate && endDate ? diffDaysInclusive(startDate, endDate) : null;
  const previousEnd = startDate ? endOfDay(new Date(startOfDay(startDate).getTime() - 86400000)) : null;
  const previousStart = previousEnd && lengthDays
    ? startOfDay(new Date(startOfDay(previousEnd).getTime() - (lengthDays - 1) * 86400000))
    : null;

  const initRow = () => ({
    contactedInPeriod: 0,  // leads worked on in period (by lastStateUpdate)
    interested: 0,
    responseCount: 0,
    responseDaysSum: 0,
    followUpCount: 0,
    followUpDaysSum: 0,
    destinationCounts: {},
  });

  const current = new Map();
  const previous = new Map();

  leads.forEach((lead) => {
    if (!hasAssignedAgent(lead)) return;
    const contactDate = getContactDate(lead);
    if (!inRange(contactDate, startDate, endDate)) return;

    if (!current.has(lead.counselor)) current.set(lead.counselor, initRow());
    const row = current.get(lead.counselor);

    row.contactedInPeriod += 1;
    if (normalizeStatusCategory(lead.status) === "Interested / Will apply") row.interested += 1;
    const destination = lead.destination || "Unknown";
    row.destinationCounts[destination] = (row.destinationCounts[destination] || 0) + 1;
    if (lead.timestamp && contactDate) {
      const days = diffDaysInclusive(startOfDay(lead.timestamp), startOfDay(contactDate)) - 1;
      if (days >= 0) {
        row.responseCount += 1;
        row.responseDaysSum += days;
        row.followUpCount += 1;
        row.followUpDaysSum += days;
      }
    }
  });

  if (previousStart && previousEnd) {
    leads.forEach((lead) => {
      if (!hasAssignedAgent(lead)) return;
      const contactDate = getContactDate(lead);
      if (!inRange(contactDate, previousStart, previousEnd)) return;

      if (!previous.has(lead.counselor)) previous.set(lead.counselor, initRow());
      const row = previous.get(lead.counselor);

      row.contactedInPeriod += 1;
      if (normalizeStatusCategory(lead.status) === "Interested / Will apply") row.interested += 1;
      if (lead.timestamp && contactDate) {
        const days = diffDaysInclusive(startOfDay(lead.timestamp), startOfDay(contactDate)) - 1;
        if (days >= 0) {
          row.responseCount += 1;
          row.responseDaysSum += days;
        }
      }
    });
  }

  return Array.from(current.entries())
    .map(([name, row]) => {
      const prev = previous.get(name);
      const avgResponseDays = row.responseCount ? Math.trunc(row.responseDaysSum / row.responseCount) : null;
      const prevAvg = prev && prev.responseCount ? prev.responseDaysSum / prev.responseCount : null;
      const responseChangePct = prevAvg !== null && avgResponseDays !== null
        ? Number((((avgResponseDays - prevAvg) / prevAvg) * 100).toFixed(1))
        : null;
      const topCountry = Object.entries(row.destinationCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
      return {
        name,
        // Keep `contacted` aligned with worked-on leads in period (Edited timestamp)
        // so table columns and cards show the same contacted metric.
        contacted: row.contactedInPeriod,
        contactedInPeriod: row.contactedInPeriod, // leads worked on in period
        interested: row.interested,
        interestedRate: row.contactedInPeriod
          ? Math.trunc((row.interested / row.contactedInPeriod) * 100)
          : 0,
        topCountry,
        followUpSpeedDays: row.followUpCount ? Math.trunc(row.followUpDaysSum / row.followUpCount) : null,
        avgContactedPerDay: lengthDays ? Number((row.contactedInPeriod / lengthDays).toFixed(2)) : null,
        avgResponseDays,
        responseChangePct,
        contactedChangePct: prev ? pctChange(row.contactedInPeriod, prev.contactedInPeriod) : null,
        interestedChangePct: prev ? pctChange(row.interested, prev.interested) : null,
        contactedInPeriodChangePct: prev ? pctChange(row.contactedInPeriod, prev.contactedInPeriod) : null,
      };
    })
    .sort((a, b) => b.contactedInPeriod - a.contactedInPeriod || b.contacted - a.contacted);
}

function uniqueAgents(leads) {
  const set = new Set();
  leads.forEach((lead) => {
    if (lead.counselor) set.add(lead.counselor);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function buildStatsFromLeads(leads, filters) {
  const dateField = resolveDateField(filters);

  const startDate = filters.allTime || !filters.startDate ? null : startOfDay(parseLocalDate(filters.startDate));
  const endDate = filters.allTime || !filters.endDate ? null : endOfDay(parseLocalDate(filters.endDate));

  const scopedLeads = leads.filter((lead) => {
    if (filters.counselor && lead.counselor !== filters.counselor) return false;
    if (filters.destination && lead.destination !== filters.destination) return false;
    return true;
  });

  const filtered = scopedLeads.filter((lead) => {
    return inRange(getLeadDate(lead, dateField), startDate, endDate);
  });

  const validDates = filtered
    .map((lead) => getLeadDate(lead, dateField))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const latestDate = validDates[validDates.length - 1] || new Date();
  const earliestDate = validDates[0] || new Date();
  const effectiveStart = startDate || earliestDate;
  const effectiveEnd = endDate || latestDate;
  const rangeDays = diffDaysInclusive(effectiveStart, effectiveEnd);
  const granularity = rangeDays <= 60 ? "day" : "month";

  const totals = countStatusInRange(filtered, null, null, dateField);
  const byStatus = groupStatusCategories(filtered);
  const byStage = groupCount(filtered, "status", "No stage");
  const byCounselor = groupCount(filtered, "counselor", "Not assigned yet");
  const byDestination = groupCount(filtered, "destination");
  const bySource = groupCount(filtered, "source");
  const byFinanceState = groupCount(filtered, "bac");
  const byEligibility = groupCount(filtered, "eligibility", "Unknown");

  const eligibleCount = filtered.filter((lead) => {
    const value = normalize(lead.eligibility);
    return value.includes("eligible") && !value.includes("not");
  }).length;
  const notEligibleCount = filtered.filter((lead) => {
    const value = normalize(lead.eligibility);
    return value.includes("not eligible");
  }).length;

  const contactedCount = totals.contacted;
  const responseRate = filtered.length ? Math.trunc((contactedCount / filtered.length) * 100) : 0;

  let speedTotal = 0;
  let speedCount = 0;
  filtered.forEach((lead) => {
    const contactDate = getContactDate(lead);
    if (!lead.timestamp || !contactDate) return;
    if (!inRange(contactDate, startDate, endDate)) return;
    const days = diffDaysInclusive(startOfDay(lead.timestamp), startOfDay(contactDate)) - 1;
    if (days >= 0) {
      speedTotal += days;
      speedCount += 1;
    }
  });

  const leadsSeries = seriesByDate(filtered, dateField, granularity);
  const leadsOverTimeInterested = seriesByDate(
    filtered,
    dateField,
    granularity,
    (lead) => normalizeStatusCategory(lead.status) === "Interested / Will apply"
  );
  const leadsOverTimeFollowUp = seriesByDate(
    filtered,
    dateField,
    granularity,
    (lead) => normalizeStatusCategory(lead.status) === "Follow-Up / No Reply"
  );
  const leadsOverTimePerformanceSeries = leadsOverTimePerformance(
    filtered,
    dateField,
    granularity,
    effectiveStart,
    effectiveEnd
  );

  return {
    latestDate: toLocalDateString(latestDate),
    range: {
      startDate: toLocalDateString(effectiveStart),
      endDate: toLocalDateString(effectiveEnd),
    },
    avgPerDay: Number((filtered.length / rangeDays).toFixed(2)),
    totals: {
      ...totals,
      eligible: eligibleCount,
      notEligible: notEligibleCount,
    },
    responseRate,
    responseSpeedDays: speedCount ? Math.trunc(speedTotal / speedCount) : 0,
    comparison: calcPeriodComparison(leads, startDate, endDate, dateField),
    topCountryGrowth: topCountryByGrowth(leads, startDate, endDate, dateField),
    byStatus,
    byStage,
    byCounselor,
    byDestination,
    bySource,
    byFinanceState,
    byEligibility,
    byCounselorDetails: buildDetails(filtered, "counselor", "Not assigned yet"),
    byDestinationDetails: buildDetails(filtered, "destination", "Unknown"),
    agentLeaderboard: buildAgentLeaderboard(scopedLeads, startDate, endDate, dateField),
    allAgents: uniqueAgents(scopedLeads),
    timeGranularity: granularity,
    leadsOverTime: leadsSeries,
    leadsOverTimeInterested,
    leadsOverTimeFollowUp,
    leadsOverTimeByDestination: leadsOverTimeByDimension(filtered, dateField, granularity, "destination"),
    leadsOverTimeBySource: leadsOverTimeByDimension(filtered, dateField, granularity, "source"),
    leadsOverTimeBySourceInterested: leadsOverTimeByDimension(
      filtered.filter((lead) => normalizeStatusCategory(lead.status) === "Interested / Will apply"),
      dateField,
      granularity,
      "source"
    ),
    leadsOverTimeByCounselor: contactedOverTimeByCounselor(
      scopedLeads,
      granularity,
      startDate,
      endDate
    ),
    leadsOverTimePerformance: leadsOverTimePerformanceSeries,
    overallPerformance: buildOverallPerformance(leadsOverTimePerformanceSeries),
  };
}

export default function App() {
  const [stats, setStats] = useState(null);
  const [allLeads, setAllLeads] = useState([]);
  const [serverStats, setServerStats] = useState(null);
  const [serverStatsLoading, setServerStatsLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [authToken, setAuthToken] = useState(() => {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY) || "";
    } catch (error) {
      return "";
    }
  });
  const [authUser, setAuthUser] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  });
  const [loginEmail, setLoginEmail] = useState("admin@elnadjah.com");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [alertsCollapsed, setAlertsCollapsed] = useState(true);

  const storedFilters = (() => {
    try {
      const raw = localStorage.getItem("leadFilters");
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  })();

  const storedQuickRange = (() => {
    try {
      return localStorage.getItem("leadQuickRange") || "week";
    } catch (error) {
      return "week";
    }
  })();

  const buildDefaultFilters = () => {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const end = new Date();
    return {
      counselor: "",
      destination: "",
      monthKey: "",
      startDate: toLocalDateString(start),
      endDate: toLocalDateString(end),
      allTime: false,
      dateField: "timestamp",
      filterMode: "preset",
    };
  };

  const initialFilters = storedFilters || buildDefaultFilters();

  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [quickRange, setQuickRange] = useState(storedQuickRange);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const activePage = "overview";
  const [activeOverviewGroup, setActiveOverviewGroup] = useState("general");
  const [alertsPanelCollapsed, setAlertsPanelCollapsed] = useState(true);

  const logout = async () => {
    try {
      if (authToken) {
        await apiFetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}` },
        });
      }
    } catch (error) {
      // ignore network errors while logging out
    }

    setAuthToken("");
    setAuthUser(null);
    setAllLeads([]);
    setServerStats(null);
    setStats(null);
    setLoginPassword("");
    setLoginError("");
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    } catch (error) {
      // ignore storage errors
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Login failed");
      }

      setAuthToken(payload.token || "");
      setAuthUser(payload.user || null);
      setLoginPassword("");
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setLoginError(err.message || "Login failed");
    } finally {
      setLoginLoading(false);
    }
  };

  useEffect(() => {
    try {
      if (authToken) {
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
      } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch (error) {
      // ignore storage errors
    }
  }, [authToken]);

  useEffect(() => {
    try {
      if (authUser) {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authUser));
      } else {
        localStorage.removeItem(AUTH_USER_KEY);
      }
    } catch (error) {
      // ignore storage errors
    }
  }, [authUser]);

  useEffect(() => {
    if (!authToken) {
      setLoading(false);
      setAllLeads([]);
      setServerStats(null);
      return;
    }

    const fetchLeads = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await apiFetch("/api/leads", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!response.ok) {
          if (response.status === 401) {
            await logout();
            throw new Error("Session expired. Please login again.");
          }
          throw new Error("Failed to load leads");
        }
        const data = await response.json();
        const leads = (data?.leads || []).map((lead) => ({
          ...lead,
          timestamp: safeDate(lead.timestamp),
          lastStateUpdate: safeDate(lead.lastStateUpdate),
          firstContact: safeDate(lead.firstContact),
        }));
        setAllLeads(leads);
      } catch (err) {
        setError(err.message || "Failed to load leads");
      } finally {
        setLoading(false);
      }
    };

    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, authToken]);

  useEffect(() => {
    if (!authToken) {
      setServerStats(null);
      setServerStatsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchStats = async () => {
      setServerStatsLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.allTime) {
          params.set("all", "true");
        } else {
          if (filters.startDate) params.set("startDate", filters.startDate);
          if (filters.endDate) params.set("endDate", filters.endDate);
        }
        if (filters.counselor) params.set("counselor", filters.counselor);
        if (filters.destination) params.set("destination", filters.destination);

        // Keep backend default behavior for timestamp-vs-edited resolution.
        if (filters.dateField && filters.dateField !== "timestamp") {
          params.set("dateField", filters.dateField);
        }

        const query = params.toString();
        const path = query ? `/api/stats?${query}` : "/api/stats";
        const resp = await apiFetch(path, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!resp.ok) throw new Error("Failed to load server stats");
        const payload = await resp.json();
        if (!cancelled) setServerStats(payload);
      } catch (err) {
        if (!cancelled) {
          // Fallback to client computation when stats endpoint is unavailable.
          setServerStats(null);
        }
      } finally {
        if (!cancelled) setServerStatsLoading(false);
      }
    };

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, [authToken, refreshKey, filters]);

  useEffect(() => {
    // Prefer server-provided stats when available to ensure canonical numbers.
    if (serverStats) {
      setStats(serverStats);
      return;
    }

    // Avoid rendering temporary local numbers while server stats are loading,
    // which can cause a brief flash of incorrect values on refresh.
    if (serverStatsLoading) return;

    setStats(buildStatsFromLeads(allLeads, filters));
  }, [allLeads, filters, serverStats, serverStatsLoading]);

  useEffect(() => {
    try {
      localStorage.setItem("leadFilters", JSON.stringify(filters));
    } catch (error) {
      // ignore storage errors
    }
  }, [filters]);

  useEffect(() => {
    try {
      localStorage.setItem("leadQuickRange", quickRange);
    } catch (error) {
      // ignore storage errors
    }
  }, [quickRange]);

  useEffect(() => {
    if (!stats?.range) return;
    if (filters.allTime) return;
    if (filters.startDate || filters.endDate) return;

    setFilters((prev) => ({
      ...prev,
      startDate: stats.range.startDate,
      endDate: stats.range.endDate,
    }));
    setDraftFilters((prev) => ({
      ...prev,
      startDate: stats.range.startDate,
      endDate: stats.range.endDate,
    }));
  }, [stats, filters.startDate, filters.endDate, filters.allTime]);

  const applyPreset = (preset, commit = false) => {
    const reference = new Date();

    const end = new Date(reference);
    const start = new Date(reference);

    if (preset === "today") {
      start.setDate(end.getDate());
    } else if (preset === "day") {
      start.setDate(end.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (preset === "week") {
      start.setDate(end.getDate() - 7);
    } else if (preset === "month") {
      start.setMonth(end.getMonth() - 1);
    } else if (preset === "year") {
      start.setFullYear(end.getFullYear() - 1);
    }

    const updateFromPreset = (prev) => ({
      ...prev,
      startDate: toLocalDateString(start),
      endDate: toLocalDateString(end),
      monthKey: "",
      allTime: false,
      filterMode: "preset",
    });

    setDraftFilters(updateFromPreset);
    if (commit) {
      setFilters(updateFromPreset);
    }
    setQuickRange(preset);
  };

  const applyAllTime = (commit = false) => {
    const updateToAllTime = (prev) => ({
      ...prev,
      startDate: "",
      endDate: "",
      monthKey: "",
      allTime: true,
      filterMode: "allTime",
    });

    setDraftFilters(updateToAllTime);
    if (commit) {
      setFilters(updateToAllTime);
    }
    setQuickRange("all");
  };

  const resetFilters = () => {
    const next = buildDefaultFilters();
    setDraftFilters(next);
    setFilters(next);
    setQuickRange("week");
    setShowMobileFilters(false);
  };

  useEffect(() => {
    if (!storedFilters) return;
    if (storedFilters.filterMode === "preset" && storedQuickRange && storedQuickRange !== "all") {
      applyPreset(storedQuickRange, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (areFiltersEqual(filters, draftFilters)) return;
    setFilters(draftFilters);
  }, [draftFilters, filters]);

  const counselorOptions = useMemo(() => {
    if (!stats?.byCounselor) return [];
    return stats.byCounselor.map((item) => item.name).filter(Boolean);
  }, [stats]);

  const destinationOptions = useMemo(() => {
    if (!stats?.byDestination) return [];
    return stats.byDestination.map((item) => item.name).filter(Boolean);
  }, [stats]);

  const monthOptions = useMemo(() => {
    const options = [];
    const current = new Date();
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(current.getFullYear(), current.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      options.push({ key, label, year: date.getFullYear(), monthIndex: date.getMonth() });
    }
    return options;
  }, []);

  const activeFilterChips = [
    filters.allTime
      ? { key: "date", label: "Date: All time" }
      : filters.startDate || filters.endDate
      ? { key: "date", label: `Date: ${filters.startDate || "-"} to ${filters.endDate || "-"}` }
      : null,
    filters.counselor ? { key: "counselor", label: `Agent: ${filters.counselor}` } : null,
    filters.destination ? { key: "destination", label: `Destination: ${filters.destination}` } : null,
  ].filter(Boolean);

  const clearFilterChip = (key) => {
    if (key === "date") {
      setDraftFilters((prev) => ({
        ...prev,
        startDate: "",
        endDate: "",
        monthKey: "",
        allTime: false,
        filterMode: "custom",
      }));
      setFilters((prev) => ({
        ...prev,
        startDate: "",
        endDate: "",
        monthKey: "",
        allTime: false,
        filterMode: "custom",
      }));
      setQuickRange("custom");
      return;
    }

    if (key === "counselor") {
      setDraftFilters((prev) => ({ ...prev, counselor: "" }));
      setFilters((prev) => ({ ...prev, counselor: "" }));
      return;
    }

    if (key === "destination") {
      setDraftFilters((prev) => ({ ...prev, destination: "" }));
      setFilters((prev) => ({ ...prev, destination: "" }));
    }
  };

  const totalComparisonHelper = stats?.comparison?.totals
    ? `${formatPct(stats.comparison.totals.pctChange)} vs previous period (${formatNumber(
        stats.comparison.totals.previous
      )})`
    : "";
  const interestedComparisonHelper = stats?.comparison?.interested
    ? `${formatPct(stats.comparison.interested.pctChange)} vs previous period (${formatNumber(
        stats.comparison.interested.previous
      )})`
    : "";

  const agentDetails = stats?.byCounselorDetails ?? [];
  const countryDetails = stats?.byDestinationDetails ?? [];
  const agentLeaderboard = stats?.agentLeaderboard ?? [];
  const allAgents = stats?.allAgents ?? [];
  const leaderboardRows = useMemo(() => {
    const rows = agentLeaderboard
      .filter((row) => row.name !== "Not assigned yet")
      .sort((a, b) => b.contactedInPeriod - a.contactedInPeriod || b.contacted - a.contacted);

    return rows.map((row, index) => ({
      ...row,
      rank: index + 1,
      badge: index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "",
    }));
  }, [agentLeaderboard]);
  const activeAgentNames = leaderboardRows.map((row) => row.name).filter(Boolean);
  const inactiveAgents = allAgents.filter(
    (name) => name && !activeAgentNames.includes(name)
  );

  const allLeaderboardRows = [
    ...leaderboardRows,
    ...inactiveAgents.map((name, i) => ({
      name,
      rank: leaderboardRows.length + i + 1,
      badge: "",
      contactedInPeriod: 0,
      contacted: 0,
      interested: 0,
      interestedRate: 0,
      avgContactedPerDay: null,
      avgResponseDays: null,
      topCountry: "-",
    })),
  ];

  const totalLeads = stats?.totals?.total ?? 0;
  const pct = (value) =>
    totalLeads ? `${((value / totalLeads) * 100).toFixed(1)}%` : "0%";
  const rateOf = (value) => (totalLeads ? ((value / totalLeads) * 100).toFixed(1) : "0.0");

  const topByValue = (items) =>
    [...(items || [])].sort((a, b) => b.value - a.value)[0];

  const topByValueExcluding = (items, excludeName) =>
    [...(items || [])]
      .filter((item) => item.name !== excludeName)
      .sort((a, b) => b.value - a.value)[0];

  const topSource = topByValue(stats?.bySource);
  const topCountryGrowth = stats?.topCountryGrowth;
  const topAgent = leaderboardRows[0] || null;
  const topDestinationDelta = topCountryGrowth
    ? (Number(topCountryGrowth.current) || 0) - (Number(topCountryGrowth.previous) || 0)
    : 0;
  const eligibleFromBuckets = (stats?.byEligibility || []).reduce((sum, item) => {
    const label = normalize(item?.name);
    if ((label.includes("✅") || label.includes("eligible")) && !label.includes("not eligible")) {
      return sum + (Number(item?.value) || 0);
    }
    return sum;
  }, 0);
  const eligibleCount = Number(stats?.totals?.eligible ?? eligibleFromBuckets);
  const notEligibleCount = Number(stats?.totals?.notEligible ?? 0);
  const eligibilityRate = totalLeads ? ((eligibleCount / totalLeads) * 100).toFixed(1) : "0.0";

  const potentialSeries = useMemo(() => {
    const leadsSeries = stats?.leadsOverTime ?? [];
    const interestedSeries = stats?.leadsOverTimeInterested ?? [];
    if (!leadsSeries.length) return [];
    const interestedMap = new Map(interestedSeries.map((row) => [row.date, row.count]));
    return leadsSeries.map((row) => {
      const interestedCount = interestedMap.get(row.date) || 0;
      return {
        date: row.date,
        leads: row.count || 0,
        interested: interestedCount,
        potential: (row.count || 0) + interestedCount,
      };
    });
  }, [stats]);
  const notContactedCount = stats?.totals?.notContacted ?? 0;
  const assignedCount = Math.max(totalLeads - notContactedCount, 0);
  const topAgentShare = topAgent?.contacted
    ? `${rateOf(topAgent.contacted)}%`
    : "0.0%";
  const responseRateHelper = stats?.responseRate
    ? `${stats.responseRate}% of leads contacted`
    : "0% of leads contacted";
  const notAssignedCount = stats?.byCounselor?.find(
    (item) => item.name === "Not assigned yet"
  )?.value || 0;

  const helperFor = (key) =>
    stats?.comparison?.[key]
      ? `${formatPct(stats.comparison[key].pctChange)} vs previous period (${formatNumber(
          stats.comparison[key].previous
        )})`
      : "";

  const rangeDays = stats?.range?.startDate && stats?.range?.endDate
    ? Math.max(
        1,
        Math.floor(
          (endOfDay(parseLocalDate(stats.range.endDate)).getTime() -
            startOfDay(parseLocalDate(stats.range.startDate)).getTime()) /
            86400000
        ) + 1
      )
    : 0;

  const previousPeriodTeamMetrics = useMemo(() => {
    if (!stats?.range?.startDate || !stats?.range?.endDate) {
      return { contacted: 0, interested: 0, avgPerDay: 0 };
    }

    const currentStart = startOfDay(parseLocalDate(stats.range.startDate));
    const currentEnd = endOfDay(parseLocalDate(stats.range.endDate));
    const days = diffDaysInclusive(currentStart, currentEnd);
    const previousEnd = endOfDay(new Date(currentStart.getTime() - 86400000));
    const previousStart = startOfDay(
      new Date(startOfDay(previousEnd).getTime() - (days - 1) * 86400000)
    );

    let contacted = 0;
    let interested = 0;

    allLeads.forEach((lead) => {
      if (filters.counselor && lead.counselor !== filters.counselor) return;
      if (filters.destination && lead.destination !== filters.destination) return;
      if (!hasAssignedAgent(lead)) return;

      const contactDate = getContactDate(lead);
      if (!inRange(contactDate, previousStart, previousEnd)) return;

      contacted += 1;
      if (normalizeStatusCategory(lead.status) === "Interested / Will apply") {
        interested += 1;
      }
    });

    return {
      contacted,
      interested,
      avgPerDay: days ? Number((contacted / days).toFixed(1)) : 0,
    };
  }, [allLeads, filters.counselor, filters.destination, stats?.range?.startDate, stats?.range?.endDate]);

  const prevAvgPerDay = rangeDays
    ? Number((stats?.comparison?.totals?.previous / rangeDays).toFixed(2))
    : 0;
  const avgPctChange = calcPctChange(stats?.avgPerDay ?? 0, prevAvgPerDay);
  const avgComparisonHelper = rangeDays
    ? `${formatPct(avgPctChange)} vs previous period (${prevAvgPerDay})`
    : "";
  const teamActiveAgents = leaderboardRows.length;
  const totalTeamContacted = leaderboardRows.reduce(
    (sum, row) => sum + (row.contactedInPeriod || 0),
    0
  );
  const totalTeamInterested = leaderboardRows.reduce(
    (sum, row) => sum + (row.interested || 0),
    0
  );
  const teamInterestedRate = totalTeamContacted
    ? ((totalTeamInterested / totalTeamContacted) * 100).toFixed(1)
    : "0.0";
  const teamAvgContactedPerDay = rangeDays
    ? (totalTeamContacted / rangeDays).toFixed(1)
    : "0.0";
  const prevTeamAvgContactedPerDay = previousPeriodTeamMetrics.avgPerDay;
  const teamAvgContactedPerDayChange = calcPctChange(
    Number(teamAvgContactedPerDay),
    prevTeamAvgContactedPerDay
  );
  const teamAvgContactedComparisonHelper = rangeDays
    ? `${formatPct(teamAvgContactedPerDayChange)} vs previous period (${prevTeamAvgContactedPerDay}/day)`
    : "";
  const teamAvgContactedComparisonTone =
    teamAvgContactedPerDayChange > 0
      ? "positive"
      : teamAvgContactedPerDayChange < 0
      ? "negative"
      : null;
  const avgTeamResponseDaysRaw = leaderboardRows
    .filter((row) => row.avgResponseDays !== null && row.avgResponseDays !== undefined)
    .reduce((sum, row, _, arr) => sum + row.avgResponseDays / arr.length, 0);
  const avgTeamResponseDays = Number.isFinite(avgTeamResponseDaysRaw)
    ? avgTeamResponseDaysRaw.toFixed(1)
    : "0.0";
  const avgTeamResponseDisplay = formatResponseTime(avgTeamResponseDaysRaw);
  const teamCapacityUtilization = totalLeads
    ? ((assignedCount / totalLeads) * 100).toFixed(1)
    : "0.0";
  const teamPerformanceData = leaderboardRows.slice(0, 8).map((row) => ({
    name: row.name,
    contacted: row.contactedInPeriod,
    interested: row.interested,
  }));
  const teamInterestedRateData = leaderboardRows.slice(0, 8).map((row) => ({
    name: row.name,
    interestedRate: row.interestedRate || 0,
  }));
  const teamAvgContactedPerDayData = leaderboardRows
    .slice(0, 8)
    .map((row) => ({
      name: row.name,
      avgContactedPerDay: Number(row.avgContactedPerDay) || 0,
    }));
  const teamCoverageData = [
    { name: "Contacted", value: assignedCount },
    { name: "Not contacted", value: notContactedCount },
  ];
  const destinationVolumeRows = [...(stats?.byDestination ?? [])]
    .sort((a, b) => b.value - a.value);
  const topDestinationRows = destinationVolumeRows.slice(0, 8);
  const topDestinationLeadCount = topDestinationRows[0]?.value ?? 0;
  const topDestinationName = topDestinationRows[0]?.name || "-";
  const activeDestinationCount = destinationVolumeRows.length;
  const top3DestinationShare = totalLeads
    ? ((
        topDestinationRows.slice(0, 3).reduce((sum, row) => sum + row.value, 0) /
        totalLeads
      ) * 100).toFixed(1)
    : "0.0";
  const topDestinationShare = totalLeads
    ? ((topDestinationLeadCount / totalLeads) * 100).toFixed(1)
    : "0.0";
  const avgLeadsPerDestination = activeDestinationCount
    ? (totalLeads / activeDestinationCount).toFixed(1)
    : "0.0";
  const destinationCoverageCount = destinationVolumeRows.filter(
    (row) => row.value >= 10
  ).length;
  const destinationCoverageRate = activeDestinationCount
    ? ((destinationCoverageCount / activeDestinationCount) * 100).toFixed(1)
    : "0.0";
  const topDestinationTrendKeys = topDestinationRows.slice(0, 4).map((row) => row.name);
  const destinationLeaderboardRows = useMemo(() => {
    const startDate =
      filters.allTime || !filters.startDate
        ? null
        : startOfDay(parseLocalDate(filters.startDate));
    const endDate =
      filters.allTime || !filters.endDate
        ? null
        : endOfDay(parseLocalDate(filters.endDate));

    const rows = allLeads
      .filter((lead) => {
        if (filters.counselor && lead.counselor !== filters.counselor) return false;
        if (filters.destination && lead.destination !== filters.destination) return false;
        return inRange(lead.timestamp, startDate, endDate);
      })
      .reduce((acc, lead) => {
        const destinationName = lead.destination || "Unknown";
        if (!acc[destinationName]) {
          acc[destinationName] = {
            name: destinationName,
            total: 0,
            contacted: 0,
            interested: 0,
            eligibilityConfigured: false,
            eligibilityBase: 0,
            eligible: 0,
            notEligible: 0,
          };
        }

        acc[destinationName].total += 1;
        const contactDate = getContactDate(lead);
        if (contactDate) {
          acc[destinationName].contacted += 1;
        }
        if (normalizeStatusCategory(lead.status) === "Interested / Will apply") {
          acc[destinationName].interested += 1;
        }

        const eligibility = evaluateDestinationEligibility(lead);
        if (eligibility.applicable) {
          acc[destinationName].eligibilityConfigured = true;
          acc[destinationName].eligibilityBase += 1;
          if (eligibility.eligible) {
            acc[destinationName].eligible += 1;
          } else {
            acc[destinationName].notEligible += 1;
          }
        }

        return acc;
      }, {});

    return Object.values(rows)
      .map((row) => ({
        ...row,
        notContacted: Math.max(row.total - row.contacted, 0),
        eligibilityRate:
          row.eligibilityConfigured && row.eligibilityBase > 0
            ? Number(((row.eligible / row.eligibilityBase) * 100).toFixed(1))
            : null,
      }))
      .sort((a, b) => b.total - a.total);
  }, [allLeads, filters]);

  const topDestinationBreakdowns = useMemo(() => {
    const top3 = destinationLeaderboardRows.slice(0, 3);
    const granularity = stats?.timeGranularity || "month";
    const startDate = filters.allTime || !filters.startDate ? null : startOfDay(parseLocalDate(filters.startDate));
    const endDate = filters.allTime || !filters.endDate ? null : endOfDay(parseLocalDate(filters.endDate));

    return top3.map((destRow) => {
      const buckets = {};
      allLeads
        .filter((lead) => lead.destination === destRow.name && inRange(lead.timestamp, startDate, endDate))
        .forEach((lead) => {
          const d = lead.timestamp;
          if (!d) return;
          const key = granularity === "month"
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
            : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (!buckets[key]) buckets[key] = { date: key, leads: 0, contacted: 0, eligible: 0, interested: 0 };
          buckets[key].leads += 1;
          if (getContactDate(lead)) buckets[key].contacted += 1;
          const elig = evaluateDestinationEligibility(lead);
          if (elig.applicable && elig.eligible) buckets[key].eligible += 1;
          if (normalizeStatusCategory(lead.status) === "Interested / Will apply") buckets[key].interested += 1;
        });
      return {
        name: destRow.name,
        total: destRow.total,
        eligible: destRow.eligible,
        interested: destRow.interested,
        eligibilityConfigured: destRow.eligibilityConfigured,
        series: Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
  }, [allLeads, destinationLeaderboardRows, filters, stats?.timeGranularity]);

  const eligibleTrendSeries = useMemo(() => {
    const granularity = stats?.timeGranularity || "month";
    const startDate = filters.allTime || !filters.startDate ? null : startOfDay(parseLocalDate(filters.startDate));
    const endDate = filters.allTime || !filters.endDate ? null : endOfDay(parseLocalDate(filters.endDate));
    const buckets = {};
    allLeads
      .filter((lead) => inRange(lead.timestamp, startDate, endDate))
      .forEach((lead) => {
        const elig = evaluateDestinationEligibility(lead);
        if (!elig.applicable || !elig.eligible) return;
        const d = lead.timestamp;
        if (!d) return;
        const key = granularity === "month"
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (!buckets[key]) buckets[key] = { date: key, italy: 0, lithuania: 0 };
        const dest = normalizeText(lead?.destination);
        if (dest.includes("إيطاليا") || dest.includes("ايطاليا")) buckets[key].italy += 1;
        if (dest.includes("ليتوانيا")) buckets[key].lithuania += 1;
      });
    return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
  }, [allLeads, filters, stats?.timeGranularity]);

  const totalInterested = stats?.totals?.interested ?? 0;
  const totalFollowUp = stats?.totals?.followUp ?? 0;
  const totalNeedsMoreInfo = stats?.totals?.needsMoreInfo ?? 0;
  const totalNotInterested = stats?.totals?.notInterested ?? 0;
  const totalNotObvious = stats?.totals?.notObvious ?? 0;
  const leadToInterestedRate = totalLeads
    ? ((totalInterested / totalLeads) * 100).toFixed(1)
    : "0.0";
  const contactedToInterestedRate = assignedCount
    ? ((totalInterested / assignedCount) * 100).toFixed(1)
    : "0.0";
  const conversionLeakCount = totalNotInterested + totalNotObvious;
  const conversionLeakRate = totalLeads
    ? ((conversionLeakCount / totalLeads) * 100).toFixed(1)
    : "0.0";
  const nurturePipelineCount = totalFollowUp + totalNeedsMoreInfo;
  const nurturePipelineRate = totalLeads
    ? ((nurturePipelineCount / totalLeads) * 100).toFixed(1)
    : "0.0";
  const conversionTrendSeries = useMemo(() => {
    const leadsSeries = stats?.leadsOverTime ?? [];
    const interestedSeries = stats?.leadsOverTimeInterested ?? [];
    if (!leadsSeries.length) return [];

    const interestedMap = new Map(interestedSeries.map((row) => [row.date, row.count]));
    return leadsSeries.map((row) => {
      const interested = interestedMap.get(row.date) || 0;
      const periodLeads = row.count || 0;
      return {
        date: row.date,
        leads: periodLeads,
        interested,
        interestedRate: periodLeads
          ? Number(((interested / periodLeads) * 100).toFixed(1))
          : 0,
      };
    });
  }, [stats]);

  const teamPerformanceTrendSeries = useMemo(() => {
    return stats?.teamPerformanceSeries ?? [];
  }, [stats]);

  const sourceVolumeRows = [...(stats?.bySource ?? [])].sort((a, b) => b.value - a.value);
  const topSourceRows = sourceVolumeRows.slice(0, 8);
  const leadGenTopSourceName = topSourceRows[0]?.name || "-";
  const leadGenTopSourceCount = topSourceRows[0]?.value ?? 0;
  const activeSourceCount = sourceVolumeRows.length;
  const topSourceShare = totalLeads
    ? ((leadGenTopSourceCount / totalLeads) * 100).toFixed(1)
    : "0.0";
  const top3SourceShare = totalLeads
    ? ((topSourceRows.slice(0, 3).reduce((sum, row) => sum + row.value, 0) / totalLeads) * 100).toFixed(1)
    : "0.0";
  const avgLeadsPerSource = activeSourceCount
    ? (totalLeads / activeSourceCount).toFixed(1)
    : "0.0";
  const sourceCoverageCount = sourceVolumeRows.filter((row) => row.value >= 10).length;
  const sourceCoverageRate = activeSourceCount
    ? ((sourceCoverageCount / activeSourceCount) * 100).toFixed(1)
    : "0.0";
  const leadGenGrowthCurrent = Number(stats?.comparison?.totals?.pctChange ?? 0);
  const topSourceTrendKeys = topSourceRows.slice(0, 4).map((row) => row.name);

  const managerScopedLeads = useMemo(() => {
    const startDate =
      filters.allTime || !filters.startDate
        ? null
        : startOfDay(parseLocalDate(filters.startDate));
    const endDate =
      filters.allTime || !filters.endDate
        ? null
        : endOfDay(parseLocalDate(filters.endDate));

    return allLeads.filter((lead) => {
      if (filters.counselor && lead.counselor !== filters.counselor) return false;
      if (filters.destination && lead.destination !== filters.destination) return false;
      // Manager scope: filter by when the agent actually talked to the lead (column V).
      // inRange returns false when date is null, so uncontacted leads are excluded.
      return inRange(getContactDate(lead), startDate, endDate);
    });
  }, [allLeads, filters]);

  const managerAgentRows = useMemo(() => {
    const SLA_HOURS = 24;
    const STALE_DAYS = 3;
    const now = Date.now();
    const rows = new Map();

    // Date range for "untouched" check: leads submitted in this window but never touched.
    const mStartDate =
      filters.allTime || !filters.startDate ? null : startOfDay(parseLocalDate(filters.startDate));
    const mEndDate =
      filters.allTime || !filters.endDate ? null : endOfDay(parseLocalDate(filters.endDate));

    managerScopedLeads.forEach((lead) => {
      const agent = String(lead.counselor || "").trim();
      if (!agent) return;
      const touchDate = getContactDate(lead);
      if (!touchDate) return;

      if (!rows.has(agent)) {
        rows.set(agent, {
          name: agent,
          assigned: 0,
          interested: 0,
          notInterested: 0,
          followUp: 0,
          delayHoursSum: 0,
          delayCount: 0,
          withinSla: 0,
          untouched: 0,
          stalled: 0,
        });
      }

      const row = rows.get(agent);
      row.assigned += 1;

      const statusCat = normalizeStatusCategory(lead.status);
      if (statusCat === "Interested / Will apply") row.interested += 1;
      if (statusCat === "Not Interested / Disqualified") row.notInterested += 1;
      if (statusCat === "Follow-Up / No Reply") row.followUp += 1;

      const leadDate = lead.timestamp || null;
      if (leadDate) {
        const delayHours = (touchDate.getTime() - leadDate.getTime()) / 3600000;
        if (delayHours >= 0) {
          row.delayHoursSum += delayHours;
          row.delayCount += 1;
          if (delayHours <= SLA_HOURS) row.withinSla += 1;
        }
      }

      const lastActivityDate = lead.lastStateUpdate || touchDate || leadDate;
      if (statusCat === "Follow-Up / No Reply" && lastActivityDate) {
        const staleDays = (now - lastActivityDate.getTime()) / 86400000;
        if (staleDays > STALE_DAYS) row.stalled += 1;
      }
    });

    // Count leads assigned to each agent that arrived in the period but were never contacted.
    // These are absent from managerScopedLeads (which requires lastStateUpdate to be set).
    allLeads.forEach((lead) => {
      const agent = String(lead.counselor || "").trim();
      if (!agent) return;
      if (filters.counselor && lead.counselor !== filters.counselor) return;
      if (filters.destination && lead.destination !== filters.destination) return;
      if (hasContactedLead(lead)) return;
      if (!inRange(lead.timestamp, mStartDate, mEndDate)) return;

      if (!rows.has(agent)) {
        rows.set(agent, {
          name: agent,
          assigned: 0,
          interested: 0,
          notInterested: 0,
          followUp: 0,
          delayHoursSum: 0,
          delayCount: 0,
          withinSla: 0,
          untouched: 0,
          stalled: 0,
        });
      }
      rows.get(agent).untouched += 1;
    });

    return Array.from(rows.values())
      .map((row) => {
        const avgDelayHours = row.delayCount ? row.delayHoursSum / row.delayCount : 0;
        const slaRate = row.delayCount ? (row.withinSla / row.delayCount) * 100 : 0;
        const conversionRate = row.assigned ? (row.interested / row.assigned) * 100 : 0;
        const notInterestedRate = row.assigned ? (row.notInterested / row.assigned) * 100 : 0;
        const totalForRate = row.assigned + row.untouched;
        const untouchedRate = totalForRate ? (row.untouched / totalForRate) * 100 : 0;
        const stalledRate = row.assigned ? (row.stalled / row.assigned) * 100 : 0;
        const riskScore = Math.round(
          (100 - slaRate) * 0.45 + stalledRate * 0.35 + untouchedRate * 0.2 + Math.min(avgDelayHours, 168) * 0.4
        );

        return {
          ...row,
          avgDelayHours,
          slaRate,
          conversionRate,
          notInterestedRate,
          untouchedRate,
          stalledRate,
          riskScore,
          // Alert metrics
          interestedRate: row.assigned ? Math.round((row.interested / row.assigned) * 100) : 0,
          alertCount: (
            (row.untouched > 10 ? 1 : 0) +
            (row.stalled > 5 ? 1 : 0) +
            (notInterestedRate > 40 ? 1 : 0)
          ),
        };
      })
      .sort((a, b) => b.assigned - a.assigned);
  }, [managerScopedLeads, allLeads, filters]);

  const managerTotals = managerAgentRows.reduce(
    (acc, row) => {
      acc.assigned += row.assigned;
      acc.interested += row.interested;
      acc.notInterested += row.notInterested;
      acc.followUp += row.followUp;
      acc.delayHoursSum += row.delayHoursSum;
      acc.delayCount += row.delayCount;
      acc.withinSla += row.withinSla;
      acc.untouched += row.untouched;
      acc.stalled += row.stalled;
      return acc;
    },
    {
      assigned: 0,
      interested: 0,
      notInterested: 0,
      followUp: 0,
      delayHoursSum: 0,
      delayCount: 0,
      withinSla: 0,
      untouched: 0,
      stalled: 0,
    }
  );

  const managerConversionRate = managerTotals.assigned
    ? ((managerTotals.interested / managerTotals.assigned) * 100).toFixed(1)
    : "0.0";
  const managerActiveAgents = managerAgentRows.length;
  const managerInactiveAgents = inactiveAgents.length;
  const managerContactedLeads = managerTotals.assigned;
  const managerInterestedLeads = managerTotals.interested;
  const managerInterestedFromContactedRate = managerContactedLeads
    ? ((managerInterestedLeads / managerContactedLeads) * 100).toFixed(1)
    : "0.0";
  const contactedLeadsChange = calcPctChange(
    managerContactedLeads,
    previousPeriodTeamMetrics.contacted
  );
  const contactedLeadsComparisonHelper = rangeDays
    ? `${formatPct(contactedLeadsChange)} vs previous period (${formatNumber(previousPeriodTeamMetrics.contacted)})`
    : "";
  const contactedLeadsComparisonTone =
    contactedLeadsChange > 0
      ? "positive"
      : contactedLeadsChange < 0
      ? "negative"
      : null;
  const interestedLeadsChange = calcPctChange(
    managerInterestedLeads,
    previousPeriodTeamMetrics.interested
  );
  const interestedLeadsComparisonHelper = rangeDays
    ? `${formatPct(interestedLeadsChange)} vs previous period (${formatNumber(previousPeriodTeamMetrics.interested)})`
    : "";
  const interestedLeadsComparisonTone =
    interestedLeadsChange > 0
      ? "positive"
      : interestedLeadsChange < 0
      ? "negative"
      : null;
  const managerAvgContactedPerAgent = managerActiveAgents
    ? (managerContactedLeads / managerActiveAgents).toFixed(1)
    : "0.0";
  const managerTotalUntouched = managerTotals.untouched;
  const managerTotalStalled = managerTotals.stalled;
  const managerNotInterestedRate = managerTotals.assigned
    ? ((managerTotals.notInterested / managerTotals.assigned) * 100).toFixed(1)
    : "0.0";

  // Most recent lastStateUpdate per agent across all leads (not filtered)
  const agentLastActivity = useMemo(() => {
    const map = new Map();
    allLeads.forEach((lead) => {
      const agent = String(lead.counselor || "").trim();
      if (!agent || !lead.lastStateUpdate) return;
      const current = map.get(agent);
      if (!current || lead.lastStateUpdate > current) map.set(agent, lead.lastStateUpdate);
    });
    return map;
  }, [allLeads]);

  const teamPipelineData = managerAgentRows.slice(0, 8).map((row) => ({
    name: row.name,
    Interested: row.interested,
    "Follow-up": row.followUp,
    "Not interested": row.notInterested,
    Untouched: row.untouched,
  }));

  const managerContactedVsInterestedData = [...managerAgentRows]
    .slice(0, 8)
    .map((row) => ({
      name: row.name,
      contacted: row.assigned,
      interested: row.interested,
    }));

  const managerEffortData = [...managerAgentRows]
    .slice(0, 8)
    .map((row) => ({
      name: row.name,
      contacted: row.assigned,
      avgDelayHours: Number(row.avgDelayHours.toFixed(1)),
    }));

  const managerWeeklyAlerts = useMemo(() => {
    const now = new Date();
    const { weekStart, weekEnd } = getLastCompletedAlgeriaWeek(now);
    const yesterday = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

    const allAgentNames = Array.from(
      new Set([
        ...allAgents,
        ...allLeads.map((lead) => String(lead?.counselor || "").trim()).filter(Boolean),
      ])
    );

    return allAgentNames
      .map((agentName) => {
        const agentLeads = allLeads.filter(
          (lead) => String(lead?.counselor || "").trim() === agentName
        );

        // All-time activity days from column V (lastStateUpdate) only.
        // Used for the consecutive-inactive rolling check.
        const allActivityDays = new Set(
          agentLeads
            .map((lead) => lead.lastStateUpdate)
            .filter(Boolean)
            .map((date) => toLocalDateString(date))
        );

        // Don't flag agents who have no lastStateUpdate data at all —
        // column V may not be filled yet and they would appear falsely inactive.
        if (allActivityDays.size === 0) return null;

        // Leads the agent touched during the last completed week (col V date in window)
        const touchedInWeek = agentLeads.filter((lead) => {
          const d = lead.lastStateUpdate;
          return d && d >= weekStart && d <= weekEnd;
        });

        const contactedWeek = touchedInWeek.length;
        const interestedWeek = touchedInWeek.filter(
          (lead) => normalizeStatusCategory(lead.status) === "Interested / Will apply"
        ).length;
        const interestedRateWeek = contactedWeek ? (interestedWeek / contactedWeek) * 100 : 0;

        const activeDaysInWeek = new Set(
          touchedInWeek.map((lead) => toLocalDateString(lead.lastStateUpdate))
        ).size;
        const inactiveDaysInWeek = Math.max(7 - activeDaysInWeek, 0);

        // Rolling consecutive inactive days (looking back from yesterday, max 21)
        let consecutiveInactive = 0;
        const cursor = new Date(yesterday);
        for (let i = 0; i < 21; i += 1) {
          const key = toLocalDateString(cursor);
          if (allActivityDays.has(key)) break;
          consecutiveInactive += 1;
          cursor.setDate(cursor.getDate() - 1);
        }

        const reasons = [];
        if (consecutiveInactive >= 2) {
          reasons.push(`Inactive for ${consecutiveInactive} full days in a row`);
        }
        if (inactiveDaysInWeek >= 3) {
          reasons.push(`Worked only ${activeDaysInWeek} day${activeDaysInWeek !== 1 ? "s" : ""} last week (minimum 4 required)`);
        }
        if (contactedWeek < 50) {
          reasons.push(`Contacted only ${contactedWeek} leads last week (minimum 50)`);
        }
        if (contactedWeek > 0 && interestedRateWeek < 10) {
          reasons.push(`Interested rate ${interestedRateWeek.toFixed(1)}% last week (minimum 10%)`);
        }

        return {
          agentName,
          contactedWeek,
          interestedWeek,
          interestedRateWeek: Number(interestedRateWeek.toFixed(1)),
          activeDaysInWeek,
          inactiveDaysInWeek,
          consecutiveInactive,
          reasons,
          hasAlert: reasons.length > 0,
          weekLabel: `${toLocalDateString(weekStart)} → ${toLocalDateString(weekEnd)}`,
        };
      })
      .filter((row) => row && row.hasAlert)
      .sort((a, b) => b.reasons.length - a.reasons.length || a.agentName.localeCompare(b.agentName));
  }, [allAgents, allLeads]);

  if (!authToken) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.8)]">
          <p className="text-xs uppercase tracking-[0.3em] text-indigo-300/70">ElNadjah Intelligence</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-50">Login Portal</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in to access the ElNadjah dashboard.</p>

          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="admin@elnadjah.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="Enter your password"
                required
              />
            </div>
            {loginError && <p className="text-xs text-rose-400">{loginError}</p>}
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full rounded-lg border border-indigo-500 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-100 disabled:opacity-60"
            >
              {loginLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="bg-slate-950/70 border-b border-slate-900 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-300/70">
              ElNadjah Intelligence
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{authUser?.email || "Authenticated"}</span>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                Logout
              </button>
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-slate-50">
            ElNadjah Dashboard
          </h1>
          <p className="text-sm text-slate-400">
            Google Form responses analytics in real time.
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {managerWeeklyAlerts.length > 0 && (
          <div className="rounded-2xl border border-rose-700/60 bg-rose-950/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center rounded-full bg-rose-600 text-white text-[11px] font-bold px-2 py-0.5 leading-none">
                  {managerWeeklyAlerts.length}
                </span>
                <h3 className="text-sm font-semibold text-rose-200">
                  Red alert{managerWeeklyAlerts.length > 1 ? "s" : ""} this week — {managerWeeklyAlerts.length} agent{managerWeeklyAlerts.length > 1 ? "s" : ""} need{managerWeeklyAlerts.length === 1 ? "s" : ""} attention
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAlertsPanelCollapsed((prev) => !prev)}
                className="shrink-0 text-xs text-rose-300 hover:text-rose-100 underline"
              >
                {alertsPanelCollapsed ? "Show details" : "Hide"}
              </button>
            </div>
            {!alertsPanelCollapsed && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {managerWeeklyAlerts.map((alert) => (
                  <div key={`global-alert-${alert.agentName}`} className="rounded-lg border border-rose-800/60 bg-rose-950/40 p-3">
                    <p className="text-sm font-semibold text-rose-100">{alert.agentName}</p>
                    <p className="text-[11px] text-rose-400 mb-1.5">{alert.weekLabel}</p>
                    <ul className="text-xs text-rose-200 space-y-0.5 list-disc list-inside">
                      {alert.reasons.map((reason) => (
                        <li key={`global-${alert.agentName}-${reason}`}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Move tab navigation above filter section */}
        <div className="relative rounded-2xl border border-slate-800 bg-slate-950 p-1 mb-8 mt-2">
          <div className="no-scrollbar flex w-full items-center gap-2 overflow-x-auto py-2 px-1 sm:px-2 md:flex-wrap md:overflow-visible">
            {[
              { key: "general", label: "General KPIs" },
              { key: "destinations", label: "Destinations KPIs" },
              { key: "manager", label: "Manager dashboard" },
            ].map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setActiveOverviewGroup(group.key)}
                className={`shrink-0 whitespace-nowrap rounded-full border-2 px-3 py-2 text-[11px] font-semibold tracking-[0.01em] transition shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:px-4 sm:text-xs ${
                  activeOverviewGroup === group.key
                    ? "bg-indigo-500 text-white border-indigo-400 shadow-indigo-900/40"
                    : "bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800 hover:text-white"
                }`}
                style={{ minWidth: 84 }}
              >
                {group.key === "manager" && managerWeeklyAlerts.length > 0 ? (
                  <span className="flex items-center gap-1.5">
                    {group.label}
                    <span className="inline-flex items-center justify-center rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                      {managerWeeklyAlerts.length}
                    </span>
                  </span>
                ) : (
                  group.label
                )}
              </button>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-1 right-1 w-8 rounded-r-xl bg-gradient-to-l from-slate-950/70 via-slate-950/40 to-transparent md:hidden" />
        </div>

        <section className="sticky top-2 z-20 rounded-2xl border border-slate-900 bg-slate-900/80 p-4 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.8)] backdrop-blur mb-8">
          <div className="hidden md:flex flex-wrap items-end gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
              {[
                { key: "today", label: "Today" },
                { key: "day", label: "Yesterday" },
                { key: "week", label: "7d" },
                { key: "month", label: "30d" },
                { key: "all", label: "All" },
              ].map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() =>
                    preset.key === "all"
                      ? applyAllTime(false)
                      : applyPreset(preset.key, false)
                  }
                  className={`rounded-md px-2 py-1 text-[11px] ${
                    quickRange === preset.key
                      ? "bg-indigo-500/30 text-indigo-100"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col text-xs">
              <label className="text-slate-400">Start date</label>
              <input
                type="date"
                value={draftFilters.startDate}
                onChange={(event) => {
                  setDraftFilters((prev) => ({
                    ...prev,
                    startDate: event.target.value,
                    allTime: false,
                    monthKey: "",
                    filterMode: "custom",
                  }));
                  setQuickRange("custom");
                }}
                className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100"
              />
            </div>

            <div className="flex flex-col text-xs">
              <label className="text-slate-400">End date</label>
              <input
                type="date"
                value={draftFilters.endDate}
                onChange={(event) => {
                  setDraftFilters((prev) => ({
                    ...prev,
                    endDate: event.target.value,
                    allTime: false,
                    monthKey: "",
                    filterMode: "custom",
                  }));
                  setQuickRange("custom");
                }}
                className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100"
              />
            </div>

            <div className="flex flex-col text-xs min-w-[170px]">
              <label className="text-slate-400">Agent</label>
              <select
                className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100"
                value={draftFilters.counselor}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, counselor: event.target.value }))
                }
              >
                <option value="">All agents</option>
                {counselorOptions.map((counselor) => (
                  <option key={counselor} value={counselor}>
                    {counselor}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col text-xs min-w-[170px]">
              <label className="text-slate-400">Destination</label>
              <select
                className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100"
                value={draftFilters.destination}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, destination: event.target.value }))
                }
              >
                <option value="">All destinations</option>
                {destinationOptions.map((destination) => (
                  <option key={destination} value={destination}>
                    {destination}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className="h-[34px] rounded-lg border border-slate-800 bg-slate-950 px-3 text-[11px] text-slate-200 hover:border-indigo-500"
            >
              More filters
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[34px] rounded-lg border border-slate-800 bg-slate-950 px-3 text-[11px] text-slate-200 hover:border-indigo-500"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setRefreshKey((prev) => prev + 1)}
              className="h-[34px] rounded-lg border border-slate-800 bg-slate-950 px-3 text-[11px] text-slate-200 hover:border-indigo-500"
            >
              Refresh
            </button>
          </div>

          {showAdvancedFilters && (
            <div className="hidden md:flex mt-3 items-end gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex flex-col text-xs">
                <label className="text-slate-400">Month</label>
                <select
                  className={`mt-1 rounded-lg border px-2 py-1.5 text-slate-100 bg-slate-950 ${
                    draftFilters.monthKey ? "border-indigo-500" : "border-slate-800"
                  }`}
                  value={draftFilters.monthKey || ""}
                  onChange={(event) => {
                    const selectedKey = event.target.value;
                    if (!selectedKey) {
                      setDraftFilters((prev) => ({ ...prev, monthKey: "" }));
                      return;
                    }
                    const selected = monthOptions.find((opt) => opt.key === selectedKey);
                    if (!selected) return;
                    const startDate = new Date(selected.year, selected.monthIndex, 1);
                    const endDate = new Date(selected.year, selected.monthIndex + 1, 0);
                    setDraftFilters((prev) => ({
                      ...prev,
                      startDate: toLocalDateString(startDate),
                      endDate: toLocalDateString(endDate),
                      monthKey: selectedKey,
                      allTime: false,
                      filterMode: "monthName",
                    }));
                    setQuickRange("custom");
                  }}
                >
                  <option value="">Select month</option>
                  {monthOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="md:hidden flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMobileFilters(true)}
              className="h-[34px] rounded-lg border border-slate-800 bg-slate-950 px-3 text-[11px] text-slate-200"
            >
              Filters
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[34px] rounded-lg border border-slate-800 bg-slate-950 px-3 text-[11px] text-slate-200"
            >
              Reset
            </button>
          </div>

          {activeFilterChips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => clearFilterChip(chip.key)}
                  className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-200 hover:border-indigo-500"
                >
                  {chip.label} x
                </button>
              ))}
            </div>
          )}
        </section>

        {showMobileFilters && (
          <div className="fixed inset-0 z-40 bg-slate-950/80 md:hidden">
            <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Filters</h3>
                <button
                  type="button"
                  onClick={() => setShowMobileFilters(false)}
                  className="rounded-lg border border-slate-800 px-2 py-1 text-xs text-slate-200"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
                  {[
                    { key: "today", label: "Today" },
                    { key: "day", label: "Yesterday" },
                    { key: "week", label: "7d" },
                    { key: "month", label: "30d" },
                    { key: "all", label: "All" },
                  ].map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() =>
                        preset.key === "all"
                          ? applyAllTime(false)
                          : applyPreset(preset.key, false)
                      }
                      className={`rounded-md px-2 py-1 text-[11px] ${
                        quickRange === preset.key
                          ? "bg-indigo-500/30 text-indigo-100"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col text-xs">
                    <label className="text-slate-400">Start date</label>
                    <input
                      type="date"
                      value={draftFilters.startDate}
                      onChange={(event) => {
                        setDraftFilters((prev) => ({
                          ...prev,
                          startDate: event.target.value,
                          allTime: false,
                          monthKey: "",
                          filterMode: "custom",
                        }));
                        setQuickRange("custom");
                      }}
                      className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100"
                    />
                  </div>
                  <div className="flex flex-col text-xs">
                    <label className="text-slate-400">End date</label>
                    <input
                      type="date"
                      value={draftFilters.endDate}
                      onChange={(event) => {
                        setDraftFilters((prev) => ({
                          ...prev,
                          endDate: event.target.value,
                          allTime: false,
                          monthKey: "",
                          filterMode: "custom",
                        }));
                        setQuickRange("custom");
                      }}
                      className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex flex-col text-xs">
                  <label className="text-slate-400">Agent</label>
                  <select
                    className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100"
                    value={draftFilters.counselor}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, counselor: event.target.value }))
                    }
                  >
                    <option value="">All agents</option>
                    {counselorOptions.map((counselor) => (
                      <option key={counselor} value={counselor}>
                        {counselor}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col text-xs">
                  <label className="text-slate-400">Destination</label>
                  <select
                    className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100"
                    value={draftFilters.destination}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, destination: event.target.value }))
                    }
                  >
                    <option value="">All destinations</option>
                    {destinationOptions.map((destination) => (
                      <option key={destination} value={destination}>
                        {destination}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col text-xs">
                  <label className="text-slate-400">Month</label>
                  <select
                    className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100"
                    value={draftFilters.monthKey || ""}
                    onChange={(event) => {
                      const selectedKey = event.target.value;
                      if (!selectedKey) {
                        setDraftFilters((prev) => ({ ...prev, monthKey: "" }));
                        return;
                      }
                      const selected = monthOptions.find((opt) => opt.key === selectedKey);
                      if (!selected) return;
                      const startDate = new Date(selected.year, selected.monthIndex, 1);
                      const endDate = new Date(selected.year, selected.monthIndex + 1, 0);
                      setDraftFilters((prev) => ({
                        ...prev,
                        startDate: toLocalDateString(startDate),
                        endDate: toLocalDateString(endDate),
                        monthKey: selectedKey,
                        allTime: false,
                        filterMode: "monthName",
                      }));
                      setQuickRange("custom");
                    }}
                  >
                    <option value="">Select month</option>
                    {monthOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-[36px] flex-1 rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-200"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setShowMobileFilters(false)}
                  className="h-[36px] flex-1 rounded-lg border border-indigo-500 bg-indigo-500/20 text-xs text-indigo-100"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {loading || serverStatsLoading || !stats ? (
          <div className="rounded-2xl bg-slate-900/70 p-10 text-center text-slate-400 shadow-sm border border-slate-900 flex flex-col items-center justify-center">
            <svg className="animate-spin h-8 w-8 mb-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            Loading analytics...
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-rose-500/10 p-10 text-center text-rose-300 shadow-sm border border-rose-500/30">
            {error}
          </div>
        ) : activePage === "overview" ? (
          <>
            {!alertsCollapsed && (
              <section className="mb-6 rounded-2xl bg-rose-950/30 p-5 border border-rose-900/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-rose-100">
                    🚨 Red alerts this week — {managerAgentRows.filter(row => row.alertCount > 0).length} agents need attention
                  </h3>
                  <button
                    onClick={() => setAlertsCollapsed(true)}
                    className="text-rose-400 hover:text-rose-300 text-sm font-medium transition-colors"
                  >
                    Hide
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {managerAgentRows
                    .filter(row => row.alertCount > 0)
                    .map((agent) => (
                      <div key={`alert-${agent.name}`} className="rounded-lg bg-rose-900/20 border border-rose-900/40 p-4">
                        <h4 className="font-medium text-rose-300 mb-1">{agent.name}</h4>
                        <p className="text-xs text-rose-400/70 mb-3">
                          {toLocalDateString(new Date(stats?.range?.startDate))} → {toLocalDateString(new Date(stats?.range?.endDate))}
                        </p>
                        <ul className="space-y-1 text-xs text-rose-200">
                          {agent.untouched > 10 && (
                            <li>• Inactive for {agent.untouched} full days in a row</li>
                          )}
                          {agent.workingDaysLastWeek && agent.workingDaysLastWeek < 4 && (
                            <li>• Worked only {agent.workingDaysLastWeek} days last week (minimum 4 required)</li>
                          )}
                          {agent.contactsLastWeek && agent.contactsLastWeek < 50 && (
                            <li>• Contacted only {agent.contactsLastWeek} leads last week (minimum 50)</li>
                          )}
                          {agent.interestedRate && agent.interestedRate < 15 && (
                            <li>• Very low interested rate: {agent.interestedRate}%</li>
                          )}
                        </ul>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* Bottom compact alert banner removed per user request. Top card-only alerts kept. */}

            {activeOverviewGroup === "general" && (
              <section className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                          title="Total leads"
                          value={formatNumber(stats?.totals?.total ?? 0)}
                          helper={totalComparisonHelper}
                          helperTone={
                            Number(stats?.comparison?.totals?.pctChange) >= 0
                              ? "positive"
                              : "negative"
                          }
                        />
                        <StatCard
                          title="Interested stage"
                          value={formatNumber(stats?.totals?.interested ?? 0)}
                          helper={interestedComparisonHelper}
                          helperTone={
                            Number(stats?.comparison?.interested?.pctChange) >= 0
                              ? "positive"
                              : "negative"
                          }
                        />
                        <StatCard
                          title="Contacted rate"
                          value={`${rateOf(assignedCount)}%`}
                          helper={`Contacted: ${formatNumber(assignedCount)} · Not contacted: ${formatNumber(notContactedCount)}`}
                          helperTone={null}
                        />
                        <StatCard
                          title="Eligibility pass rate"
                          value={`${eligibilityRate}%`}
                          helper={`Eligible: ${formatNumber(eligibleCount)} · Not eligible: ${formatNumber(notEligibleCount)}`}
                          helperTone={Number(eligibilityRate) >= 50 ? "positive" : "negative"}
                        />
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <MiniStat
                          title="Avg contacted/day (team)"
                          value={teamAvgContactedPerDay}
                          subtitle={`${formatNumber(totalTeamContacted)} contacted over ${formatNumber(rangeDays)} day(s)`}
                          helper={teamAvgContactedComparisonHelper}
                        />
                        <MiniStat
                          title="Top agent"
                          value={topAgent?.name || "-"}
                          subtitle={topAgent ? `Leads: ${formatNumber(topAgent.contacted)} · Share: ${topAgentShare}` : ""}
                        />
                        <MiniStat
                          title="Interested rate"
                          value={`${leadToInterestedRate}%`}
                          subtitle="Interested out of all leads in selected period"
                        />
                        <MiniStat
                          title="Fastest-growing destination"
                          value={topCountryGrowth?.name || "-"}
                          subtitle={
                            topCountryGrowth
                              ? `${topDestinationDelta >= 0 ? "+" : ""}${formatNumber(topDestinationDelta)} leads (${formatPct(topCountryGrowth.pctChange)})`
                              : ""
                          }
                        />
                      </div>

                <div className="grid gap-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <ChartCard title="Leads trend">
                      <ResponsiveContainer>
                        <LineChart data={stats?.leadsOverTime ?? []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                            stroke="#94a3b8"
                          />
                          <YAxis allowDecimals={false} stroke="#94a3b8" />
                          <Tooltip
                            labelFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                            contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }}
                          />
                          <Line
                            type="monotone"
                            dataKey="count"
                            stroke="#6366F1"
                            strokeWidth={3}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Eligible leads trend — Italy & Lithuania">
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={eligibleTrendSeries} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                          <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={(v) => formatDate(v, stats?.timeGranularity)} />
                          <YAxis allowDecimals={false} stroke="#94a3b8" tick={{ fontSize: 11 }} width={28} />
                          <Tooltip
                            contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }}
                            labelFormatter={(v) => formatDate(v, stats?.timeGranularity)}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="italy" name="Italy" stroke="#22C55E" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="lithuania" name="Lithuania" stroke="#6366F1" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <ChartCard title="Leads by stage">
                      <ResponsiveContainer>
                        <BarChart data={stats?.byStage ?? []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                          <XAxis
                            dataKey="name"
                            stroke="#94a3b8"
                            interval={0}
                            tick={{
                              fill: '#94a3b8',
                              fontSize: 12,
                              angle: -90,
                              textAnchor: 'end',
                              width: 80,
                              overflow: 'hidden',
                            }}
                            height={80}
                          />
                          <YAxis allowDecimals={false} stroke="#94a3b8" />
                          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]} label={{ position: 'top', fill: '#94a3b8', fontSize: 12 }}>
                            {(stats?.byStage ?? []).map((entry, index) => (
                              <Cell
                                key={`general-status-bar-${entry.name}`}
                                fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                    <div></div>
                  </div>

                  <div className="flex flex-col gap-8">
                    <ChartCard title="Potential money trend">
                      <p className="-mt-3 mb-3 text-xs text-slate-400">
                        Combines contacted and interested leads to show potential value.
                      </p>
                      <div className="w-full max-w-full" style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={potentialSeries} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                            <XAxis
                              dataKey="date"
                              tickFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                              stroke="#94a3b8"
                            />
                            <YAxis allowDecimals={false} stroke="#94a3b8" />
                            <Tooltip
                              labelFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                              contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }}
                            />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="potential"
                              name="Potential score"
                              stroke="#F59E0B"
                              strokeWidth={3}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </ChartCard>

                    <ChartCard title="Demand vs Contacted (performance)">
                      <div className="w-full max-w-full" style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={stats?.leadsOverTimePerformance ?? []} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                            <XAxis
                              dataKey="date"
                              tickFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                              stroke="#94a3b8"
                            />
                            <YAxis allowDecimals={false} stroke="#94a3b8" />
                            <Tooltip
                              labelFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                              contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }}
                            />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="total"
                              name="Demand"
                              stroke="#6366F1"
                              strokeWidth={3}
                              dot={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="contacted"
                              name="Contacted"
                              stroke="#22C55E"
                              strokeWidth={3}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </ChartCard>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <ChartCard title="Lead acquisition trend">
                      <p className="-mt-3 mb-3 text-xs text-slate-400">
                        Tracks lead volume and quality (interested rate) over the selected period.
                      </p>
                      <ResponsiveContainer>
                        <LineChart data={conversionTrendSeries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                            stroke="#94a3b8"
                          />
                          <YAxis yAxisId="volume" allowDecimals={false} stroke="#94a3b8" />
                          <YAxis yAxisId="rate" orientation="right" stroke="#94a3b8" />
                          <Tooltip
                            labelFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                            contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }}
                          />
                          <Legend />
                          <Line
                            yAxisId="volume"
                            type="monotone"
                            dataKey="leads"
                            name="Leads"
                            stroke="#6366F1"
                            strokeWidth={3}
                            dot={false}
                          />
                          <Line
                            yAxisId="volume"
                            type="monotone"
                            dataKey="interested"
                            name="Interested"
                            stroke="#22C55E"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            yAxisId="rate"
                            type="monotone"
                            dataKey="interestedRate"
                            name="Interested rate %"
                            stroke="#F59E0B"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Top source trends over time">
                      <p className="-mt-3 mb-3 text-xs text-slate-400">
                        Daily source performance for the top channels in this period.
                      </p>
                      <ResponsiveContainer>
                        <LineChart data={stats?.leadsOverTimeBySource ?? []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                            stroke="#94a3b8"
                          />
                          <YAxis allowDecimals={false} stroke="#94a3b8" />
                          <Tooltip
                            labelFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                            contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }}
                          />
                          <Legend />
                          {topSourceTrendKeys.map((key, index) => (
                            <Line
                              key={`leadgen-source-trend-${key}`}
                              type="monotone"
                              dataKey={key}
                              name={key}
                              stroke={SOURCE_COLORS[index % SOURCE_COLORS.length]}
                              strokeWidth={2}
                              dot={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>
                </div>

                <section className="rounded-2xl bg-slate-900/70 p-5 border border-slate-800">
                  <h3 className="text-base font-semibold text-slate-100 mb-4">
                    Team leaderboard
                  </h3>
                  <div className="overflow-auto">
                    <table className="min-w-full text-xs">
                      <thead className="text-slate-400">
                        <tr className="text-left">
                          <th className="py-2 pr-4">Rank</th>
                          <th className="py-2 pr-4">Agent</th>
                          <th className="py-2 pr-4 text-sky-400">Contacted</th>
                          <th className="py-2 pr-4">Interested</th>
                          <th className="py-2 pr-4">Interested rate</th>
                          <th className="py-2 pr-4">Avg/day</th>
                          <th className="py-2 pr-4">Avg response</th>
                          <th className="py-2 pr-4">Top destination</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-100">
                        {allLeaderboardRows.map((row) => (
                          <tr
                            key={`general-leaderboard-${row.name}`}
                            className={`border-t border-slate-800 ${
                              row.rank === 1
                                ? "bg-amber-400/10"
                                : row.rank === 2
                                ? "bg-slate-400/10"
                                : row.rank === 3
                                ? "bg-amber-700/10"
                                : ""
                            }`}
                          >
                            <td className="py-2 pr-4 font-medium">
                              {row.badge} {row.rank}
                            </td>
                            <td className="py-2 pr-4">{row.name}</td>
                            <td className="py-2 pr-4 text-sky-400 font-medium">{formatNumber(row.contactedInPeriod)}</td>
                            <td className="py-2 pr-4">{formatNumber(row.interested)}</td>
                            <td className="py-2 pr-4 text-emerald-400">{row.interestedRate}%</td>
                            <td className="py-2 pr-4">{row.avgContactedPerDay ?? "-"}</td>
                            <td className="py-2 pr-4">{formatResponseTime(row.avgResponseDays)}</td>
                            <td className="py-2 pr-4">{row.topCountry || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}

            {activeOverviewGroup === "manager" && (
              <section className="space-y-6">
                <section className="rounded-2xl bg-slate-900/70 p-5 border border-slate-800">
                  <h3 className="text-base font-semibold text-slate-100 mb-4">
                    Team leaderboard
                  </h3>
                  <div className="overflow-auto">
                    <table className="min-w-full text-xs">
                      <thead className="text-slate-400">
                        <tr className="text-left">
                          <th className="py-2 pr-4">Rank</th>
                          <th className="py-2 pr-4">Agent</th>
                          <th className="py-2 pr-4 text-sky-400">Contacted</th>
                          <th className="py-2 pr-4">Interested</th>
                          <th className="py-2 pr-4">Interested rate</th>
                          <th className="py-2 pr-4">Avg/day</th>
                          <th className="py-2 pr-4">Avg response</th>
                          <th className="py-2 pr-4">Top destination</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-100">
                        {allLeaderboardRows.map((row) => (
                          <tr
                            key={`manager-leaderboard-${row.name}`}
                            className={`border-t border-slate-800 ${
                              row.rank === 1
                                ? "bg-amber-400/10"
                                : row.rank === 2
                                ? "bg-slate-400/10"
                                : row.rank === 3
                                ? "bg-amber-700/10"
                                : ""
                            }`}
                          >
                            <td className="py-2 pr-4 font-medium">
                              {row.badge} {row.rank}
                            </td>
                            <td className="py-2 pr-4">{row.name}</td>
                            <td className="py-2 pr-4 text-sky-400 font-medium">{formatNumber(row.contactedInPeriod)}</td>
                            <td className="py-2 pr-4">{formatNumber(row.interested)}</td>
                            <td className="py-2 pr-4 text-emerald-400">{row.interestedRate}%</td>
                            <td className="py-2 pr-4">{row.avgContactedPerDay ?? "-"}</td>
                            <td className="py-2 pr-4">{formatResponseTime(row.avgResponseDays)}</td>
                            <td className="py-2 pr-4">{row.topCountry || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    title="Active agents"
                    value={formatNumber(managerActiveAgents)}
                    helper={
                      managerInactiveAgents > 0
                        ? `Inactive: ${inactiveAgents.join(", ")}`
                        : "All agents active"
                    }
                    helperTone={managerInactiveAgents > 0 ? "negative" : "positive"}
                  />
                  <StatCard
                    title="Contacted leads"
                    value={formatNumber(managerContactedLeads)}
                    subtitle={`${managerAvgContactedPerAgent} contacted per active agent`}
                    helper={contactedLeadsComparisonHelper}
                    helperTone={contactedLeadsComparisonTone}
                  />
                  <StatCard
                    title="Interested leads"
                    value={formatNumber(managerInterestedLeads)}
                    subtitle={`${managerInterestedFromContactedRate}% from contacted leads`}
                    helper={interestedLeadsComparisonHelper}
                    helperTone={interestedLeadsComparisonTone}
                  />
                  <StatCard
                    title="Avg contacted/day (team)"
                    value={teamAvgContactedPerDay}
                    subtitle={`${formatNumber(totalTeamContacted)} contacted by ${formatNumber(teamActiveAgents)} active agents`}
                    helper={teamAvgContactedComparisonHelper}
                    helperTone={teamAvgContactedComparisonTone}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <StatCard
                    title="Team interested rate"
                    value={`${teamInterestedRate}%`}
                    helper={`${formatNumber(totalTeamInterested)} interested from ${formatNumber(totalTeamContacted)} contacted`}
                    helperTone={Number(teamInterestedRate) >= 20 ? "positive" : "negative"}
                  />
                  <StatCard
                    title="Avg first response"
                    value={avgTeamResponseDisplay}
                    helper={
                      Number(avgTeamResponseDays) <= 2
                        ? "Fast response benchmark"
                        : "Opportunity to speed up first touch"
                    }
                    helperTone={Number(avgTeamResponseDays) <= 2 ? "positive" : "negative"}
                  />
                </div>

                <ChartCard title="Team performance over time">
                  <p className="-mt-3 mb-3 text-xs text-slate-400">
                    Contacts, interested and follow-up leads per period.
                  </p>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={teamPerformanceTrendSeries} margin={{ top: 20, right: 40, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                          stroke="#94a3b8"
                        />
                        <YAxis allowDecimals={false} stroke="#94a3b8" />
                        <Tooltip
                          labelFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                          contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="contacted"
                          name="Contacted"
                          stroke="#22C55E"
                          strokeWidth={3}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="interested"
                          name="Interested"
                          stroke="#F59E0B"
                          strokeWidth={3}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="followUp"
                          name="Follow-up"
                          stroke="#38BDF8"
                          strokeWidth={3}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <div className="grid gap-6 lg:grid-cols-2">
                  <ChartCard title="Agent output and quality (top 8)">
                    <ResponsiveContainer>
                      <BarChart data={managerContactedVsInterestedData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis allowDecimals={false} stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
                        <Legend />
                        <Bar dataKey="contacted" name="Contacted" fill="#38BDF8" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="interested" name="Interested" fill="#22C55E" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Coverage mix (Contacted/Not contacted)">
                    <ResponsiveContainer>
                      <PieChart>
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
                        <Legend />
                        <Pie
                          data={teamCoverageData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                        >
                          {teamCoverageData.map((entry, index) => (
                            <Cell
                              key={`manager-coverage-cell-${entry.name}`}
                              fill={SOURCE_COLORS[index % SOURCE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <ChartCard title="Interested rate benchmark">
                    <ResponsiveContainer>
                      <BarChart data={teamInterestedRateData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis allowDecimals={false} stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
                        <Legend />
                        <ReferenceLine y={30} stroke="#94a3b8" strokeDasharray="4 4" label="Target 30%" />
                        <Bar dataKey="interestedRate" fill="#F59E0B" radius={[6, 6, 0, 0]} name="Interested rate %" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Avg contacted per day by agent">
                    <ResponsiveContainer>
                      <BarChart data={teamAvgContactedPerDayData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
                        <Legend />
                        <Bar
                          dataKey="avgContactedPerDay"
                          fill="#38BDF8"
                          radius={[6, 6, 0, 0]}
                          name="Avg contacted/day"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                <ChartCard title="Pipeline breakdown by agent (top 8)">
                  <ResponsiveContainer>
                    <BarChart data={teamPipelineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="name" stroke="#94a3b8" />
                      <YAxis allowDecimals={false} stroke="#94a3b8" />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
                      <Legend />
                      <Bar dataKey="Interested" stackId="a" fill="#22C55E" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Follow-up" stackId="a" fill="#F59E0B" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Not interested" stackId="a" fill="#E11D48" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Untouched" stackId="a" fill="#64748B" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

              </section>
            )}

            {activeOverviewGroup === "destinations" && (
              <section className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    title="Active destinations"
                    value={formatNumber(activeDestinationCount)}
                    helper={`${formatNumber(destinationCoverageCount)} markets with 10+ leads`}
                    helperTone={Number(destinationCoverageRate) >= 50 ? "positive" : "negative"}
                  />
                  <StatCard
                    title="Top destination"
                    value={topDestinationName}
                    helper={`${formatNumber(topDestinationLeadCount)} leads (${topDestinationShare}% share)`}
                    helperTone={null}
                  />
                  <StatCard
                    title="Top 3 market share"
                    value={`${top3DestinationShare}%`}
                    helper={
                      Number(top3DestinationShare) >= 70
                        ? "High concentration risk"
                        : "Healthy diversification"
                    }
                    helperTone={Number(top3DestinationShare) >= 70 ? "negative" : "positive"}
                  />
                  <StatCard
                    title="Fastest-growing destination"
                    value={topCountryGrowth?.name || "-"}
                    helper={
                      topCountryGrowth
                        ? `${topDestinationDelta >= 0 ? "+" : ""}${formatNumber(topDestinationDelta)} leads (${formatPct(topCountryGrowth.pctChange)}; ${formatNumber(
                            topCountryGrowth.current
                          )} vs ${formatNumber(topCountryGrowth.previous)})`
                        : "No growth delta for selected period"
                    }
                    helperTone={
                      Number(topCountryGrowth?.pctChange ?? 0) >= 0 ? "positive" : "negative"
                    }
                  />
                </div>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <MiniStat
                    title="Avg leads per destination"
                    value={avgLeadsPerDestination}
                    subtitle={`${formatNumber(totalLeads)} leads across ${formatNumber(activeDestinationCount)} destinations`}
                  />
                  <MiniStat
                    title="Coverage depth"
                    value={`${destinationCoverageRate}%`}
                    subtitle="Share of destinations with 10+ leads"
                  />
                  <MiniStat
                    title="Growth market share"
                    value={topCountryGrowth?.name || "-"}
                    subtitle={
                      topCountryGrowth
                        ? `${formatNumber(topCountryGrowth.current)} current-period leads`
                        : "No dominant growth market"
                    }
                  />
                  <MiniStat
                    title="Concentration signal"
                    value={
                      Number(top3DestinationShare) >= 70
                        ? "High"
                        : Number(top3DestinationShare) >= 50
                        ? "Medium"
                        : "Low"
                    }
                    subtitle="Risk of over-dependence on few markets"
                  />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <ChartCard title="Top destination momentum over time">
                    <ResponsiveContainer>
                      <LineChart data={stats?.leadsOverTimeByDestination ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                          stroke="#94a3b8"
                        />
                        <YAxis allowDecimals={false} stroke="#94a3b8" />
                        <Tooltip
                          labelFormatter={(value) => formatDate(value, stats?.timeGranularity)}
                          contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }}
                        />
                        <Legend />
                        {topDestinationTrendKeys.map((destinationName, index) => (
                          <Line
                            key={destinationName}
                            type="monotone"
                            dataKey={destinationName}
                            stroke={STATUS_COLORS[index % STATUS_COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Eligible leads trend — Italy & Lithuania">
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={eligibleTrendSeries} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={(v) => formatDate(v, stats?.timeGranularity)} />
                        <YAxis allowDecimals={false} stroke="#94a3b8" tick={{ fontSize: 11 }} width={28} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }}
                          labelFormatter={(v) => formatDate(v, stats?.timeGranularity)}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="italy" name="Italy" stroke="#22C55E" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="lithuania" name="Lithuania" stroke="#6366F1" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                <ChartCard title="Destination volume ranking (top 8)">
                  <ResponsiveContainer>
                    <BarChart data={topDestinationRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="name" stroke="#94a3b8" />
                      <YAxis allowDecimals={false} stroke="#94a3b8" />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
                      <Bar dataKey="value" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {topDestinationBreakdowns.length > 0 && (
                  <section className="rounded-2xl bg-slate-900/70 p-5 border border-slate-800">
                    <h3 className="text-base font-semibold text-slate-100 mb-4">Top destinations breakdown</h3>
                    <div className="grid gap-6 lg:grid-cols-3">
                      {topDestinationBreakdowns.map((dest) => (
                      <ChartCard key={dest.name} title={dest.name}>
                        <div className="flex gap-4 mb-3 text-xs text-slate-400 flex-wrap">
                          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#6366F1" }} />Leads</span>
                          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#0EA5E9" }} />Contacted</span>
                          {dest.eligibilityConfigured && (
                            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#22C55E" }} />Eligible</span>
                          )}
                          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#F59E0B" }} />Interested</span>
                        </div>
                        {dest.series.length > 0 ? (
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={dest.series} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 10 }} tickFormatter={(v) => formatDate(v, stats?.timeGranularity)} />
                              <YAxis allowDecimals={false} stroke="#94a3b8" tick={{ fontSize: 10 }} width={28} />
                              <Tooltip
                                contentStyle={{ background: "#0f172a", border: "1px solid #1f2937", fontSize: 11 }}
                                labelFormatter={(v) => formatDate(v, stats?.timeGranularity)}
                              />
                              <Line type="monotone" dataKey="leads" name="Leads" stroke="#6366F1" strokeWidth={2} dot={false} />
                              <Line type="monotone" dataKey="contacted" name="Contacted" stroke="#0EA5E9" strokeWidth={2} dot={false} />
                              {dest.eligibilityConfigured && (
                                <Line type="monotone" dataKey="eligible" name="Eligible" stroke="#22C55E" strokeWidth={2} dot={false} />
                              )}
                              <Line type="monotone" dataKey="interested" name="Interested" stroke="#F59E0B" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-[180px] text-slate-500 text-xs">No data for period</div>
                        )}
                        <div className="flex gap-4 mt-3 text-xs text-slate-400 border-t border-slate-800 pt-3">
                          <span className="text-slate-100 font-medium">{dest.total}</span> leads
                          {dest.eligibilityConfigured && (
                            <><span className="text-green-400 font-medium">{dest.eligible}</span> eligible</>
                          )}
                          <span className="text-amber-400 font-medium">{dest.interested}</span> interested
                        </div>
                      </ChartCard>
                    ))}
                    </div>
                  </section>
                )}

                <section className="rounded-2xl bg-slate-900/70 p-5 border border-slate-800">
                  <h3 className="text-base font-semibold text-slate-100 mb-4">
                    Destinations leaderboard
                  </h3>
                  <div className="overflow-auto">
                    <table className="min-w-full text-xs">
                      <thead className="text-slate-400">
                        <tr className="text-left">
                          <th className="py-2 pr-4">Destination</th>
                          <th className="py-2 pr-4">Total leads</th>
                          <th className="py-2 pr-4">Contacted</th>
                          <th className="py-2 pr-4">Interested</th>
                          <th className="py-2 pr-4">Not contacted</th>
                          <th className="py-2 pr-4">Eligible</th>
                          <th className="py-2 pr-4">Eligibility rate</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-100">
                        {destinationLeaderboardRows.slice(0, 15).map((row) => (
                          <tr
                            key={`destinations-leaderboard-${row.name}`}
                            className="border-t border-slate-800"
                          >
                            <td className="py-2 pr-4">{row.name}</td>
                            <td className="py-2 pr-4">{formatNumber(row.total)}</td>
                            <td className="py-2 pr-4">{formatNumber(row.contacted)}</td>
                            <td className="py-2 pr-4">{formatNumber(row.interested)}</td>
                            <td className="py-2 pr-4">{formatNumber(row.notContacted)}</td>
                            <td className="py-2 pr-4">
                              {row.eligibilityConfigured ? formatNumber(row.eligible) : "-"}
                            </td>
                            <td className="py-2 pr-4">
                              {row.eligibilityConfigured && row.eligibilityRate !== null
                                ? `${row.eligibilityRate}%`
                                : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}
          </>
        ) : activePage === "agents" ? (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <StatCard title="Active agents" value={activeAgentNames.length} />
              <StatCard title="Total leads" value={stats?.totals?.total ?? 0} />
              <StatCard title="Total contacted" value={assignedCount} />
              <StatCard
                title="Not assigned yet"
                value={
                  agentDetails.find((item) => item.name === "Not assigned yet")?.total ?? 0
                }
              />
            </section>

            <section className="rounded-2xl bg-slate-900/70 p-5 border border-slate-800">
              <h3 className="text-base font-semibold text-slate-100 mb-4">
                Agent leaderboard
              </h3>
              <div className="overflow-auto">
                <table className="min-w-full text-sm sm:text-xs">
                  <thead className="text-slate-400">
                    <tr className="text-left">
                      <th className="py-2 pr-4">Rank</th>
                      <th className="py-2 pr-4">Agent</th>
                      <th className="py-2 pr-4">Contacted</th>
                      <th className="py-2 pr-4">Interested</th>
                      <th className="py-2 pr-4">Interested rate</th>
                      <th className="py-2 pr-4">Avg / day</th>
                      <th className="py-2 pr-4">Follow-up speed (days)</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-100">
                    {leaderboardRows.map((row) => (
                      <tr
                        key={row.name}
                        className={`border-t border-slate-800 ${
                          row.rank === 1
                            ? "bg-amber-400/10"
                            : row.rank === 2
                            ? "bg-slate-400/10"
                            : row.rank === 3
                            ? "bg-amber-700/10"
                            : ""
                        }`}
                      >
                        <td className="py-2 pr-4 font-medium">
                          {row.badge} {row.rank}
                        </td>
                        <td className="py-2 pr-4">{row.name}</td>
                        <td className="py-2 pr-4">{formatNumber(row.contacted)}</td>
                        <td className="py-2 pr-4">{formatNumber(row.interested)}</td>
                        <td className="py-2 pr-4">{row.interestedRate}%</td>
                        <td className="py-2 pr-4">{row.avgContactedPerDay}</td>
                        <td className="py-2 pr-4">{row.followUpSpeedDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-6">
              <ChartCard title="Agent performance over time">
                <ResponsiveContainer>
                  <LineChart data={stats?.leadsOverTimeByCounselor ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) =>
                        formatDate(value, stats?.timeGranularity)
                      }
                      stroke="#94a3b8"
                    />
                    <YAxis allowDecimals={false} stroke="#94a3b8" />
                    <Tooltip
                      labelFormatter={(value) =>
                        formatDate(value, stats?.timeGranularity)
                      }
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #1f2937",
                      }}
                    />
                    <Legend />
                    {leaderboardRows
                      .map((row) => row.name)
                      .map((name, index) => (
                        <Line
                          key={`agent-line-${name}`}
                          type="monotone"
                          dataKey={name}
                          name={name}
                          stroke={STATUS_COLORS[index % STATUS_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>

            <section className="rounded-2xl bg-slate-900/70 p-5 border border-slate-800">
              <h3 className="text-base font-semibold text-slate-100 mb-4">
                Agents performance
              </h3>
              <div className="overflow-auto">
                <table className="min-w-full text-sm sm:text-xs">
                  <thead className="text-slate-400">
                    <tr className="text-left">
                      <th className="py-2 pr-4">Agent</th>
                      <th className="py-2 pr-4">Total</th>
                      <th className="py-2 pr-4">Interested</th>
                      <th className="py-2 pr-4">Follow-up</th>
                      <th className="py-2 pr-4">No reply</th>
                      <th className="py-2 pr-4">Needs info</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-100">
                    {agentDetails.map((row) => (
                      <tr key={row.name} className="border-t border-slate-800">
                        <td className="py-2 pr-4 font-medium">{row.name}</td>
                        <td className="py-2 pr-4">{row.total}</td>
                        <td className="py-2 pr-4">{row.interested}</td>
                        <td className="py-2 pr-4">{row.followUp}</td>
                        <td className="py-2 pr-4">{row.noReply}</td>
                        <td className="py-2 pr-4">{row.needsMoreInfo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <StatCard
                title="Active destinations"
                value={countryDetails.length}
              />
              <StatCard title="Total leads" value={stats?.totals?.total ?? 0} />
              <StatCard
                title="Top destination"
                value={countryDetails[0]?.name ?? "-"}
              />
            </section>
            <section className="rounded-2xl bg-slate-900/70 p-5 border border-slate-800">
              <h3 className="text-base font-semibold text-slate-100 mb-4">
                Destination performance
              </h3>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-slate-400">
                    <tr className="text-left">
                      <th className="py-2 pr-4">Destination</th>
                      <th className="py-2 pr-4">Total</th>
                      <th className="py-2 pr-4">Interested</th>
                      <th className="py-2 pr-4">Follow-up</th>
                      <th className="py-2 pr-4">No reply</th>
                      <th className="py-2 pr-4">Needs info</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-100">
                    {countryDetails.map((row) => (
                      <tr key={row.name} className="border-t border-slate-800">
                        <td className="py-2 pr-4 font-medium">{row.name}</td>
                        <td className="py-2 pr-4">{row.total}</td>
                        <td className="py-2 pr-4">{row.interested}</td>
                        <td className="py-2 pr-4">{row.followUp}</td>
                        <td className="py-2 pr-4">{row.noReply}</td>
                        <td className="py-2 pr-4">{row.needsMoreInfo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

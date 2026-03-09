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
const API_BASE = import.meta.env.VITE_API_URL || "";
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

const getLeadDate = (lead, dateField) => {
  if (dateField === "lastStateUpdate") return lead.lastStateUpdate || null;
  if (dateField === "timestamp") return lead.timestamp || null;
  return lead.timestamp || lead.lastStateUpdate || null;
};

const getContactDate = (lead) => lead.firstContact || null;
const hasAssignedAgent = (lead) => Boolean(String(lead?.counselor || "").trim());

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

function leadsOverTimePerformance(leads, dateField, granularity, startDate, endDate) {
  const totals = {};
  const contacted = {};
  leads.forEach((lead) => {
    const leadDate = getLeadDate(lead, dateField);
    if (leadDate && inRange(leadDate, startDate, endDate)) {
      const key = granularity === "month" ? monthKey(leadDate) : dayKey(leadDate);
      totals[key] = (totals[key] || 0) + 1;
      if (hasAssignedAgent(lead)) {
        contacted[key] = (contacted[key] || 0) + 1;
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

function pctChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.trunc(((current - previous) / previous) * 100);
}

function countStatusInRange(leads, startDate, endDate, dateField) {
  const filtered = leads.filter((lead) => inRange(getLeadDate(lead, dateField), startDate, endDate));
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
    const category = normalizeStatusCategory(lead.status);
    if (!lead.counselor) counts.notContacted += 1;
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
    contacted: 0,
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
    const leadDate = getLeadDate(lead, dateField);
    if (!leadDate) return;
    if (!inRange(leadDate, startDate, endDate)) return;

    if (!current.has(lead.counselor)) current.set(lead.counselor, initRow());
    const row = current.get(lead.counselor);
    row.contacted += 1;
    if (normalizeStatusCategory(lead.status) === "Interested / Will apply") row.interested += 1;
    const destination = lead.destination || "Unknown";
    row.destinationCounts[destination] = (row.destinationCounts[destination] || 0) + 1;

    const contactDate = getContactDate(lead);
    if (lead.timestamp && contactDate) {
      const days = diffDaysInclusive(startOfDay(lead.timestamp), startOfDay(contactDate)) - 1;
      if (days >= 0) {
        row.responseCount += 1;
        row.responseDaysSum += days;
      }
      if (inRange(contactDate, startDate, endDate) && days >= 0) {
        row.followUpCount += 1;
        row.followUpDaysSum += days;
      }
    }
  });

  if (previousStart && previousEnd) {
    leads.forEach((lead) => {
      if (!hasAssignedAgent(lead)) return;
      const leadDate = getLeadDate(lead, dateField);
      if (!inRange(leadDate, previousStart, previousEnd)) return;

      if (!previous.has(lead.counselor)) previous.set(lead.counselor, initRow());
      const row = previous.get(lead.counselor);
      row.contacted += 1;
      if (normalizeStatusCategory(lead.status) === "Interested / Will apply") row.interested += 1;
      const contactDate = getContactDate(lead);
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
        contacted: row.contacted,
        interested: row.interested,
        interestedRate: row.contacted ? Math.trunc((row.interested / row.contacted) * 100) : 0,
        topCountry,
        followUpSpeedDays: row.followUpCount ? Math.trunc(row.followUpDaysSum / row.followUpCount) : null,
        avgContactedPerDay: lengthDays ? Number((row.contacted / lengthDays).toFixed(2)) : null,
        avgResponseDays,
        responseChangePct,
        contactedChangePct: prev ? pctChange(row.contacted, prev.contacted) : null,
        interestedChangePct: prev ? pctChange(row.interested, prev.interested) : null,
      };
    })
    .sort((a, b) => b.contacted - a.contacted);
}

function uniqueAgents(leads) {
  const set = new Set();
  leads.forEach((lead) => {
    if (lead.counselor) set.add(lead.counselor);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function buildStatsFromLeads(leads, filters) {
  const dateField = filters.dateField || "timestamp";
  const startDate = filters.allTime || !filters.startDate ? null : startOfDay(new Date(filters.startDate));
  const endDate = filters.allTime || !filters.endDate ? null : endOfDay(new Date(filters.endDate));

  const filtered = leads.filter((lead) => {
    if (filters.counselor && lead.counselor !== filters.counselor) return false;
    if (filters.destination && lead.destination !== filters.destination) return false;
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
  const byCounselor = groupCount(filtered, "counselor", "Not assigned yet");
  const byDestination = groupCount(filtered, "destination");
  const bySource = groupCount(filtered, "source");
  const byFinanceState = groupCount(filtered, "bac");

  const contactedCount = filtered.filter(hasAssignedAgent).length;
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
    totals,
    responseRate,
    responseSpeedDays: speedCount ? Math.trunc(speedTotal / speedCount) : 0,
    comparison: calcPeriodComparison(leads, startDate, endDate, dateField),
    topCountryGrowth: topCountryByGrowth(leads, startDate, endDate, dateField),
    byStatus,
    byCounselor,
    byDestination,
    bySource,
    byFinanceState,
    byCounselorDetails: buildDetails(filtered, "counselor", "Not assigned yet"),
    byDestinationDetails: buildDetails(filtered, "destination", "Unknown"),
    agentLeaderboard: buildAgentLeaderboard(filtered, startDate, endDate, dateField),
    allAgents: uniqueAgents(leads),
    timeGranularity: granularity,
    leadsOverTime: leadsSeries,
    leadsOverTimeInterested,
    leadsOverTimeByDestination: leadsOverTimeByDimension(filtered, dateField, granularity, "destination"),
    leadsOverTimeBySource: leadsOverTimeByDimension(filtered, dateField, granularity, "source"),
    leadsOverTimeBySourceInterested: leadsOverTimeByDimension(
      filtered.filter((lead) => normalizeStatusCategory(lead.status) === "Interested / Will apply"),
      dateField,
      granularity,
      "source"
    ),
    leadsOverTimeByCounselor: leadsOverTimeByDimension(
      filtered.filter(hasAssignedAgent),
      dateField,
      granularity,
      "counselor"
    ),
    leadsOverTimePerformance: leadsOverTimePerformanceSeries,
    overallPerformance: buildOverallPerformance(leadsOverTimePerformanceSeries),
  };
}

export default function App() {
  const [stats, setStats] = useState(null);
  const [allLeads, setAllLeads] = useState([]);
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

  const logout = async () => {
    try {
      if (authToken) {
        await fetch(`${API_BASE}/api/auth/logout`, {
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
      const response = await fetch(`${API_BASE}/api/auth/login`, {
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
      return;
    }

    const fetchLeads = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE}/api/leads`, {
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
    setStats(buildStatsFromLeads(allLeads, filters));
  }, [allLeads, filters]);

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
    filters.destination ? { key: "destination", label: `Country: ${filters.destination}` } : null,
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
  const activeAgentNames = agentDetails
    .map((row) => row.name)
    .filter((name) => name && name !== "Not assigned yet");
  const inactiveAgents = allAgents.filter(
    (name) => name && !activeAgentNames.includes(name)
  );
  const leaderboardRows = useMemo(() => {
    const rows = agentLeaderboard
      .filter((row) => row.name !== "Not assigned yet")
      .sort((a, b) => b.contacted - a.contacted);

    return rows.map((row, index) => ({
      ...row,
      rank: index + 1,
      badge: index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "",
    }));
  }, [agentLeaderboard]);

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
  const topAgent = topByValueExcluding(stats?.byCounselor, "Not assigned yet");

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
  const assignedCount =
    stats?.byCounselor?.reduce(
      (sum, item) => (item.name === "Not assigned yet" ? sum : sum + (item.value || 0)),
      0
    ) ?? 0;
  const topAgentShare = topAgent?.value
    ? `${rateOf(topAgent.value)}%`
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
          (endOfDay(new Date(stats.range.endDate)).getTime() -
            startOfDay(new Date(stats.range.startDate)).getTime()) /
            86400000
        ) + 1
      )
    : 0;

  const prevAvgPerDay = rangeDays
    ? Number((stats?.comparison?.totals?.previous / rangeDays).toFixed(2))
    : 0;
  const avgPctChange = calcPctChange(stats?.avgPerDay ?? 0, prevAvgPerDay);
  const avgComparisonHelper = rangeDays
    ? `${formatPct(avgPctChange)} vs previous period (${prevAvgPerDay})`
    : "";
  const teamActiveAgents = leaderboardRows.length;
  const totalTeamContacted = leaderboardRows.reduce(
    (sum, row) => sum + (row.contacted || 0),
    0
  );
  const totalTeamInterested = leaderboardRows.reduce(
    (sum, row) => sum + (row.interested || 0),
    0
  );
  const teamInterestedRate = totalTeamContacted
    ? ((totalTeamInterested / totalTeamContacted) * 100).toFixed(1)
    : "0.0";
  const avgTeamResponseDaysRaw = leaderboardRows
    .filter((row) => row.avgResponseDays !== null && row.avgResponseDays !== undefined)
    .reduce((sum, row, _, arr) => sum + row.avgResponseDays / arr.length, 0);
  const avgTeamResponseDays = Number.isFinite(avgTeamResponseDaysRaw)
    ? avgTeamResponseDaysRaw.toFixed(1)
    : "0.0";
  const teamCapacityUtilization = totalLeads
    ? ((assignedCount / totalLeads) * 100).toFixed(1)
    : "0.0";
  const teamPerformanceData = leaderboardRows.slice(0, 8).map((row) => ({
    name: row.name,
    contacted: row.contacted,
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
    const dateField = filters.dateField || "timestamp";
    const startDate =
      filters.allTime || !filters.startDate
        ? null
        : startOfDay(new Date(filters.startDate));
    const endDate =
      filters.allTime || !filters.endDate
        ? null
        : endOfDay(new Date(filters.endDate));

    const rows = allLeads
      .filter((lead) => {
        if (filters.counselor && lead.counselor !== filters.counselor) return false;
        if (filters.destination && lead.destination !== filters.destination) return false;
        return inRange(getLeadDate(lead, dateField), startDate, endDate);
      })
      .reduce((acc, lead) => {
        const destinationName = lead.destination || "Unknown";
        if (!acc[destinationName]) {
          acc[destinationName] = {
            name: destinationName,
            total: 0,
            assigned: 0,
            interested: 0,
          };
        }

        acc[destinationName].total += 1;
        if (hasAssignedAgent(lead)) {
          acc[destinationName].assigned += 1;
        }
        if (normalizeStatusCategory(lead.status) === "Interested / Will apply") {
          acc[destinationName].interested += 1;
        }

        return acc;
      }, {});

    return Object.values(rows)
      .map((row) => ({
        ...row,
        notContacted: Math.max(row.total - row.assigned, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [allLeads, filters]);
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
        {/* Move tab navigation above filter section */}
        <div className="relative rounded-2xl border border-slate-800 bg-slate-950 p-1 mb-8 mt-2">
          <div className="no-scrollbar flex w-full items-center gap-2 overflow-x-auto py-2 px-1 sm:px-2 md:flex-wrap md:overflow-visible">
            {[ 
              { key: "general", label: "General KPIs" },
              { key: "team", label: "Team Performance KPIs" },
              { key: "destinations", label: "Destinations KPIs" },
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
                {group.label}
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
              <label className="text-slate-400">Country</label>
              <select
                className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100"
                value={draftFilters.destination}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, destination: event.target.value }))
                }
              >
                <option value="">All countries</option>
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
                  <label className="text-slate-400">Country</label>
                  <select
                    className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100"
                    value={draftFilters.destination}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, destination: event.target.value }))
                    }
                  >
                    <option value="">All countries</option>
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

        {loading ? (
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
                          title="Total interested"
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
                          helper={null}
                          helperTone={null}
                          // ...existing code...
                        >
                          <span className="block text-xs text-slate-400 mt-2">Contacted: {formatNumber(assignedCount)} · Not contacted: {formatNumber(notContactedCount)}</span>
                        </StatCard>
                        <StatCard
                          title="Top source"
                          value={topSource?.name || "-"}
                          helper={topSource ? `${formatNumber(topSource.value)} leads · ${pct(topSource.value)} of all` : ""}
                          helperTone={null}
                        />
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <MiniStat
                          title="Top source"
                          value={topSource?.name || "-"}
                          subtitle={topSource ? `Leads: ${formatNumber(topSource.value)} · Share: ${pct(topSource.value)}` : ""}
                        />
                        <MiniStat
                          title="Top agent"
                          value={topAgent?.name || "-"}
                          subtitle={topAgent ? `Leads: ${formatNumber(topAgent.value)} · Share: ${topAgentShare}` : ""}
                        />
                        <MiniStat
                          title="Interested rate"
                          value={`${leadToInterestedRate}%`}
                          subtitle="Interested out of all leads in selected period"
                        />
                        <MiniStat
                          title="Top country (new growing)"
                          value={topCountryGrowth?.name || "-"}
                          subtitle={
                            topCountryGrowth
                              ? `+${formatNumber(topCountryGrowth.delta)} leads (${formatPct(topCountryGrowth.pctChange)})`
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

                    <ChartCard title="Leads by status">
                      <ResponsiveContainer>
                        <BarChart data={stats?.byStatus ?? []}>
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
                            {(stats?.byStatus ?? []).map((entry, index) => (
                              <Cell
                                key={`general-status-bar-${entry.name}`}
                                fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>

                  <div className="flex flex-col gap-8">
                    <ChartCard title="Potential money trend">
                      <p className="-mt-3 mb-3 text-xs text-slate-400">
                        Combines new leads and interested leads to show potential value.
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
              </section>
            )}

            {activeOverviewGroup === "team" && (
              <section className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    title="Active agents"
                    value={formatNumber(teamActiveAgents)}
                    helper={`${formatNumber(inactiveAgents.length)} inactive in selected period`}
                    helperTone={inactiveAgents.length > 0 ? "negative" : "positive"}
                  />
                  <StatCard
                    title="Coverage rate"
                    value={`${teamCapacityUtilization}%`}
                    helper={`${formatNumber(assignedCount)} contacted of ${formatNumber(totalLeads)} leads`}
                    helperTone={Number(teamCapacityUtilization) >= 85 ? "positive" : "negative"}
                  />
                  <StatCard
                    title="Team interested rate"
                    value={`${teamInterestedRate}%`}
                    helper={`${formatNumber(totalTeamInterested)} interested from ${formatNumber(totalTeamContacted)} contacted`}
                    helperTone={Number(teamInterestedRate) >= 20 ? "positive" : "negative"}
                  />
                  <StatCard
                    title="Avg first response"
                    value={`${avgTeamResponseDays} days`}
                    helper={
                      Number(avgTeamResponseDays) <= 2
                        ? "Fast response benchmark"
                        : "Opportunity to speed up first touch"
                    }
                    helperTone={Number(avgTeamResponseDays) <= 2 ? "positive" : "negative"}
                  />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <ChartCard title="Agent output and quality (top 8)">
                    <ResponsiveContainer>
                      <BarChart data={teamPerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis allowDecimals={false} stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
                        <Legend />
                        <Bar dataKey="contacted" fill="#38BDF8" radius={[6, 6, 0, 0]} name="Contacted" />
                        <Bar dataKey="interested" fill="#22C55E" radius={[6, 6, 0, 0]} name="Interested" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Coverage mix">
                    <ResponsiveContainer>
                      <PieChart>
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }}
                        />
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
                              key={`team-coverage-cell-${entry.name}`}
                              fill={SOURCE_COLORS[index % SOURCE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <ChartCard title="Interested rate benchmark (top 8)">
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

                  <ChartCard title="Avg contacted per day by agent (top 8)">
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
                          <th className="py-2 pr-4">Contacted</th>
                          <th className="py-2 pr-4">Interested</th>
                          <th className="py-2 pr-4">Interested rate</th>
                          <th className="py-2 pr-4">Avg/day</th>
                          <th className="py-2 pr-4">Avg response</th>
                          <th className="py-2 pr-4">Top destination</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-100">
                        {leaderboardRows.slice(0, 12).map((row) => (
                          <tr
                            key={`team-leaderboard-${row.name}`}
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
                            <td className="py-2 pr-4">{row.avgContactedPerDay ?? "-"}</td>
                            <td className="py-2 pr-4">
                              {Number.isFinite(row.avgResponseDays)
                                ? `${row.avgResponseDays}d`
                                : "-"}
                            </td>
                            <td className="py-2 pr-4">{row.topCountry || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
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
                        ? `+${formatNumber(topCountryGrowth.delta)} leads (${formatPct(topCountryGrowth.pctChange)}; ${formatNumber(
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
                </div>

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
                          <th className="py-2 pr-4">Assigned</th>
                          <th className="py-2 pr-4">Interested</th>
                          <th className="py-2 pr-4">Not contacted</th>
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
                            <td className="py-2 pr-4">{formatNumber(row.assigned)}</td>
                            <td className="py-2 pr-4">{formatNumber(row.interested)}</td>
                            <td className="py-2 pr-4">{formatNumber(row.notContacted)}</td>
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
                    {(stats?.byCounselor ?? [])
                      .filter((item) => item.name !== "Not assigned yet")
                      .map((item, index) => (
                        <Line
                          key={`agent-line-${item.name}`}
                          type="monotone"
                          dataKey={item.name}
                          name={item.name}
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
                title="Active countries"
                value={countryDetails.length}
              />
              <StatCard title="Total leads" value={stats?.totals?.total ?? 0} />
              <StatCard
                title="Top country"
                value={countryDetails[0]?.name ?? "-"}
              />
            </section>
            <section className="rounded-2xl bg-slate-900/70 p-5 border border-slate-800">
              <h3 className="text-base font-semibold text-slate-100 mb-4">
                Country performance
              </h3>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-slate-400">
                    <tr className="text-left">
                      <th className="py-2 pr-4">Country</th>
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

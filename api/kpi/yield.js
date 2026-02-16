const { sendJson, normalizeString, normalizeNum } = require("../_util");

function toIsoDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function enumerateDays(fromStr, toStr) {
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];
  const out = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function hashInt(input) {
  const s = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function modeBias(calcMode) {
  return calcMode === "cohort" ? -1 : 0;
}

function max0(value) {
  return value > 0 ? value : 0;
}

function buildDailyCounts(dateKey, advisorId, calcMode) {
  const h = hashInt(`${dateKey}:${advisorId}`);
  const bias = modeBias(calcMode);
  const newInterviews = 2 + (h % 4);
  const proposals = max0(newInterviews - 1 + ((h >> 2) % 2) + bias);
  const recommendations = max0(proposals - ((h >> 4) % 2));
  const interviewsScheduled = max0(recommendations - ((h >> 5) % 2));
  const interviewsHeld = max0(interviewsScheduled - ((h >> 6) % 2));
  const offers = max0(interviewsHeld - 1 - ((h >> 7) % 2));
  const accepts = max0(offers - ((h >> 8) % 2));
  const hires = max0(accepts - ((h >> 9) % 2));
  const revenue = accepts * 120000;
  return {
    newInterviews,
    proposals,
    recommendations,
    interviewsScheduled,
    interviewsHeld,
    offers,
    accepts,
    hires,
    revenue
  };
}

function sumSeries(series) {
  const total = {
    newInterviews: 0,
    proposals: 0,
    recommendations: 0,
    interviewsScheduled: 0,
    interviewsHeld: 0,
    offers: 0,
    accepts: 0,
    hires: 0,
    revenue: 0
  };
  Object.values(series || {}).forEach((row) => {
    Object.keys(total).forEach((key) => {
      total[key] += Number(row?.[key] || 0);
    });
  });
  return total;
}

function aggregateByMonth(series) {
  const out = {};
  Object.entries(series || {}).forEach(([day, counts]) => {
    const month = String(day).slice(0, 7);
    if (!out[month]) out[month] = sumSeries({ [day]: counts });
    else {
      Object.keys(out[month]).forEach((key) => {
        out[month][key] += Number(counts?.[key] || 0);
      });
    }
  });
  return out;
}

module.exports = (req, res) => {
  const from = toIsoDate(normalizeString(req.query?.from)) || "2026-01-01";
  const to = toIsoDate(normalizeString(req.query?.to)) || "2026-01-31";
  const scope = normalizeString(req.query?.scope) || "company";
  const groupBy = normalizeString(req.query?.groupBy) || "none";
  const granularity = normalizeString(req.query?.granularity) || "summary";
  const calcMode = normalizeString(req.query?.calcMode) === "cohort" ? "cohort" : "period";

  const members = [
    { id: 1, name: "管理者 太郎" },
    { id: 30, name: "テスト一般" },
    { id: 2, name: "営業 花子" },
  ];

  const advisorUserId = normalizeNum(req.query?.advisorUserId);
  const filteredMembers = scope === "personal" && advisorUserId
    ? members.filter((m) => m.id === advisorUserId)
    : members;

  const days = enumerateDays(from, to);
  const items = filteredMembers.map((m) => {
    const daySeries = {};
    days.forEach((dateKey) => {
      daySeries[dateKey] = buildDailyCounts(dateKey, m.id, calcMode);
    });
    const series = granularity === "month" ? aggregateByMonth(daySeries) : daySeries;
    return {
      advisorUserId: m.id,
      name: m.name,
      series,
      kpi: sumSeries(daySeries),
    };
  });

  if (groupBy !== "advisor") {
    const first = items[0] || {
      advisorUserId: advisorUserId || null,
      name: "",
      series: {},
      kpi: sumSeries({}),
    };
    return sendJson(res, 200, { items: [first], meta: { calcMode } });
  }

  sendJson(res, 200, { items, meta: { calcMode } });
};

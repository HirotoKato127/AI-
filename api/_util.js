function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildMsKey({ scope, departmentKey, metricKey, periodId, advisorUserId }) {
  return [
    normalizeString(scope),
    normalizeString(departmentKey),
    normalizeString(metricKey),
    normalizeString(periodId),
    String(normalizeNum(advisorUserId) || 0),
  ].join(":");
}

function buildImportantKey({ departmentKey, userId }) {
  return [normalizeString(departmentKey) || "all", String(normalizeNum(userId) || 0)].join(":");
}

async function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

module.exports = {
  sendJson,
  normalizeString,
  normalizeNum,
  buildMsKey,
  buildImportantKey,
  readJsonBody,
};


const { sendJson, readJsonBody, normalizeString, normalizeNum, buildImportantKey } = require("./_util");
const { importantMetrics } = require("./_store");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const departmentKey = normalizeString(req.query?.departmentKey);
    const userId = normalizeNum(req.query?.userId);
    const key = buildImportantKey({ departmentKey, userId });
    const items = importantMetrics.get(key) || [];
    return sendJson(res, 200, { items });
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    const departmentKey = normalizeString(body?.departmentKey);
    const userId = normalizeNum(body?.userId);
    const metricKey = normalizeString(body?.metricKey);
    if (!departmentKey || !userId || !metricKey) {
      return sendJson(res, 400, { error: "departmentKey, userId, metricKey are required" });
    }
    const saved = { departmentKey, userId, metricKey };
    const keyExact = buildImportantKey({ departmentKey, userId });
    importantMetrics.set(keyExact, [saved]);

    const keyDept = buildImportantKey({ departmentKey, userId: 0 });
    const curr = Array.isArray(importantMetrics.get(keyDept)) ? importantMetrics.get(keyDept) : [];
    const next = curr.filter((item) => Number(item?.userId || item?.user_id) !== userId);
    next.push(saved);
    importantMetrics.set(keyDept, next);

    return sendJson(res, 200, { success: true });
  }

  sendJson(res, 405, { error: "Method Not Allowed" });
};


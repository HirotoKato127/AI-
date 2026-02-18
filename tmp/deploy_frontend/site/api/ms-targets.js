const { sendJson, readJsonBody, normalizeString, normalizeNum, buildMsKey } = require("./_util");
const { msTargets } = require("./_store");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const scope = normalizeString(req.query?.scope);
    const departmentKey = normalizeString(req.query?.departmentKey);
    const metricKey = normalizeString(req.query?.metricKey);
    const periodId = normalizeString(req.query?.periodId);
    const advisorUserId = normalizeNum(req.query?.advisorUserId);
    if (!scope || !departmentKey || !metricKey || !periodId) {
      return sendJson(res, 400, { error: "scope, departmentKey, metricKey, periodId are required" });
    }
    const key = buildMsKey({ scope, departmentKey, metricKey, periodId, advisorUserId });
    const stored = msTargets.get(key) || { targetTotal: 0, dailyTargets: {} };
    return sendJson(res, 200, stored);
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    const scope = normalizeString(body?.scope);
    const departmentKey = normalizeString(body?.departmentKey);
    const metricKey = normalizeString(body?.metricKey);
    const periodId = normalizeString(body?.periodId);
    const advisorUserId = normalizeNum(body?.advisorUserId);
    const targetTotal = normalizeNum(body?.targetTotal);
    const dailyTargets = body?.dailyTargets && typeof body.dailyTargets === "object" ? body.dailyTargets : {};
    if (!scope || !departmentKey || !metricKey || !periodId) {
      return sendJson(res, 400, { error: "scope, departmentKey, metricKey, periodId are required" });
    }
    const key = buildMsKey({ scope, departmentKey, metricKey, periodId, advisorUserId });
    msTargets.set(key, { targetTotal, dailyTargets });
    return sendJson(res, 200, { success: true });
  }

  sendJson(res, 405, { error: "Method Not Allowed" });
};


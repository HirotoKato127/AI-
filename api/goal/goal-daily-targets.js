const { sendJson, readJsonBody, normalizeString, normalizeNum } = require("../_util");
const { goalDailyTargets } = require("../_store");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const periodId = normalizeString(req.query?.periodId);
    if (!periodId) return sendJson(res, 400, { error: "periodId is required" });

    const advisorUserIds = normalizeString(req.query?.advisorUserIds);
    if (advisorUserIds) {
      const ids = advisorUserIds
        .split(",")
        .map((v) => normalizeNum(v))
        .filter((v) => v > 0);
      const items = ids.map((id) => ({
        advisorUserId: id,
        dailyTargets: goalDailyTargets.get(`${id}:${periodId}`) || {},
      }));
      return sendJson(res, 200, { items });
    }

    const advisorUserId = normalizeNum(req.query?.advisorUserId);
    if (!advisorUserId) return sendJson(res, 400, { error: "advisorUserId is required" });
    return sendJson(res, 200, { dailyTargets: goalDailyTargets.get(`${advisorUserId}:${periodId}`) || {} });
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    const periodId = normalizeString(body?.periodId);
    const advisorUserId = normalizeNum(body?.advisorUserId);
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!periodId || !advisorUserId) return sendJson(res, 400, { error: "advisorUserId, periodId are required" });

    const current = goalDailyTargets.get(`${advisorUserId}:${periodId}`) || {};
    items.forEach((item) => {
      const date = normalizeString(item?.target_date);
      if (!date) return;
      current[date] = item?.targets && typeof item.targets === "object" ? item.targets : {};
    });
    goalDailyTargets.set(`${advisorUserId}:${periodId}`, current);
    return sendJson(res, 200, { success: true });
  }

  sendJson(res, 405, { error: "Method Not Allowed" });
};


const { sendJson, readJsonBody, normalizeString, normalizeNum } = require("../_util");
const { goalTargetsCompany, goalTargetsPersonal } = require("../_store");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const scope = normalizeString(req.query?.scope);
    const periodId = normalizeString(req.query?.periodId);
    if (!scope || !periodId) return sendJson(res, 400, { error: "scope, periodId are required" });

    if (scope === "company") {
      return sendJson(res, 200, { targets: goalTargetsCompany.get(periodId) || {} });
    }

    if (scope === "personal") {
      const advisorUserIds = normalizeString(req.query?.advisorUserIds);
      if (advisorUserIds) {
        const ids = advisorUserIds
          .split(",")
          .map((v) => normalizeNum(v))
          .filter((v) => v > 0);
        const items = ids.map((id) => ({
          advisorUserId: id,
          targets: goalTargetsPersonal.get(`${id}:${periodId}`) || {},
        }));
        return sendJson(res, 200, { items });
      }

      const advisorUserId = normalizeNum(req.query?.advisorUserId);
      if (!advisorUserId) return sendJson(res, 400, { error: "advisorUserId is required" });
      return sendJson(res, 200, { targets: goalTargetsPersonal.get(`${advisorUserId}:${periodId}`) || {} });
    }

    return sendJson(res, 400, { error: "unknown scope" });
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    const scope = normalizeString(body?.scope);
    const periodId = normalizeString(body?.periodId);
    const targets = body?.targets && typeof body.targets === "object" ? body.targets : {};
    if (!scope || !periodId) return sendJson(res, 400, { error: "scope, periodId are required" });

    if (scope === "company") {
      goalTargetsCompany.set(periodId, targets);
      return sendJson(res, 200, { success: true });
    }

    if (scope === "personal") {
      const advisorUserId = normalizeNum(body?.advisorUserId);
      if (!advisorUserId) return sendJson(res, 400, { error: "advisorUserId is required" });
      goalTargetsPersonal.set(`${advisorUserId}:${periodId}`, targets);
      return sendJson(res, 200, { success: true });
    }

    return sendJson(res, 400, { error: "unknown scope" });
  }

  sendJson(res, 405, { error: "Method Not Allowed" });
};


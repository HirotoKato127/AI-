const { sendJson, readJsonBody, normalizeString } = require("./_util");
const { kpiTargets } = require("./_store");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const period = normalizeString(req.query?.period);
    const data = period ? (kpiTargets.get(period) || {}) : {};
    // Match existing server.js behavior: 200 with {} when missing.
    return sendJson(res, 200, data);
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    const period = normalizeString(body?.period);
    const targets = body?.targets && typeof body.targets === "object" ? body.targets : {};
    if (period) kpiTargets.set(period, targets);
    return sendJson(res, 200, { success: true });
  }

  sendJson(res, 405, { error: "Method Not Allowed" });
};


const { sendJson, readJsonBody, normalizeString } = require("../_util");
const { goalSettingsState } = require("../_store");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    return sendJson(res, 200, goalSettingsState);
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    const nextType = normalizeString(body?.evaluation_rule_type) || "monthly";
    const nextOptions = body?.evaluation_rule_options && typeof body.evaluation_rule_options === "object"
      ? body.evaluation_rule_options
      : {};
    goalSettingsState.evaluation_rule_type = nextType;
    goalSettingsState.evaluation_rule_options = nextOptions;
    return sendJson(res, 200, { success: true, ...goalSettingsState });
  }

  sendJson(res, 405, { error: "Method Not Allowed" });
};


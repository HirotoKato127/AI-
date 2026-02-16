const { sendJson } = require("../../_util");

module.exports = (req, res) => {
  const calcMode = String(req.query?.calcMode || "").toLowerCase() === "cohort" ? "cohort" : "period";
  const bias = calcMode === "cohort" ? -0.08 : 0;
  sendJson(res, 200, {
    meta: { calcMode },
    series: [
      { period: "2026-01", rates: { proposalRate: 0.5 + bias, offerRate: 0.1 + bias / 2 } },
      { period: "2026-02", rates: { proposalRate: 0.6 + bias, offerRate: 0.2 + bias / 2 } },
    ],
  });
};

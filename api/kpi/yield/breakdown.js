const { sendJson } = require("../../_util");

module.exports = (req, res) => {
  const calcMode = String(req.query?.calcMode || "").toLowerCase() === "cohort" ? "cohort" : "period";
  const delta = calcMode === "cohort" ? -2 : 0;
  sendJson(res, 200, {
    meta: { calcMode },
    items: [
      { label: "Channel A", count: 10 + delta },
      { label: "Channel B", count: 5 + delta },
    ],
  });
};

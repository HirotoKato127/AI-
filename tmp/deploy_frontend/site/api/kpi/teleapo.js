const { sendJson } = require("../_util");

module.exports = (_req, res) => {
  sendJson(res, 200, { rows: [] });
};


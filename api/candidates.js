const { sendJson } = require("./_util");

// Minimal mock for marketing integration in yield.js.
module.exports = (_req, res) => {
  sendJson(res, 200, { items: [] });
};


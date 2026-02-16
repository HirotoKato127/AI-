const { sendJson } = require("./_util");

module.exports = (_req, res) => {
  sendJson(res, 200, [
    { id: 1, name: "管理者 太郎", email: "admin@example.com", role: "admin", is_admin: true },
    { id: 30, name: "テスト一般", email: "test@example.com", role: "member", is_admin: false },
    { id: 2, name: "営業 花子", email: "sales@example.com", role: "advisor", is_admin: false },
  ]);
};


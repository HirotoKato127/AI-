var __glob = (map) => (path) => {
  var fn = map[path];
  if (fn) return fn();
  throw new Error("Module not found in bundle: " + path);
};

// scripts/module-versions.js
var MODULE_VERSIONS = Object.freeze({
  candidates: "20260212_04",
  candidateDetail: "20260211_03"
});

// import("../candidates/candidates.js?v=*") in pages/candidate-detail/candidate-detail.js
var globImport_candidates_candidates_js_v = __glob({});

// pages/candidate-detail/candidate-detail.js
var candidatesDetailApi = null;
async function loadCandidatesDetailApi() {
  if (candidatesDetailApi) return candidatesDetailApi;
  candidatesDetailApi = await globImport_candidates_candidates_js_v(`../candidates/candidates.js?v=${MODULE_VERSIONS.candidates}`);
  return candidatesDetailApi;
}
console.log("candidate-detail.js loaded");
function getCandidateIdFromUrl() {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) return null;
  const queryString = hash.substring(queryIndex + 1);
  const params = new URLSearchParams(queryString);
  return params.get("id") || params.get("candidateId");
}
function handleBack() {
  if ((candidatesDetailApi == null ? void 0 : candidatesDetailApi.confirmCandidateDetailClose) && !candidatesDetailApi.confirmCandidateDetailClose()) return;
  window.location.hash = "#/candidates";
}
function setupEventListeners() {
  const backBtn = document.getElementById("cdBackBtn");
  if (backBtn) {
    backBtn.addEventListener("click", handleBack);
  }
}
async function mount() {
  console.log("candidate-detail mounting...");
  const candidateId = getCandidateIdFromUrl();
  if (!candidateId) {
    console.warn("\u5019\u88DC\u8005ID\u304C\u6307\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
    handleBack();
    return;
  }
  setupEventListeners();
  const detailApi = await loadCandidatesDetailApi();
  const success = await detailApi.mountDetailPage(candidateId);
  if (!success) {
    console.error("\u5019\u88DC\u8005\u8A73\u7D30\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
  }
  console.log("candidate-detail mounted");
}
function unmount() {
  console.log("candidate-detail unmounting...");
  const backBtn = document.getElementById("cdBackBtn");
  if (backBtn) {
    backBtn.removeEventListener("click", handleBack);
  }
  if (candidatesDetailApi == null ? void 0 : candidatesDetailApi.unmountDetailPage) {
    candidatesDetailApi.unmountDetailPage();
  }
}
export {
  mount,
  unmount
};

const DEFAULT_PRIMARY_API_BASE = "https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod";

function normalizeBaseUrl(value, fallback = "") {
  const text = String(value || "").trim();
  const base = text || fallback;
  return String(base || "").replace(/\/+$/, "");
}

function resolveApiBase({
  windowKey = "",
  storageKey = "",
  defaultBase = "",
} = {}) {
  if (typeof window === "undefined") {
    return normalizeBaseUrl(defaultBase);
  }

  const fromWindow = windowKey ? window[windowKey] : "";
  let fromStorage = "";
  if (storageKey) {
    try {
      fromStorage = localStorage.getItem(storageKey) || "";
    } catch {
      fromStorage = "";
    }
  }

  return normalizeBaseUrl(fromWindow || fromStorage, defaultBase);
}

export const PRIMARY_API_BASE = resolveApiBase({
  windowKey: "APP_API_BASE",
  storageKey: "dashboard.apiBase",
  defaultBase: DEFAULT_PRIMARY_API_BASE,
});


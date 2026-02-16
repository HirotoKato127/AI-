/**
 * Client-side router for dashboard application
 * Handles navigation between pages using ES modules
 */

import { getSession, hasRole, onAuthChange } from './auth.js';
import { authRepo } from './api/repositories/auth.js?v=20260120_2';

const POST_LOGIN_REDIRECT_KEY = 'dashboard.postLoginRedirect';

const routes = {
  login: () => import("../pages/login/login.js"),
  mypage: () => import("../pages/mypage/mypage.js?v=20260206_01"),
  members: () => import("../pages/members/members.js"),
  yield: () => import("../pages/yield/yield.js?v=20260206_02"),
  "yield-personal": () => import("../pages/yield-personal/yield-personal.js?v=20260203_01"),
  "yield-company": () => import("../pages/yield-company/yield-company.js?v=20260203_01"),
  "yield-admin": () => import("../pages/yield-admin/yield-admin.js?v=20260203_01"),
  candidates: () => import("../pages/candidates/candidates.js?v=20260322_10"),
  "candidate-detail": () => import("../pages/candidate-detail/candidate-detail.js?v=20260322_10"),
  "ad-performance": () => import("../pages/ad-performance/ad-performance.js?v=20260322_14"),
  teleapo: () => import("../pages/teleapo/teleapo.js?v=20260209_1"),
  referral: () => import("../pages/referral/referral.js?v=20260322_60"),
  settings: () => import("../pages/settings/settings.js?v=20260322_01"),
  "goal-settings": () => import("../pages/goal-settings/goal-settings.js"),
  "kpi-summery-test": () => import("../pages/kpi-summery-test/kpi-summery-test.js"),
};

const routeMeta = {
  login: { public: true },
  mypage: { roles: ['admin', 'member'] },
  yield: { roles: ['admin', 'member'] },
  "yield-personal": { roles: ['admin', 'member'] },
  "yield-company": { roles: ['admin', 'member'] },
  "yield-admin": { roles: ['admin'] },
  candidates: { roles: ['admin', 'member'] },
  "candidate-detail": { roles: ['admin', 'member'] },
  'ad-performance': { roles: ['admin', 'member'] },
  teleapo: { roles: ['admin', 'member'] },
  referral: { roles: ['admin', 'member'] },
  settings: { roles: ['admin', 'member'] },
  members: { roles: ['admin', 'member'] },
  'goal-settings': { roles: ['admin', 'member'] },
  'kpi-summery-test': { roles: ['admin', 'member'] }
};

// CSS files for specific pages
const pageCSS = {
  yield: "pages/yield/yield.css?v=20260205_140149",
  "yield-personal": "pages/yield/yield.css?v=20260205_140149",
  "yield-company": "pages/yield/yield.css?v=20260205_140149",
  "yield-admin": "pages/yield/yield.css?v=20260205_140149",
  mypage: "pages/mypage/mypage.css?v=20260202_02",
  candidates: "pages/candidates/candidates.css?v=20260322_57",
  "candidate-detail": "pages/candidate-detail/candidate-detail.css?v=20260322_02",
  "ad-performance": "pages/ad-performance/ad-performance.css?v=20260133",
  teleapo: "pages/teleapo/teleapo.css?v=20260322_2",
  referral: "pages/referral/referral.css?v=20260322_49",
  settings: "pages/settings/settings.css?v=20260322_01",
  "goal-settings": "pages/goal-settings/goal-settings.css?v=20260127",
  members: "pages/members/members.css",
  "kpi-summery-test": "pages/kpi-summery-test/kpi-summery-test.css",
  login: null, // Uses global styles
};

const PAGE_HTML_VERSION = "20260213_01";
const ROUTE_LOADING_OVERLAY_ID = "routeLoadingOverlay";
const MOUNT_BLOCKING_TIMEOUT_MS = 1200;
const ROUTE_LOADING_DELAY_MS = 120;
const ROUTE_LOADING_MAX_MS = 15000;
const ROUTE_FETCH_TIMEOUT_MS = 15000;

let current = null;
let activePageCSSLink = null;
let activePageCSSPage = null;
const BADGE_SELECTORS = ["#sidebarUserBadgeSlot"];
const BADGE_SELECTOR = "[data-user-badge]";
const PAGE_TITLE_SELECTOR = "#pageTitle";
let unsubscribeBadge = null;
let navigationToken = 0;
let activeNavigationToken = 0;
let activeNavigationAbortController = null;
let routeLoadingDelayTimer = null;
let routeLoadingMaxTimer = null;
let routeLoadingPendingCount = 0;

function resolveAsset(path) {
  return new URL(path, import.meta.url).href;
}

function ensureRouteLoadingOverlay() {
  const overlays = Array.from(document.querySelectorAll(`#${ROUTE_LOADING_OVERLAY_ID}`));
  let overlay = overlays[0] || null;
  if (overlays.length > 1) {
    overlays.slice(1).forEach((node) => node.remove());
  }
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = ROUTE_LOADING_OVERLAY_ID;
  overlay.dataset.routeLoadingOverlay = "true";
  overlay.setAttribute("aria-live", "polite");
  overlay.style.cssText = [
    "position: fixed",
    "inset: 0",
    "z-index: 9999",
    "display: flex",
    "align-items: center",
    "justify-content: center",
    "background: rgba(248, 250, 252, 0.6)",
    "backdrop-filter: blur(1px)",
    "font-size: 13px",
    "font-weight: 600",
    "color: #1e293b",
    "letter-spacing: 0.02em"
  ].join("; ");
  overlay.innerHTML = `<div style="padding: 10px 14px; border-radius: 10px; background: #ffffff; border: 1px solid #e2e8f0; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);">読み込み中...</div>`;
  overlay.hidden = true;
  overlay.style.display = "none";
  document.body.appendChild(overlay);
  return overlay;
}

function setRouteLoadingState(isLoading) {
  const overlay = ensureRouteLoadingOverlay();
  if (isLoading) {
    routeLoadingPendingCount += 1;
    if (routeLoadingPendingCount > 1) return;

    // ナビゲーションが短時間で終わる場合はオーバーレイ表示を遅延させる
    routeLoadingDelayTimer = setTimeout(() => {
      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");
      overlay.style.display = "flex";
    }, ROUTE_LOADING_DELAY_MS);

    // 万が一読み込みが完了しない場合でも、表示貼り付きを防ぐ
    routeLoadingMaxTimer = setTimeout(() => {
      console.warn("[router] loading overlay timeout reached, forcing hide");
      routeLoadingPendingCount = 0;
      if (routeLoadingDelayTimer) {
        clearTimeout(routeLoadingDelayTimer);
        routeLoadingDelayTimer = null;
      }
      routeLoadingMaxTimer = null;
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.display = "none";
    }, ROUTE_LOADING_MAX_MS);
    return;
  }

  if (routeLoadingPendingCount > 0) {
    routeLoadingPendingCount -= 1;
  }
  if (routeLoadingPendingCount > 0) return;

  if (routeLoadingDelayTimer) {
    clearTimeout(routeLoadingDelayTimer);
    routeLoadingDelayTimer = null;
  }
  if (routeLoadingMaxTimer) {
    clearTimeout(routeLoadingMaxTimer);
    routeLoadingMaxTimer = null;
  }
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.display = "none";
}

function waitForStylesheet(link, page) {
  return new Promise((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      link.removeEventListener("load", onLoad);
      link.removeEventListener("error", onError);
    };
    const finish = (handler) => {
      if (done) return;
      done = true;
      cleanup();
      handler();
    };
    const onLoad = () => {
      finish(() => resolve(link));
    };
    const onError = () => {
      finish(() => reject(new Error(`Failed to load CSS for ${page}`)));
    };

    link.addEventListener("load", onLoad);
    link.addEventListener("error", onError);

    // If already loaded from cache before listeners attached.
    if (link.sheet) {
      finish(() => resolve(link));
    }
  });
}

async function preparePageCSS(page) {
  const cssPath = pageCSS[page];
  if (!cssPath) return null;

  if (activePageCSSPage === page && activePageCSSLink?.isConnected) {
    return activePageCSSLink;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = resolveAsset(`../${cssPath}`);
  link.setAttribute("data-page-css", page);
  document.head.appendChild(link);
  try {
    await waitForStylesheet(link, page);
  } catch (error) {
    if (link.isConnected) link.remove();
    throw error;
  }
  return link;
}

function discardPreparedPageCSS(link) {
  if (!link) return;
  if (link === activePageCSSLink) return;
  if (link.isConnected) link.remove();
}

function cleanupPageCSSLinks(keepLink = null) {
  const links = document.querySelectorAll('link[data-page-css], link[data-page-c-s-s]');
  links.forEach((link) => {
    if (keepLink && link === keepLink) return;
    link.remove();
  });
}

function commitPageCSS(page, nextLink) {
  if (!pageCSS[page]) {
    cleanupPageCSSLinks();
    activePageCSSLink = null;
    activePageCSSPage = null;
    return;
  }

  if (!nextLink) return;
  if (nextLink === activePageCSSLink) {
    cleanupPageCSSLinks(nextLink);
    return;
  }

  cleanupPageCSSLinks(nextLink);
  activePageCSSLink = nextLink;
  activePageCSSPage = page;
}

function buildPageHtmlUrl(page) {
  const htmlUrl = new URL(resolveAsset(`../pages/${page}/index.html`));
  htmlUrl.searchParams.set("v", PAGE_HTML_VERSION);
  return htmlUrl.toString();
}

async function fetchPageHtml(page, signal) {
  const response = await fetch(buildPageHtmlUrl(page), { cache: "no-cache", signal });
  if (!response.ok) {
    throw new Error(`Failed to load ${page} page (${response.status})`);
  }
  return response.text();
}

function sanitizePageHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll('link[rel="stylesheet"]').forEach((link) => link.remove());
  return template.innerHTML;
}

async function mountPageModule(mod, app, page) {
  if (!mod?.mount) return;
  let guardedMountPromise;
  try {
    guardedMountPromise = Promise.resolve(mod.mount(app)).catch((error) => {
      // Keep rendering instead of forcing login. Page modules handle their own error UIs.
      console.error(`[router] mount error on ${page}:`, error);
    });
  } catch (error) {
    console.error(`[router] mount error on ${page}:`, error);
    return;
  }

  await Promise.race([
    guardedMountPromise,
    new Promise((resolve) => setTimeout(resolve, MOUNT_BLOCKING_TIMEOUT_MS))
  ]);
}

/**
 * ナビゲーション前のルーターガード
 * - 未ログイン時の保護ルートアクセス → loginへ
 * - ロール不許可のルートアクセス → yieldへ
 * @param {string} page
 * @returns {string} 実際に遷移すべきページID
 */
export function beforeNavigate(page) {
  if (page === "yield") return "yield-personal";
  const session = getSession();
  const meta = routeMeta[page];

  // 未ログインかつ保護ルートの場合は login へ誘導
  if (!meta?.public && !session) {
    if (page !== "login") {
      try {
        sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, page);
      } catch {
        // sessionStorage が使えない環境では単にloginへ遷移
      }
      return "login";
    }
  }

  // ロール不許可の場合は yield へフォールバック
  if (meta?.roles && !hasRole(meta.roles)) {
    return "yield";
  }

  return page;
}

/**
 * ログイン前にアクセスしようとしていた保護ルートを取得して破棄する
 * @returns {string|null}
 */
export function consumePostLoginRedirect() {
  try {
    const page = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    if (!page) return null;
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    return page;
  } catch {
    return null;
  }
}

export async function navigate(to) {
  const app = document.getElementById("app");
  if (!app) return;
  const navToken = ++navigationToken;
  activeNavigationToken = navToken;

  if (activeNavigationAbortController) {
    activeNavigationAbortController.abort();
  }
  const abortController = new AbortController();
  activeNavigationAbortController = abortController;
  setRouteLoadingState(true);
  const routeFetchTimeoutId = setTimeout(() => {
    abortController.abort();
  }, ROUTE_FETCH_TIMEOUT_MS);

  let page = "login";
  let preparedPageCSSLink = null;

  try {
    // ハッシュからクエリパラメータを分離
    const hashPart = location.hash.replace(/^#\/?/, "");
    const [pathPart, hashQueryRaw] = hashPart.split("?");
    const hashQuery = hashQueryRaw ? `?${hashQueryRaw}` : "";
    const segments = pathPart.split("/").filter(Boolean);
    const toValue = to ? String(to) : "";
    const [toPath, toQueryRaw] = toValue.split("?");
    const rawPage = toPath || segments[0] || "candidates";
    const toQuery = toQueryRaw ? `?${toQueryRaw}` : "";

    // ルーターガード（beforeNavigate）で実際に表示すべきページを決定
    const guardedPage = beforeNavigate(rawPage);

    if (guardedPage !== rawPage) {
      // ハッシュを書き換えて早期リターン（実際の描画は次のnavigate呼び出しで行う）
      location.hash = `#/${guardedPage}`;
      return;
    }

    page = guardedPage;
    const queryPart = guardedPage === rawPage ? (toQuery || (rawPage === segments[0] ? hashQuery : "")) : "";
    const pageLoader = routes[page] ?? routes["login"];

    const pendingCss = preparePageCSS(page);
    let nextCssLink;
    let html;
    let mod;

    try {
      [nextCssLink, html, mod] = await Promise.all([
        pendingCss,
        fetchPageHtml(page, abortController.signal),
        pageLoader()
      ]);
    } catch (error) {
      const orphanCssLink = await Promise.resolve(pendingCss).catch(() => null);
      discardPreparedPageCSS(orphanCssLink);
      throw error;
    }
    preparedPageCSSLink = nextCssLink;

    if (navToken !== activeNavigationToken) {
      discardPreparedPageCSS(preparedPageCSSLink);
      return;
    }

    // Unmount current page only after next page resources are ready.
    if (current?.unmount) {
      try {
        current.unmount();
      } catch (error) {
        console.warn("Error unmounting page:", error);
      }
    }

    commitPageCSS(page, preparedPageCSSLink);
    app.innerHTML = sanitizePageHtml(html);
    app.dataset.page = page;

    // Load and mount page module
    current = mod;
    await mountPageModule(mod, app, page);
    updatePageTitle(page);

    // Update URL
    history.replaceState({}, "", `#/${page}${queryPart}`);

    // Update navigation state
    updateNavigation(page);
    ensureUserBadge();
  } catch (error) {
    if (error?.name === "AbortError") return;

    console.error("Navigation error:", error);
    discardPreparedPageCSS(preparedPageCSSLink);

    // If initial navigation fails, fallback to login.
    if (!current && page !== "login") {
      navigate("login");
    }
  } finally {
    clearTimeout(routeFetchTimeoutId);
    if (activeNavigationAbortController === abortController) {
      activeNavigationAbortController = null;
    }
    setRouteLoadingState(false);
  }
}

function updateNavigation(page) {
  const session = getSession();

  document.querySelectorAll("[data-target]").forEach((button) => {
    const target = button.dataset.target;
    const isActive = target === page;

    // Show/hide based on role permissions
    const meta = routeMeta[target];
    if (target === "yield-admin") {
      button.hidden = !session || session.role !== "admin";
    } else if (meta?.roles) {
      button.hidden = !session || !hasRole(meta.roles);
    } else {
      button.hidden = false;
    }
    const item = button.closest("li");
    if (item) item.hidden = button.hidden;

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");

    // Keep the nav dot in sync with the active page
    const dot = button.querySelector(".nav-dot");
    if (dot) {
      dot.classList.toggle("bg-indigo-400", isActive);
      dot.classList.toggle("bg-slate-500", !isActive);
    }
  });

  const yieldGroup = document.querySelector('[data-nav-group="yield"]');
  if (yieldGroup) {
    const isYieldPage = ["yield-personal", "yield-company", "yield-admin"].includes(page);
    yieldGroup.classList.toggle("is-open", isYieldPage);
    const toggle = yieldGroup.querySelector("[data-submenu-toggle]");
    if (toggle) {
      toggle.classList.toggle("is-active", isYieldPage);
      toggle.setAttribute("aria-expanded", isYieldPage ? "true" : "false");
    }
    const hasVisibleChild = Array.from(yieldGroup.querySelectorAll("[data-target]")).some(
      (button) => !button.hidden
    );
    yieldGroup.hidden = !session || !hasVisibleChild;
  }

  const settingsGroup = document.querySelector('[data-nav-group="settings"]');
  if (settingsGroup) {
    const isSettingsPage = ["settings", "goal-settings", "members"].includes(page);
    settingsGroup.classList.toggle("is-open", isSettingsPage);
    const toggle = settingsGroup.querySelector("[data-submenu-toggle]");
    if (toggle) {
      toggle.classList.toggle("is-active", isSettingsPage);
      toggle.setAttribute("aria-expanded", isSettingsPage ? "true" : "false");
    }
    const hasVisibleChild = Array.from(settingsGroup.querySelectorAll("[data-target]")).some(
      (button) => !button.hidden
    );
    settingsGroup.hidden = !session || !hasVisibleChild;
  }
}

function updatePageTitle(page) {
  const titleEl = document.querySelector(PAGE_TITLE_SELECTOR);
  if (!titleEl) return;

  const navLabel = document.querySelector(`[data-target="${page}"] .nav-label`);
  const navText = navLabel?.textContent?.trim();
  if (navText) {
    titleEl.textContent = navText;
    return;
  }

  const pageTitle = document.querySelector("[data-page-title]")?.textContent?.trim();
  if (pageTitle) {
    titleEl.textContent = pageTitle;
    return;
  }

  const heading = document.querySelector("#app h1, #app h2, #app h3");
  const headingText = heading?.textContent?.trim();
  if (headingText) {
    titleEl.textContent = headingText;
    return;
  }

  titleEl.textContent = page.replace(/-/g, " ");
}

function setupSidebarToggle() {
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = sidebar?.querySelector("#sidebarToggle");
  if (!sidebar || !toggleBtn) return;

  const updateToggleLabel = () => {
    const collapsed = sidebar.classList.contains("sidebar-collapsed");
    const iconSvg = collapsed
      ? `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5" /></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="m18.75 4.5-7.5 7.5 7.5 7.5m-6-15L5.25 12l7.5 7.5" /></svg>`;

    toggleBtn.innerHTML = iconSvg;
    toggleBtn.setAttribute(
      "aria-label",
      collapsed ? "サイドバーを展開" : "サイドバーを折りたたみ"
    );
  };

  toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("sidebar-collapsed");
    updateToggleLabel();
  });

  updateToggleLabel();
}

export function boot() {
  // Initial navigation
  addEventListener("DOMContentLoaded", async () => {
    // サーバー上のセッションからローカルセッションを復元
    await authRepo.me();
    await navigate();
    setupSidebarToggle();
  });

  // Handle hash changes
  addEventListener("hashchange", () => navigate());

  // Handle auth changes
  addEventListener("auth:change", () => {
    navigate(location.hash.replace("#/", "") || "yield");
  });

  // Handle navigation clicks
  document.addEventListener("click", (event) => {
    const submenuToggle = event.target.closest("[data-submenu-toggle]");
    if (submenuToggle) {
      event.preventDefault();
      const key = submenuToggle.dataset.submenuToggle;
      const group = document.querySelector(`[data-nav-group=\"${key}\"]`);
      if (group) {
        const next = !group.classList.contains("is-open");
        group.classList.toggle("is-open", next);
        submenuToggle.setAttribute("aria-expanded", next ? "true" : "false");
      }
      return;
    }
    const target = event.target.closest("[data-target]");
    if (target) {
      event.preventDefault();
      navigate(target.dataset.target);
    }

    // Handle logout clicks
    const logoutButton = event.target.closest("[data-action=\"logout\"]");
    if (logoutButton) {
      event.preventDefault();
      authRepo.logout();
      location.hash = "#/login";
    }
  });
}

function ensureUserBadge() {
  renderUserBadge();
  if (!unsubscribeBadge) {
    unsubscribeBadge = onAuthChange(() => renderUserBadge());
  }
}

function renderUserBadge() {
  const container = BADGE_SELECTORS.map((selector) =>
    document.querySelector(selector)
  ).find(Boolean);
  if (!container) return;

  let badge = document.querySelector(BADGE_SELECTOR);
  if (!badge) {
    badge = document.createElement("div");
    badge.dataset.userBadge = "true";
    badge.className = "sidebar-user-chip";
    badge.innerHTML = `
      <div class="sidebar-user-avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 18.5a6.5 6.5 0 0 1 13 0v.5h-13v-.5z" />
        </svg>
      </div>
      <div class="sidebar-user-text">
        <span class="sidebar-user-name user-badge-chip__text"></span>
      </div>
    `;
    badge.addEventListener("click", handleBadgeActivate);
    badge.addEventListener("keydown", handleBadgeActivate);
  }

  if (badge.parentElement !== container) {
    container.appendChild(badge);
  }

  updateUserBadgeText(badge);
}

function handleBadgeActivate(event) {
  const isKey = event.type === "keydown";
  if (isKey && event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const badge = event.currentTarget;
  if (!badge) return;
  if (badge.dataset.badgeAction === "login") {
    event.preventDefault();
    location.hash = "#/login";
  }
}

function updateUserBadgeText(badge) {
  const textEl = badge.querySelector(".user-badge-chip__text");
  if (!textEl) return;
  const session = getSession();

  if (session) {
    const name = session.user?.name || session.user?.email || "";
    const roleLabel = session.role === "admin"
      ? "管理者"
      : session.role === "member"
        ? "一般"
        : (session.role || "");
    textEl.textContent = roleLabel ? `${name} / ${roleLabel}` : name;
    badge.dataset.badgeAction = "";
    badge.removeAttribute("role");
    badge.removeAttribute("tabindex");
    badge.removeAttribute("aria-label");
  } else {
    textEl.textContent = "未ログイン";
    badge.dataset.badgeAction = "login";
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
    badge.setAttribute("aria-label", "ログインページへ移動");
  }
}

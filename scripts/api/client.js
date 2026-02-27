/**
 * APIクライアントベースクラス
 * リポジトリパターンの基盤となるHTTPクライアント
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success - 成功フラグ
 * @property {any} data - レスポンスデータ
 * @property {string} [error] - エラーメッセージ
 * @property {number} [status] - HTTPステータスコード
 */

/**
 * @typedef {Object} ApiRequestOptions
 * @property {string} [method] - HTTPメソッド
 * @property {Object} [headers] - リクエストヘッダー
 * @property {any} [body] - リクエストボディ
 * @property {number} [timeout] - タイムアウト（ミリ秒）
 * @property {boolean} [validateResponse] - レスポンス検証フラグ
 */

export class ApiClient {
  constructor(baseUrl = '', options = {}) {
    // APIサーバーのベースURL（例: http://localhost:3000）
    this.baseUrl = (baseUrl || 'http://localhost:3000').replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    this.timeout = options.timeout || 10000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  /**
   * HTTPリクエストを実行
   * @param {string} endpoint 
   * @param {ApiRequestOptions} options 
   * @returns {Promise<ApiResponse>}
   */
  async request(endpoint, options = {}) {
    const url = this.buildUrl(endpoint);
    const config = this.buildRequestConfig(options);

    let lastError = null;

    // リトライ機能付きリクエスト実行
    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await this.executeRequest(url, config);
        return await this.handleResponse(response, options.validateResponse);
      } catch (error) {
        lastError = error;

        if (attempt < this.retryAttempts && this.shouldRetry(error)) {
          await this.delay(this.retryDelay * (attempt + 1));
          continue;
        }
        break;
      }
    }

    return this.createErrorResponse(lastError);
  }

  /**
   * GETリクエスト
   * @param {string} endpoint 
   * @param {ApiRequestOptions} options 
   * @returns {Promise<ApiResponse>}
   */
  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POSTリクエスト
   * @param {string} endpoint 
   * @param {any} data 
   * @param {ApiRequestOptions} options 
   * @returns {Promise<ApiResponse>}
   */
  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: data
    });
  }

  /**
   * PUTリクエスト
   * @param {string} endpoint 
   * @param {any} data 
   * @param {ApiRequestOptions} options 
   * @returns {Promise<ApiResponse>}
   */
  async put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: data
    });
  }

  /**
   * DELETEリクエスト
   * @param {string} endpoint 
   * @param {ApiRequestOptions} options 
   * @returns {Promise<ApiResponse>}
   */
  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * URLを構築
   * @param {string} endpoint 
   * @returns {string}
   */
  buildUrl(endpoint) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    return this.baseUrl ? `${this.baseUrl}/${cleanEndpoint}` : cleanEndpoint;
  }

  /**
   * リクエスト設定を構築
   * @param {ApiRequestOptions} options 
   * @returns {RequestInit}
   */
  buildRequestConfig(options) {
    const config = {
      method: options.method || 'GET',
      headers: { ...this.defaultHeaders, ...options.headers },
      credentials: 'include'
    };

    if (options.body && config.method !== 'GET') {
      config.body = typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body);
    }

    return config;
  }

  /**
   * リクエストを実行（タイムアウト付き）
   * @param {string} url 
   * @param {RequestInit} config 
   * @returns {Promise<Response>}
   */
  async executeRequest(url, config) {
    const timeoutId = setTimeout(() => {
      throw new Error(`Request timeout after ${this.timeout}ms`);
    }, this.timeout);

    try {
      const response = await fetch(url, config);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * レスポンスを処理
   * @param {Response} response 
   * @param {boolean} validateResponse 
   * @returns {Promise<ApiResponse>}
   */
  async handleResponse(response, validateResponse = false) {
    if (!response.ok) {
      const httpError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      httpError.status = response.status;
      throw httpError;
    }

    const data = await response.json();

    if (validateResponse && !this.isValidResponse(data)) {
      throw new Error('Invalid response format');
    }

    return {
      success: true,
      data: data.data || data,
      status: response.status
    };
  }

  /**
   * エラーレスポンスを作成
   * @param {Error} error 
   * @returns {ApiResponse}
   */
  createErrorResponse(error) {
    const message = this.getErrorMessage(error);
    const status = this.getErrorStatus(error);

    // ネットワークエラーの場合、ユーザーにトースト通知を表示
    if (this.isOfflineError(error)) {
      showToast('ネットワークに接続できません。インターネット接続を確認してください。', 'error');
    } else if (this.isTimeoutError(error)) {
      showToast('サーバーからの応答がありません。しばらくしてから再試行してください。', 'warning');
    } else if (status >= 500) {
      showToast('サーバーエラーが発生しました。しばらくしてから再試行してください。', 'error');
    }

    return {
      success: false,
      data: null,
      error: message,
      status: status || 500
    };
  }

  /**
   * リトライすべきエラーかチェック
   * @param {Error} error 
   * @returns {boolean}
   */
  shouldRetry(error) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // オフライン中は待っても成功しないため即時失敗にする
      return false;
    }

    const status = this.getErrorStatus(error);

    // ネットワークエラーやサーバーエラーの場合はリトライ
    return this.isTimeoutError(error) ||
      this.isOfflineError(error) ||
      (status >= 500 && status < 600);
  }

  /**
   * エラーメッセージを安全に取得
   * @param {unknown} error
   * @returns {string}
   */
  getErrorMessage(error) {
    if (error instanceof Error) return error.message || 'Unknown error';
    if (typeof error === 'string') return error;
    return 'Unknown error';
  }

  /**
   * HTTPステータスを安全に取得
   * @param {unknown} error
   * @returns {number}
   */
  getErrorStatus(error) {
    const maybeStatus = error && typeof error === 'object' ? error.status : undefined;
    return typeof maybeStatus === 'number' ? maybeStatus : 0;
  }

  /**
   * タイムアウトエラー判定
   * @param {unknown} error
   * @returns {boolean}
   */
  isTimeoutError(error) {
    return /timeout/i.test(this.getErrorMessage(error));
  }

  /**
   * オフライン/ネットワーク断エラー判定（ブラウザ差分を吸収）
   * @param {unknown} error
   * @returns {boolean}
   */
  isOfflineError(error) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return true;
    }

    const message = this.getErrorMessage(error).toLowerCase();
    return error instanceof TypeError && (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('load failed')
    );
  }

  /**
   * レスポンス形式の検証
   * @param {any} data 
   * @returns {boolean}
   */
  isValidResponse(data) {
    return data && typeof data === 'object';
  }

  /**
   * 遅延処理
   * @param {number} ms 
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// デフォルトのAPIクライアントインスタンス
export const defaultApiClient = new ApiClient('', {
  timeout: 10000,
  retryAttempts: 3,
  retryDelay: 1000
});

// ───────────────────────────────────────────
// グローバルトースト通知
// ───────────────────────────────────────────

const TOAST_COLORS = {
  error: { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', icon: '⚠️' },
  warning: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', icon: '⏳' },
  info: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af', icon: 'ℹ️' },
};

let toastContainer = null;

function ensureToastContainer() {
  if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.id = 'global-toast-container';
  Object.assign(toastContainer.style, {
    position: 'fixed', bottom: '1.5rem', right: '1.5rem',
    zIndex: '9999', display: 'flex', flexDirection: 'column',
    gap: '0.5rem', pointerEvents: 'none',
  });
  document.body.appendChild(toastContainer);
  return toastContainer;
}

/**
 * 画面右下にトースト通知を表示する
 * @param {string} message - 表示するメッセージ
 * @param {'error'|'warning'|'info'} type - 通知タイプ
 * @param {number} duration - 表示時間（ミリ秒）
 */
export function showToast(message, type = 'info', duration = 5000) {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }

  const container = ensureToastContainer();
  const colors = TOAST_COLORS[type] || TOAST_COLORS.info;

  const toast = document.createElement('div');
  Object.assign(toast.style, {
    background: colors.bg, border: `1px solid ${colors.border}`,
    color: colors.text, padding: '0.75rem 1.25rem',
    borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', pointerEvents: 'auto',
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    opacity: '0', transform: 'translateX(1rem)',
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    maxWidth: '360px', lineHeight: '1.4',
  });
  toast.textContent = `${colors.icon} ${message}`;

  container.appendChild(toast);

  // アニメーションで表示
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  });

  // 一定時間後に消す
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(1rem)';
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

import goalSettingsService from '../../scripts/services/goalSettings.js';

let msPeriodMonthSelect = null;

function buildMonthOptions() {
    const now = new Date();
    const options = [];
    for (let i = -6; i <= 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
        options.push({ value, label });
    }
    return options;
}

function showStatus(message, type = 'info') {
    const el = document.getElementById('msPeriodStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `status-${type}`;
}

function clearStatus() {
    const el = document.getElementById('msPeriodStatus');
    if (el) {
        el.textContent = '';
        el.className = '';
    }
}

function applySettings(settings) {
    document.querySelectorAll('.ms-period-date[data-metric][data-field]').forEach(input => {
        const metricKey = input.dataset.metric;
        const field = input.dataset.field;
        const period = settings?.[metricKey];
        if (field === 'start') input.value = period?.startDate || '';
        if (field === 'end') input.value = period?.endDate || '';
    });
}

function clearInputs() {
    document.querySelectorAll('.ms-period-date').forEach(input => {
        input.value = '';
    });
}

async function loadSettings(month) {
    if (!month) return;
    showStatus('読み込み中…', 'info');
    clearInputs();
    try {
        const settings = await goalSettingsService.loadMsPeriodSettings(month, { force: true });
        console.log('[ms-period-settings] API response:', JSON.stringify(settings));
        applySettings(settings);
        clearStatus();
    } catch (error) {
        console.error('[ms-period-settings] load failed', error);
        showStatus('読み込みに失敗しました', 'error');
    }
}

async function handleSave(event) {
    event.preventDefault();
    const month = msPeriodMonthSelect?.value;
    if (!month) return;

    const saveBtn = document.getElementById('msPeriodSaveBtn');

    // フォームからデータ収集
    const metricMap = {};
    document.querySelectorAll('.ms-period-date[data-metric][data-field]').forEach(input => {
        const metricKey = input.dataset.metric;
        const field = input.dataset.field;
        if (!metricMap[metricKey]) metricMap[metricKey] = {};
        if (field === 'start') metricMap[metricKey].startDate = input.value || null;
        if (field === 'end') metricMap[metricKey].endDate = input.value || null;
    });

    // バリデーション: 開始日・終了日どちらか一方だけ入力されている指標を検出
    const METRIC_LABELS = {
        new_interviews: '新規面談数',
        proposals: '提案数',
        recommendations: '推薦数',
        interviews_scheduled: '面接設定数',
        interviews_held: '面接実施数',
        offers: '内定数',
        accepts: '承諾数',
        appointments: '設定数',
        sitting: '着座数',
        valid_applications: '有効応募数'
    };
    const incompleteMetrics = Object.entries(metricMap)
        .filter(([, p]) => (p.startDate && !p.endDate) || (!p.startDate && p.endDate))
        .map(([key]) => METRIC_LABELS[key] || key);

    if (incompleteMetrics.length > 0) {
        showStatus(
            `開始日・終了日の両方を入力してください：${incompleteMetrics.join('、')}`,
            'error'
        );
        return;
    }

    if (saveBtn) saveBtn.disabled = true;

    const settings = Object.entries(metricMap).map(([metricKey, period]) => ({
        metricKey,
        startDate: period.startDate || null,
        endDate: period.endDate || null
    }));

    showStatus('保存中…', 'info');
    try {
        await goalSettingsService.saveMsPeriodSettings(month, settings);
        showStatus('保存しました ✓', 'success');
        setTimeout(clearStatus, 3000);
    } catch (error) {
        console.error('[ms-period-settings] save failed', error);
        showStatus('保存に失敗しました', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}


export function mount(container) {
    msPeriodMonthSelect = container.querySelector('#msPeriodMonthSelect');
    const form = container.querySelector('#msPeriodForm');

    // 月セレクターを生成
    if (msPeriodMonthSelect) {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const options = buildMonthOptions();
        msPeriodMonthSelect.innerHTML = options
            .map(opt => `<option value="${opt.value}"${opt.value === currentMonth ? ' selected' : ''}>${opt.label}</option>`)
            .join('');

        msPeriodMonthSelect.addEventListener('change', () => {
            loadSettings(msPeriodMonthSelect.value);
        });

        // 初期ロード
        loadSettings(currentMonth);
    }

    if (form) {
        form.addEventListener('submit', handleSave);
    }
}

export function unmount() {
    msPeriodMonthSelect = null;
}

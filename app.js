/* ============================================================
   営業部 業務時間管理 app.js  v1.57
   - localStorage ベース（サーバー不要・費用ゼロ）
   - PWA対応（オフライン動作）
   ============================================================ */
'use strict';

// ============================================================
// 定数
// ============================================================
const WORK_TYPES = ['九電碍・点','九電管路','他電力碍・点','直送商','在庫商','外販製品（非電力）','TKD','社内対応'];
const APP_VERSION = 'v1.65'; // アプリケーションのバージョン

// ============================================================
// 日本の祝日データ（2024〜2027年）
// ============================================================
const JAPAN_HOLIDAYS = {
  // 2024年
  '2024-01-01': '元日',
  '2024-01-08': '成人の日',
  '2024-02-11': '建国記念の日',
  '2024-02-12': '振替休日',
  '2024-02-23': '天皇誕生日',
  '2024-03-20': '春分の日',
  '2024-04-29': '昭和の日',
  '2024-05-03': '憲法記念日',
  '2024-05-04': 'みどりの日',
  '2024-05-05': 'こどもの日',
  '2024-05-06': '振替休日',
  '2024-07-15': '海の日',
  '2024-08-11': '山の日',
  '2024-08-12': '振替休日',
  '2024-09-16': '敬老の日',
  '2024-09-22': '秋分の日',
  '2024-09-23': '振替休日',
  '2024-10-14': 'スポーツの日',
  '2024-11-03': '文化の日',
  '2024-11-04': '振替休日',
  '2024-11-23': '勤労感謝の日',
  // 2025年
  '2025-01-01': '元日',
  '2025-01-13': '成人の日',
  '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日',
  '2025-02-24': '振替休日',
  '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日',
  '2025-05-03': '憲法記念日',
  '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日',
  '2025-05-06': '振替休日',
  '2025-07-21': '海の日',
  '2025-08-11': '山の日',
  '2025-09-15': '敬老の日',
  '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日',
  '2025-11-03': '文化の日',
  '2025-11-23': '勤労感謝の日',
  '2025-11-24': '振替休日',
  // 2026年
  '2026-01-01': '元日',
  '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日',
  '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日',
  '2026-07-20': '海の日',
  '2026-08-11': '山の日',
  '2026-09-21': '敬老の日',
  '2026-09-22': '国民の休日',
  '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日',
  // 2027年
  '2027-01-01': '元日',
  '2027-01-11': '成人の日',
  '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日',
  '2027-03-21': '春分の日',
  '2027-03-22': '振替休日',
  '2027-04-29': '昭和の日',
  '2027-05-03': '憲法記念日',
  '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日',
  '2027-07-19': '海の日',
  '2027-08-11': '山の日',
  '2027-09-20': '敬老の日',
  '2027-09-23': '秋分の日',
  '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日',
  '2027-11-23': '勤労感謝の日'
};

/**
 * 指定日付が日本の祝日かどうかを返す
 * @param {string} dateStr YYYY-MM-DD形式
 * @returns {string|null} 祝日名（祝日でなければnull）
 */
function getJapanHolidayName(dateStr) {
  return JAPAN_HOLIDAYS[dateStr] || null;
}
const PARTY_TYPE = '懇親会対応';
const BREAK_TYPE = '休憩';

// ============================================================
// ストレージキー
// ============================================================
const KEY_USER      = 'stm_user';
const KEY_RECORDS   = 'stm_records';
const KEY_ACTIVE    = 'stm_active';
const KEY_HOLIDAYS  = 'stm_holidays';
const KEY_DAYSTATUS = 'stm_daystatus';

// ============================================================
// 状態変数
// ============================================================
let currentUser      = null;
let records          = [];
let activeSession    = null;
let holidays         = [];
let dayStatuses      = [];
let elapsedTimer     = null;
let currentPage      = 'home';
let viewMonth        = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
let settingsMonth    = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
let viewTodayDate    = null; // DOMContentLoadedで初期化
let selectedWorkType = null;

// ============================================================
// 初期化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  viewTodayDate = toDateStr(new Date()); // ここで初期化
  loadAll();
  if (!currentUser || !currentUser.name) {
    showSetupScreen();
  } else {
    initApp();
  }
  registerSW();
  
  // 「登録して開始」ボタンのイベントリスナーを登録
  const btnSaveSetup = document.getElementById('btn-save-setup');
  if (btnSaveSetup) {
    btnSaveSetup.addEventListener('click', saveSetup);
  }

  // ナビゲーションボタンのイベントリスナーを登録（iPhone Safari対応）
  const navMap = {
    'nav-home':     'home',
    'nav-today':    'today',
    'nav-monthly':  'monthly',
    'nav-settings': 'settings'
  };
  Object.keys(navMap).forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        showPage(navMap[id]);
      });
    }
  });
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // 通知の許可を求める
      if ('Notification' in window && Notification.permission === 'default') {
        setTimeout(() => {
          Notification.requestPermission();
        }, 3000);
      }

      // ① 起動時に既にwaitingのSWがあればすぐバナー表示
      if (reg.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner();
      }

      // ② 新しいSWのインストール完了を検知してバナー表示
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });

      // ③ アプリ起動時に更新チェック（キャッシュバスティング付き）
      setTimeout(() => reg.update(), 1000);

      // ④ controllerchangeでの自動リロードは廃止
      //    「今すぐ更新」ボタン押下時のみリロードする

    }).catch(() => {});
  }
}

function showUpdateBanner() {
  let banner = document.getElementById('update-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style.cssText = [
      'position:fixed', 'bottom:70px', 'left:50%', 'transform:translateX(-50%)',
      'background:#1a73e8', 'color:#fff', 'padding:12px 20px',
      'border-radius:24px', 'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
      'z-index:99999', 'display:flex', 'align-items:center', 'gap:12px',
      'font-size:14px', 'white-space:nowrap'
    ].join(';');
    banner.innerHTML = '<span>新しいバージョンがあります</span>' +
      '<button onclick="applyUpdate()" style="background:#fff;color:#1a73e8;border:none;' +
      'border-radius:16px;padding:6px 14px;font-weight:bold;cursor:pointer;">今すぐ更新</button>';
    document.body.appendChild(banner);
  }
  banner.style.display = 'flex';
}

function applyUpdate() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.waiting) {
        // SKIP_WAITING後にリロードするためcontrollerchangeを一度だけ監視
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        }, { once: true });
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    });
  } else {
    window.location.reload();
  }
}

function forceReloadApp() {
  if (confirm('アプリを強制的に更新します。よろしいですか？')) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
          registration.unregister();
        }
      });
    }
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      window.location.href = window.location.href.split('?')[0] + '?v=' + new Date().getTime();
    });
  }
}



function showUpdateNotes() {
  const modal = document.getElementById('update-notes-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeUpdateNotesModal() {
  const modal = document.getElementById("update-notes-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

function showUpdateNotesModalExplicitly() {
  showUpdateNotes();
}

// ============================================================
// 記録編集モーダル
// ============================================================
function openNewRecordModal() {
  selectedWorkType = null;
  document.getElementById('record-modal-title').textContent = '新規業務記録';
  document.getElementById('record-work-type').value = '';
  document.getElementById('record-start-time').value = fmtTime(new Date());
  document.getElementById('record-end-time').value = '';
  document.getElementById('record-memo').value = '';
  document.getElementById('delete-record-btn').style.display = 'none';
  document.getElementById('record-modal').classList.add('open');
}

function openEditModal(id) {
  const rec = records.find(r => r.id === id);
  if (!rec) return;

  selectedWorkType = rec.id; // 編集対象のIDを保持
  document.getElementById('record-modal-title').textContent = '業務記録編集';
  document.getElementById('record-work-type').value = rec.workType;
  document.getElementById('record-start-time').value = fmtTime(new Date(rec.startTime));
  document.getElementById('record-end-time').value = rec.endTime ? fmtTime(new Date(rec.endTime)) : '';
  document.getElementById('record-memo').value = rec.memo;
  document.getElementById('delete-record-btn').style.display = 'block';
  document.getElementById('record-modal').classList.add('open');
}

function closeRecordModal() {
  document.getElementById('record-modal').classList.remove('open');
  selectedWorkType = null;
}

function saveRecordModal() {
  const workType = document.getElementById('record-work-type').value;
  const startTime = document.getElementById('record-start-time').value;
  const endTime = document.getElementById('record-end-time').value;
  const memo = document.getElementById('record-memo').value;

  if (!workType) { showToast('業務区分を選択してください'); return; }
  if (!startTime) { showToast('開始時刻を入力してください'); return; }

  const startDt = new Date(`${viewTodayDate}T${startTime}:00`);
  let endDt = null;
  if (endTime) {
    endDt = new Date(`${viewTodayDate}T${endTime}:00`);
    if (endDt <= startDt) { showToast('終了時刻は開始時刻より後にしてください'); return; }
  } else if (selectedWorkType === null) {
    // 新規作成で終了時刻がない場合は、現在時刻を仮設定
    endDt = new Date();
  }

  let rec = {};
  if (selectedWorkType) {
    // 既存レコードの編集
    rec = records.find(r => r.id === selectedWorkType);
    if (!rec) return;
    rec.workType = workType;
    rec.startTime = startDt.toISOString();
    rec.endTime = endDt ? endDt.toISOString() : null;
    rec.memo = memo;
    rec.modified = true; // 修正フラグ
  } else {
    // 新規レコードの追加
    rec = {
      id: genId(),
      workType: workType,
      type: 'work',
      startTime: startDt.toISOString(),
      endTime: endDt ? endDt.toISOString() : null,
      date: viewTodayDate,
      memo: memo,
      modified: true
    };
    records.push(rec);
  }

  // 時間計算を再実行
  calculateRecordMinutes(rec);
  saveRecords();
  closeRecordModal();
  renderTodayPage();
  showToast('記録を保存しました');
}

function deleteRecord() {
  if (!selectedWorkType) return;
  if (!confirm('この記録を削除しますか？')) return;

  records = records.filter(r => r.id !== selectedWorkType);
  saveRecords();
  closeRecordModal();
  renderTodayPage();
  showToast('記録を削除しました');
}

/**
 * スマホの通知欄にメッセージを表示する（ローカル通知）
 * @param {string} title タイトル
 * @param {string} body 本文
 */
function sendNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  
  if (navigator.serviceWorker.controller) {
    // Service Worker経由で通知（バックグラウンド対応）
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body: body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'stm-alert', // 同じタグの通知は上書き
        renotify: true
      });
    });
  } else {
    // 通常の通知（フォアグラウンド用）
    new Notification(title, { body: body, icon: './icons/icon-192.png' });
  }
}

function loadAll() {
  try {
    currentUser   = JSON.parse(localStorage.getItem(KEY_USER))      || null;
    records       = JSON.parse(localStorage.getItem(KEY_RECORDS))    || [];
    activeSession = JSON.parse(localStorage.getItem(KEY_ACTIVE))     || null;
    holidays      = JSON.parse(localStorage.getItem(KEY_HOLIDAYS))   || [];
    dayStatuses   = JSON.parse(localStorage.getItem(KEY_DAYSTATUS))  || [];
  } catch(e) {
    records = []; activeSession = null; holidays = []; dayStatuses = [];
  }
}

function saveRecords()    { localStorage.setItem(KEY_RECORDS,   JSON.stringify(records)); }
function saveActive()     { localStorage.setItem(KEY_ACTIVE,    JSON.stringify(activeSession)); }
function saveUser()       { localStorage.setItem(KEY_USER,      JSON.stringify(currentUser)); }
function saveHolidays()   { localStorage.setItem(KEY_HOLIDAYS,  JSON.stringify(holidays)); }
function saveDayStatuses(){ localStorage.setItem(KEY_DAYSTATUS, JSON.stringify(dayStatuses)); }

// ============================================================
// 初期設定画面
// ============================================================
function showSetupScreen() {
  const el = document.getElementById('setup-screen');
  el.style.display = 'block';
  el.style.visibility = 'visible';
  el.style.pointerEvents = 'auto';
}
function hideSetupScreen() {
  const el = document.getElementById('setup-screen');
  el.style.display = 'none';
  el.style.visibility = 'hidden';
  el.style.pointerEvents = 'none';
}
function saveSetup() {
  const empId = document.getElementById('setup-emp-id').value.trim();
  const name  = document.getElementById('setup-name').value.trim();
  const dept  = document.getElementById('setup-dept').value.trim();
  const role  = document.getElementById('setup-role').value.trim();
  const start = document.getElementById('setup-start').value || '08:30';
  const end   = document.getElementById('setup-end').value   || '17:30';
  const bStart = document.getElementById('setup-break-start').value || '12:00';
  const bEnd   = document.getElementById('setup-break-end').value   || '13:00';
  
  if (!/^\d{6}$/.test(empId)) { showToast('社員番号は6桁の数字で入力してください'); return; }
  if (!name) { showToast('氏名を入力してください'); return; }
  if (!dept) { showToast('部門を選択してください'); return; }
  if (!role) { showToast('役職を選択してください'); return; }
  
  currentUser = { empId, name, dept, role, workStart: start, workEnd: end, breakStart: bStart, breakEnd: bEnd };
  saveUser();
  hideSetupScreen();
  initApp();
}

// ============================================================
// 起動時始業補正チェック
// ============================================================
function checkStartupWorkStatus() {
  if (!currentUser) return;
  const now = new Date();
  const today = toDateStr(now);

  // 休日・祈日・有給・特休はチェック不要
  if (isHolidayOrSpecial(today)) return;

  // 既に計測中の場合はチェック不要
  if (activeSession) return;

  const [sh, sm] = currentUser.workStart.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const nowMin   = now.getHours() * 60 + now.getMinutes();

  // 始業時刻前はチェック不要
  if (nowMin < startMin) return;

  // 当日の記録を確認
  const todayRecs = records.filter(r => r.date === today);
  if (todayRecs.length > 0) return; // 既に記録あり

  // 始業時刻からの経過分数
  const elapsedMin = nowMin - startMin;

  const modal = document.getElementById('startup-check-modal');
  const msgEl  = document.getElementById('startup-modal-msg');
  const btnGrp = document.getElementById('startup-btn-group');
  const wtWrap = document.getElementById('startup-worktype-wrap');

  // 始業時刻ちょうどから最大1分以内の場合：5分前通知から起動したケース
  if (elapsedMin <= 1) {
    // 定時から開始か現在時刻から開始か選択
    msgEl.textContent = `本日の勤務記録が未作成です。定時始業時刻（${currentUser.workStart}）から開始するか、現在時刻から開始するか選択してください。`;
    wtWrap.style.display = 'block';
    btnGrp.innerHTML = `
      <button onclick="startupStartAt('scheduled')" style="padding:12px;background:#1565c0;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer;">定時（${currentUser.workStart}）から開始</button>
      <button onclick="startupStartAt('now')" style="padding:12px;background:#2e7d32;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer;">現在時刻から開始</button>
      <button onclick="startupStartAt('skip')" style="padding:12px;background:#424242;color:#fff;border:none;border-radius:10px;font-size:14px;cursor:pointer;">計測不要</button>
    `;
  } else {
    // 始業時刻を過ぎている場合
    msgEl.textContent = `始業時刻（${currentUser.workStart}）から${elapsedMin}分経過していますが、本日の始業記録がありません。`;
    wtWrap.style.display = 'block';
    btnGrp.innerHTML = `
      <button onclick="startupStartAt('scheduled')" style="padding:12px;background:#1565c0;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer;">定時（${currentUser.workStart}）から開始</button>
      <button onclick="startupStartAt('now')" style="padding:12px;background:#2e7d32;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer;">今から開始</button>
      <button onclick="startupStartAt('skip')" style="padding:12px;background:#424242;color:#fff;border:none;border-radius:10px;font-size:14px;cursor:pointer;">計測不要</button>
    `;
  }

  modal.style.display = 'flex';
}

function startupStartAt(mode) {
  const modal = document.getElementById('startup-check-modal');
  modal.style.display = 'none';

  if (mode === 'skip') return;

  const workType = document.getElementById('startup-worktype-select').value || '社内対応';
  const now = new Date();
  const [sh, sm] = currentUser.workStart.split(':').map(Number);

  let startTime;
  if (mode === 'scheduled') {
    // 定時始業時刻から開始
    startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm, 0, 0);
  } else {
    // 現在時刻から開始
    startTime = now;
  }

  activeSession = {
    id:        genId(),
    workType:  workType,
    type:      'work',
    startTime: startTime.toISOString(),
    memo:      mode === 'scheduled' ? '起動時定時補正' : '起動時手動開始'
  };
  saveActive();
  updateHomeStatus();
  showToast(`「${workType}」で業務を開始しました`);
}

// ============================================================
// アプリ初期化
// ============================================================
function initApp() {
  updateHeaderUser();
  updateHomeStatus();
  startElapsedTimer();
  updateDayStatusBanner();
  checkStaleSession();       // 前日業務未終了チェック
  startWarnTimer();          // 長時間同一業務・待機中警告タイマー起動
  renderSettingsCalendar();
  loadSettingsForm();
  updateVersionDisplay();    // バージョン情報表示
  checkStartupWorkStatus();  // 起動時始業補正チェック

  showPage('home');
}

function updateVersionDisplay() {
  const verEl = document.getElementById('display-version');
  const dateEl = document.getElementById('display-last-update');
  if (verEl) verEl.textContent = APP_VERSION;
  // 更新時間はHTMLに直接記述するため、ここでは何もしない
}

function updateHeaderUser() {
  if (!currentUser) return;
  const nameEl = document.getElementById('header-name');
  const deptEl = document.getElementById('header-dept');
  if (nameEl) nameEl.textContent = `${currentUser.empId || ''} ${currentUser.name}`;
  if (deptEl) deptEl.textContent = currentUser.dept + (currentUser.role ? ' ' + currentUser.role : '');
}

// ============================================================
// ページ切り替え
// ============================================================
function showPage(pageId) {
  console.log('showPage called with:', pageId);

  currentPage = pageId;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('page-' + pageId).classList.add('active');
  document.getElementById('nav-' + pageId).classList.add('active');

  if (pageId === 'today') {
    renderTodayPage();
  }
  if (pageId === 'monthly') {
    renderMonthlyPage();
  }
  if (pageId === 'settings') {
    loadSettingsForm();
    renderSettingsCalendar();
  }
}

// ============================================================
// ホーム画面の状態更新
// ============================================================
function updateHomeStatus() {
  const nameEl    = document.getElementById('home-work-name');
  const badgeEl   = document.getElementById('home-state-badge');
  if (!nameEl || !badgeEl) return; // 要素が存在しない場合は何もしない

  // 全ての業務ボタンの選択状態を解除
  document.querySelectorAll('.wt-btn').forEach(btn => btn.classList.remove('selected'));

  if (!activeSession) {
    nameEl.textContent = '業務未開始';
    setBadge(badgeEl, '待機中', 'state-idle');
  } else if (activeSession.type === BREAK_TYPE) {
    nameEl.textContent = '休憩中';
    setBadge(badgeEl, '休憩中', 'state-break');
  } else if (activeSession.workType === PARTY_TYPE) {
    nameEl.textContent = '懇親会対応';
    setBadge(badgeEl, '懇親会中', 'state-party');
    // 懇親会ボタンを選択状態にする
    const partyBtn = document.querySelector(`.wt-btn[data-type="${PARTY_TYPE}"]`);
    if (partyBtn) partyBtn.classList.add('selected');
  } else {
    nameEl.textContent = activeSession.workType || '---';
    // 通常 or 時間外判定
    const stateLabel = isCurrentOT() ? '時間外業務' : '通常業務';
    setBadge(badgeEl, stateLabel, 'state-working');
    // 該当する業務ボタンを選択状態にする
    const activeBtn = document.querySelector(`.wt-btn[data-type="${activeSession.workType}"]`);
    if (activeBtn) activeBtn.classList.add('selected');
  }
  updateActionButtons();
}

function setBadge(el, text, cls) {
  el.textContent = text;
  el.className = 'state-badge ' + cls;
}

function isCurrentOT() {
  if (!activeSession || !currentUser) return false;
  const now = new Date();
  const today = toDateStr(now);
  if (isHolidayOrSpecial(today, now)) return true; // 時間休考慮
  const [sh, sm] = currentUser.workStart.split(':').map(Number);
  const [eh, em] = currentUser.workEnd.split(':').map(Number);
  const startMinTime = sh * 60 + sm;
  const endMinTime   = eh * 60 + em;
  const nowMin       = now.getHours() * 60 + now.getMinutes();
  return nowMin < startMinTime || nowMin >= endMinTime;
}

// ============================================================
// 経過時間タイマー
// ============================================================
function startElapsedTimer() {
  if (elapsedTimer) clearInterval(elapsedTimer);
  updateElapsed();
  elapsedTimer = setInterval(updateElapsed, 10000); // 10秒ごと（分単位表示）
}

function updateElapsed() {
  const el = document.getElementById('home-elapsed');
  if (!el) return; // 要素が存在しない場合は何もしない
  if (!activeSession) {
    el.textContent = '--:--';
    return;
  }
  const start = new Date(activeSession.startTime);
  const diffMin = Math.floor((Date.now() - start) / 60000);
  el.textContent = fmtMin(diffMin);
}

// ============================================================
// 操作ボタン状態更新
// ============================================================
function updateActionButtons() {
  const btnEnd    = document.getElementById('btn-end');
  const btnBreak  = document.getElementById('btn-break');
  if (!btnEnd || !btnBreak) return;

  if (!activeSession) {
    // 待機中：全て無効
    btnEnd.disabled    = true;
    btnBreak.disabled  = true;
  } else if (activeSession.type === BREAK_TYPE) {
    // 休憩中：業務区分ボタンでの再開を促すため、操作ボタンは無効
    btnEnd.disabled    = true;
    btnBreak.disabled  = true;
  } else {
    // 業務中：終了・休憩のみ有効
    btnEnd.disabled    = false;
    btnBreak.disabled  = false;
  }
}

// ============================================================
// 業務区分タップ＝即業務開始（1タップ操作）
// ============================================================
function tapWorkType(btn) {
  const newType = btn.dataset.type;

  // 休憩中の場合：休憩を終了して新しい業務を開始
  if (activeSession && activeSession.type === BREAK_TYPE) {
    endCurrentSession();
    _startNewWork(newType, btn);
    return;
  }

  // 同じ業務区分をタップした場合：何もしない（誤タップ防止）
  if (activeSession && activeSession.workType === newType) {
    showToast(`「${newType}」は現在進行中です`);
    return;
  }

  // 別の業務が進行中の場合：前の業務を自動終了して新しい業務を開始
  if (activeSession) {
    const prevType = activeSession.workType;
    endCurrentSession();
    showToast(`「${prevType}」を終了しました`);
  }

  _startNewWork(newType, btn);
}

function _startNewWork(type, btn) {
  activeSession = {
    id:        genId(),
    workType:  type,
    type:      type === PARTY_TYPE ? PARTY_TYPE : 'work',
    startTime: new Date().toISOString(),
    memo:      ''
  };
  saveActive();
  updateHomeStatus();
  updateElapsed();
  showToast(`「${type}」を開始しました`);
  
  // ボタンのアニメーション
  btn.classList.add('btn-active-tap');
  setTimeout(() => btn.classList.remove('btn-active-tap'), 200);
}

// ============================================================
// 休憩・終了
// ============================================================
function startBreak() {
  if (!activeSession || activeSession.type === BREAK_TYPE) return;
  const prevType = activeSession.workType;
  endCurrentSession();
  
  activeSession = {
    id:        genId(),
    workType:  BREAK_TYPE,
    type:      BREAK_TYPE,
    startTime: new Date().toISOString(),
    memo:      ''
  };
  saveActive();
  updateHomeStatus();
  updateElapsed();
  showToast(`「${prevType}」を終了し、休憩を開始しました`);
}

function endCurrentSession() {
  if (!activeSession) return;
  const now = new Date();
  const start = new Date(activeSession.startTime);
  const dateStr = toDateStr(start);
  
  // 1分未満は記録しない（誤操作防止）
  if (now - start < 60000) {
    activeSession = null;
    saveActive();
    updateHomeStatus();
    return;
  }

  const rec = {
    ...activeSession,
    endTime: now.toISOString(),
    date:    dateStr
  };
  
  // 時間計算
  calculateRecordMinutes(rec);
  
  records.push(rec);
  saveRecords();
  
  activeSession = null;
  saveActive();
  updateHomeStatus();
}

function endSessionAt(endTime) {
  if (!activeSession) return;
  const start = new Date(activeSession.startTime);
  const dateStr = toDateStr(start);
  
  const rec = {
    ...activeSession,
    endTime: endTime.toISOString(),
    date:    dateStr
  };
  calculateRecordMinutes(rec);
  records.push(rec);
  saveRecords();
  activeSession = null;
  saveActive();
}

function endWork() {
  if (!activeSession) return;
  const type = activeSession.workType;
  endCurrentSession();
  showToast(`「${type}」を終了しました`);
}

// ============================================================
// 時間計算ロジック
// ============================================================
function calculateRecordMinutes(rec) {
  const start = new Date(rec.startTime);
  const end   = new Date(rec.endTime);
  const date  = rec.date;
  
  let normal = 0, ot = 0, brk = 0, party = 0, vacation = 0;
  const totalMin = Math.floor((end - start) / 60000);

  if (rec.type === BREAK_TYPE) {
    brk = totalMin;
  } else if (rec.workType === PARTY_TYPE) {
    party = totalMin;
  } else if (isHolidayOrSpecial(date)) {
    // 休日・有給・特休はすべて「休暇中業務」
    vacation = totalMin;
  } else {
    // 通常日：就業時間内か外か
    const [sh, sm] = currentUser.workStart.split(":").map(Number);
    const [eh, em] = currentUser.workEnd.split(":").map(Number);
    const workStartMin = sh * 60 + sm;
    const workEndMin   = eh * 60 + em;

    // 1分ごとに判定
    let cur = new Date(start);
    while (cur < end) {
      const curMin = cur.getHours() * 60 + cur.getMinutes();
      
      // 時間休の判定を追加
      if (isHolidayOrSpecial(date, cur)) {
        vacation++;
      } else if (curMin >= workStartMin && curMin < workEndMin) {
        normal++;
      } else {
        ot++;
      }
      cur.setMinutes(cur.getMinutes() + 1);
    }
  }
  
  rec.normalMin   = normal;
  rec.otMin       = ot;
  rec.breakMin    = brk;
  rec.partyMin    = party;
  rec.vacationMin = vacation;
  rec.isSpecialDay = isHolidayOrSpecial(date);
}

// ============================================================
// 警告・通知タイマー
// ============================================================
let warnTimer = null;
let lastNotifiedTag = ""; // 重複通知防止

function startWarnTimer() {
  if (warnTimer) clearInterval(warnTimer);
  warnTimer = setInterval(checkWarnings, 60000); // 1分ごと
  checkWarnings();
}

function checkWarnings() {
  if (!currentUser) return;
  const now = new Date();
  const today = toDateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  
  const [sh, sm] = currentUser.workStart.split(':').map(Number);
  const [eh, em] = currentUser.workEnd.split(':').map(Number);
  const [bsh, bsm] = currentUser.breakStart.split(':').map(Number);
  const [beh, bem] = currentUser.breakEnd.split(':').map(Number);
  
  const startMin = sh * 60 + sm;
  const endMin   = eh * 60 + em;
  const bStartMin = bsh * 60 + bsm;
  const bEndMin   = beh * 60 + bem;

  let alertMsg = "";
  let alertTag = "";

  // ⓪ 始業5分前通知（平日のみ）
  if (!isHolidayOrSpecial(today) && nowMin === startMin - 5) {
    if (lastNotifiedTag !== 'pre-start-' + today) {
      sendNotification('業務時間管理', `始業5分前です（${currentUser.workStart}始業）。アプリを起動してください。`);
      lastNotifiedTag = 'pre-start-' + today;
    }
  }

  // ⓪-B 10:00時点で当日記録がない場合の再通知（平日のみ）
  if (!isHolidayOrSpecial(today) && now.getHours() === 10 && now.getMinutes() === 0) {
    const todayRecs = records.filter(r => r.date === today);
    if (todayRecs.length === 0 && !activeSession) {
      if (lastNotifiedTag !== 'no-record-10-' + today) {
        sendNotification('業務時間管理', '10時になりましたが本日の業務記録がありません。アプリを起動して記録を開始してください。');
        lastNotifiedTag = 'no-record-10-' + today;
      }
    }
  }

  // ① 始業時自動計測開始（平日のみ）
  // 始業時刻ちょうど、または1分経過までの間に未開始なら自動開始
  if (!isHolidayOrSpecial(today) && !activeSession && (nowMin === startMin || nowMin === startMin + 1)) {
    if (lastNotifiedTag !== "auto-start-" + today) {
      activeSession = {
        id:        genId(),
        workType:  '社内対応',
        type:      'work',
        startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                            sh, sm, 0, 0).toISOString(),
        memo:      '自動計測開始'
      };
      saveActive();
      updateHomeStatus();
      alertMsg = "始業時間のため社内業務で計測開始しました";
      alertTag = "auto-start-" + today;
      sendNotification("業務時間管理", alertMsg);
      lastNotifiedTag = alertTag;
    }
  }
  // ② 休憩未開始（10分経過）
  else if (!isHolidayOrSpecial(today) && activeSession && activeSession.type !== BREAK_TYPE && nowMin >= bStartMin + 10 && nowMin < bEndMin) {
    alertMsg = "休憩時間から10分経過しました。休憩ボタンを押してください。";
    alertTag = "break-forget";
  }
  // ③ 休憩終了忘れ
  else if (activeSession && activeSession.type === BREAK_TYPE && nowMin >= bEndMin && nowMin < bEndMin + 10) {
    alertMsg = "休憩終了時間です。業務を再開してください。";
    alertTag = "break-end-forget";
  }
  // ④ 同一業務90分経過
  else if (activeSession && activeSession.type === 'work' && activeSession.workType !== PARTY_TYPE) {
    const elapsed = Math.floor((now - new Date(activeSession.startTime)) / 60000);
    if (elapsed >= 90 && elapsed < 100) {
      alertMsg = `「${activeSession.workType}」を開始して90分経過しました。`;
      alertTag = "long-work";
    }
  }
  // ⑤ 夜間終了忘れ（20:00）
  else if (activeSession && now.getHours() === 20 && now.getMinutes() < 10) {
    alertMsg = "20時です。業務終了の押し忘れはありませんか？";
    alertTag = "night-forget";
  }
  // ⑥ 懇親会180分経過
  else if (activeSession && activeSession.workType === PARTY_TYPE) {
    const elapsed = Math.floor((now - new Date(activeSession.startTime)) / 60000);
    if (elapsed >= 180 && elapsed < 190) {
      alertMsg = "懇親会開始から180分経過しました。終了忘れはありませんか？";
      alertTag = "long-party";
    }
  }

  const banner = document.getElementById('warn-banner');
  if (alertMsg) {
    banner.textContent = alertMsg;
    banner.classList.remove('hidden');
    // 通知送信（タグが変わった時のみ）
    if (alertTag !== lastNotifiedTag) {
      sendNotification("業務時間管理アラート", alertMsg);
      lastNotifiedTag = alertTag;
    }
  } else {
    banner.classList.add('hidden');
    lastNotifiedTag = "";
  }

  // 始業・終業時刻の自動分割チェック
  checkWorkSplit(now);
}

// ============================================================
// 業務押し忘れ防止：始業・終業時刻の自動分割と継続確認
// ============================================================
let lastSplitCheckMin = -1;
let otConfirmedId = null; // 確認済みのセッションID

function checkWorkSplit(now) {
  if (!activeSession || !currentUser || activeSession.type === BREAK_TYPE) return;
  
  const today = toDateStr(now);
  if (isHolidayOrSpecial(today, now)) return; // 休暇設定日（時間休含む）は分割不要

  const [sh, sm] = currentUser.workStart.split(':').map(Number);
  const [eh, em] = currentUser.workEnd.split(':').map(Number);
  const startMinTime = sh * 60 + sm;
  const endMinTime   = eh * 60 + em;
  const nowMin       = now.getHours() * 60 + now.getMinutes();
  
  // 1分に1回だけ実行
  if (nowMin === lastSplitCheckMin) return;
  lastSplitCheckMin = nowMin;

  const startDt = new Date(activeSession.startTime);
  const startMin = startDt.getHours() * 60 + startDt.getMinutes();

  // 1. 始業時刻を跨いだ自動分割（時間外 → 通常業務）
  // 「開始が始業前」かつ「現在が始業後」の場合
  if (startMin < startMinTime && nowMin >= startMinTime) {
    const workType = activeSession.workType;
    const memo     = activeSession.memo;
    
    // 始業時刻ちょうどで終了させる
    const splitTime = new Date(now);
    splitTime.setHours(sh, sm, 0, 0);
    
    endSessionAt(splitTime); 
    
    // 即座に「通常業務」として新しいセッションを開始
    activeSession = {
      id:        genId(),
      workType:  workType,
      type:      'work',
      startTime: splitTime.toISOString(),
      memo:      (memo ? memo + ' ' : '') + '（始業跨ぎ分割）'
    };
    saveActive();
    updateHomeStatus();
    showToast('始業時刻のため履歴を分割しました');
    return;
  }

  // 2. 終業時刻を跨いだ自動分割（通常業務 → 時間外）
  // 「開始が終業前」かつ「現在が終業後」の場合
  if (startMin < endMinTime && nowMin >= endMinTime) {
    const workType = activeSession.workType;
    const memo     = activeSession.memo;
    
    // 終業時刻ちょうどで終了させる
    const splitTime = new Date(now);
    splitTime.setHours(eh, em, 0, 0);
    
    endSessionAt(splitTime);
    
    // 即座に「時間外」として新しいセッションを開始
    activeSession = {
      id:        genId(),
      workType:  workType,
      type:      'work',
      startTime: splitTime.toISOString(),
      memo:      (memo ? memo + ' ' : '') + '（終業跨ぎ分割）'
    };
    saveActive();
    updateHomeStatus();
    showToast('終業時刻のため履歴を分割しました');
    return;
  }

  // 3. 終業20分後の継続確認（カスタムモーダル）
  if (nowMin === endMinTime + 20 && otConfirmedId !== activeSession.id) {
    const sessionId = activeSession.id;
    otConfirmedId = sessionId; // 重複表示防止
    showOtConfirmModal(sessionId);
  }
}

// 終業20分後の確認モーダルを表示
function showOtConfirmModal(sessionId) {
  const modal = document.getElementById('ot-confirm-modal');
  if (modal) {
    modal.style.display = 'flex';
    modal.dataset.sessionId = sessionId;
  }
}

// 「はい」→計測継続
function otConfirmYes() {
  const modal = document.getElementById('ot-confirm-modal');
  if (modal) modal.style.display = 'none';
  showToast('計測を続行します。作業内容をメモに記載してください');
}

// 「いいえ」→終業時刻以降の記録を削除し終了
function otConfirmNo() {
  const modal = document.getElementById('ot-confirm-modal');
  if (modal) modal.style.display = 'none';
  if (!activeSession || !currentUser) return;
  const [eh, em] = currentUser.workEnd.split(':').map(Number);
  const endDt = new Date();
  endDt.setHours(eh, em, 0, 0);
  // 終業時刻以降に開始したセッションを削除
  const endIso = endDt.toISOString();
  records = records.filter(r => r.startTime >= endIso || r.date !== toDateStr(endDt));
  // 現在のアクティブセッションも終了
  activeSession = null;
  saveActive();
  saveRecords();
  updateHomeStatus();
  showToast('終業時刻以降の記録を削除しました');
}

// ============================================================
// 本日ページ
// ============================================================
function changeTodayDate(delta) {
  const d = new Date(viewTodayDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  viewTodayDate = toDateStr(d);
  renderTodayPage();
}

function renderTodayPage() {
  const today = viewTodayDate;
  const d     = new Date(today + 'T00:00:00');
  const dayNames = ['日','月','火','水','木','金','土'];
  document.getElementById('today-date-label').textContent =
    `${today}（${dayNames[d.getDay()]}）`;

  const todayRecs = records.filter(r => r.date === today)
    .sort((a,b) => b.startTime.localeCompare(a.startTime)); // 最新順（降順）に変更

  // 集計
  const sumNormal = todayRecs.reduce((s,r) => s + (r.normalMin||0), 0);
  const sumOT     = todayRecs.reduce((s,r) => s + (r.otMin||0), 0);
  const sumVacation = todayRecs.reduce((s,r) => s + (r.vacationMin||0), 0);
  const sumBreak  = todayRecs.reduce((s,r) => s + (r.breakMin||0), 0);
  const sumParty  = todayRecs.reduce((s,r) => s + (r.partyMin||0), 0);

  // 5つの区分を正確に表示
  document.getElementById('today-sum-normal').textContent = fmtMin(sumNormal);
  document.getElementById('today-sum-ot').textContent     = fmtMin(sumOT);
  document.getElementById("today-sum-break").textContent  = fmtMin(sumBreak);
  document.getElementById("today-sum-party").textContent  = fmtMin(sumParty);
  document.getElementById("today-sum-vacation").textContent = fmtMin(sumVacation);

  // 総労働時間の表示（通常 + 時間外 + 懇親会 + 休暇中業務）
  const totalWorkMin = sumNormal + sumOT + sumParty + sumVacation;
  const totalHours = Math.floor(totalWorkMin / 60);
  const totalMins = totalWorkMin % 60;
  document.getElementById('today-total-work-time').textContent = `${totalHours}時間${totalMins}分`;

  // 横棒グラフ（プログレスバー）の描画 - 業務区分（在庫商、直送商など）ベース
  const totalAll = sumNormal + sumOT + sumParty + sumVacation;
  renderTodayWTSummary(todayRecs, totalAll);

  // 履歴リスト
  const list = document.getElementById('today-history-list');
  if (todayRecs.length === 0) {
    list.innerHTML = '<div class="text-center text-sub text-sm" style="padding:16px;">記録なし</div>';
    return;
  }
  list.innerHTML = todayRecs.map(r => {
    const startStr = fmtTime(new Date(r.startTime));
    const endStr   = r.endTime ? fmtTime(new Date(r.endTime)) : '進行中';
    let cls = '';
    let badges = '';
    // 記録日が土日・祝日・有給かどうか判定（保存済みフラグ優先、なければ再計算）
    const recDateIsSpecial = r.isSpecialDay !== undefined ? r.isSpecialDay : isHolidayOrSpecial(r.date);
    if (r.type === BREAK_TYPE) {
      cls = 'break-rec';
      badges += '<span class="rec-badge badge-break">休憩</span>';
    } else if (r.workType === PARTY_TYPE) {
      cls = 'party-rec';
      badges += '<span class="rec-badge badge-party">懇親会</span>';
    } else if (recDateIsSpecial || (r.otMin > 0 && r.normalMin === 0)) {
      // 土日・祝日・有給の場合、または全時間が時間外の場合
      cls = 'overtime';
      badges += '<span class="rec-badge badge-ot">時間外</span>';
    } else if (r.otMin > 0) {
      badges += '<span class="rec-badge badge-ot">一部時間外</span>';
    }
    if (r.modified) {
      cls += ' modified';
      badges += '<span class="rec-badge badge-mod">修正済</span>';
    }
    const durMin = r.endTime ? Math.floor((new Date(r.endTime) - new Date(r.startTime)) / 60000) : 0;
    return `<div class="today-hist-item ${cls}" onclick="openEditModal('${r.id}')">
      <div class="hist-header">
        <span class="hist-type">${r.workType}${badges}</span>
        <span class="hist-time">${startStr}〜${endStr}</span>
      </div>
      <div class="hist-detail">
        ${durMin > 0 ? fmtMin(durMin) : ''}
        ${r.memo ? ' | ' + r.memo : ''}
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// 月次ページ
// ============================================================
function changeMonth(delta) {
  viewMonth.month += delta;
  if (viewMonth.month > 12) { viewMonth.month = 1;  viewMonth.year++; }
  if (viewMonth.month < 1)  { viewMonth.month = 12; viewMonth.year--; }
  renderMonthlyPage();
}

function renderMonthlyPage() {
  const ym = `${viewMonth.year}-${String(viewMonth.month).padStart(2,'0')}`;
  document.getElementById('month-display').textContent = `${viewMonth.year}年${viewMonth.month}月`;

  const monthRecs = records.filter(r => r.date && r.date.startsWith(ym));

  // 5つの区分を正確に集計
  const totalNormal = monthRecs.reduce((s,r) => s + (r.normalMin||0), 0);
  const totalOT     = monthRecs.reduce((s,r) => s + (r.otMin||0), 0);
  const totalVacation = monthRecs.reduce((s,r) => s + (r.vacationMin||0), 0);
  const totalBreak  = monthRecs.reduce((s,r) => s + (r.breakMin||0), 0);
  const totalParty  = monthRecs.reduce((s,r) => s + (r.partyMin||0), 0);
  const totalAll    = totalNormal + totalOT + totalParty + totalVacation;

  document.getElementById('sum-total').textContent  = fmtMin(totalAll);
  document.getElementById('sum-normal').textContent = fmtMin(totalNormal);
  document.getElementById('sum-ot').textContent     = fmtMin(totalOT);
  document.getElementById('sum-vacation').textContent = fmtMin(totalVacation);
  document.getElementById('sum-break').textContent  = fmtMin(totalBreak);
  document.getElementById('sum-party').textContent  = fmtMin(totalParty);

  renderMonthlyWTSummary(monthRecs, totalAll);
  renderMonthlyRecords(monthRecs);
  renderUnrecordedDays(ym);
}

// 未記録日一覧の描画
function renderUnrecordedDays(ym) {
  const card = document.getElementById('unrecorded-days-card');
  const list = document.getElementById('unrecorded-days-list');
  if (!card || !list) return;

  const [year, month] = ym.split('-').map(Number);
  const today = toDateStr(new Date());
  const daysInMonth = new Date(year, month, 0).getDate();

  // 当月の全日をチェック（未来日は除外）
  const unrecorded = [];
  const DOW_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${ym}-${String(d).padStart(2,'0')}`;
    // 未来日はスキップ
    if (dateStr > today) break;
    // 休日（土日・祈日・有給・特休）はスキップ
    if (isHolidayOrSpecial(dateStr)) continue;
    // 記録がある日はスキップ
    const hasRecord = records.some(r => r.date === dateStr);
    if (hasRecord) continue;
    // 未記録日として追加
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    const holidayName = getJapanHolidayName ? getJapanHolidayName(dateStr) : null;
    unrecorded.push({ dateStr, dow, holidayName });
  }

  if (unrecorded.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  list.innerHTML = unrecorded.map(({ dateStr, dow }) => {
    const [y, m, day] = dateStr.split('-');
    const dowColor = dow === 0 ? '#ef5350' : dow === 6 ? '#42a5f5' : '#eceff1';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 8px;border-bottom:1px solid #263547;gap:8px;">
      <div style="display:flex;align-items:center;gap:10px;min-width:0;">
        <span style="font-size:15px;font-weight:bold;color:${dowColor};white-space:nowrap;">${parseInt(m)}月${parseInt(day)}日</span>
        <span style="font-size:13px;font-weight:bold;color:${dowColor};background:rgba(255,255,255,0.1);padding:2px 8px;border-radius:6px;white-space:nowrap;">（${DOW_NAMES[dow]}）</span>
      </div>
      <button onclick="openNewRecordForDate('${dateStr}')" style="font-size:12px;padding:6px 14px;background:#1565c0;color:#fff;border:none;border-radius:8px;cursor:pointer;white-space:nowrap;flex-shrink:0;">記録を入力</button>
    </div>`;
  }).join('');
  // 件数も表示
  const countEl = document.getElementById('unrecorded-days-count');
  if (countEl) countEl.textContent = `${unrecorded.length}件`;
}

// 未記録日から履歴新規作成画面を開く
function openNewRecordForDate(dateStr) {
  // 本日ページに移動し、新規記録モードで指定日付をセット
  viewTodayDate = dateStr;
  showPage('today');
  setTimeout(() => {
    // 新規作成モーダルを開く
    if (typeof openAddModal === 'function') openAddModal();
  }, 200);
}

// 本日ページ用の横棒グラフ描画（業務区分ベース）
function renderTodayWTSummary(todayRecs, totalAll) {
  const container = document.getElementById('today-wt-summary');
  if (!container) return;

  if (totalAll === 0) {
    container.innerHTML = '<div class="text-sub text-sm text-center">業務記録なし</div>';
    return;
  }

  const wtMap = {};
  todayRecs.forEach(r => {
    if (r.workType && r.workType !== BREAK_TYPE) {
      if (!wtMap[r.workType]) wtMap[r.workType] = 0;
      wtMap[r.workType] += (r.normalMin||0) + (r.otMin||0) + (r.partyMin||0) + (r.vacationMin||0);
    }
  });

  const entries = Object.entries(wtMap).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
  
  container.innerHTML = entries.map(([type, min]) => {
    const pct = Math.round(min / totalAll * 100);
    return `<div class="wt-summary-item" style="margin-bottom: 8px;">
      <div style="flex: 1;">
        <div style="font-size: 0.85rem; margin-bottom: 2px;">${type}</div>
        <div class="wt-bar-wrap" style="height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
          <div class="wt-bar" style="width:${pct}%; height: 100%; background: var(--primary);"></div>
        </div>
      </div>
      <div style="text-align:right; min-width:70px; margin-left: 10px;">
        <div style="font-weight: bold; font-size: 0.9rem;">${fmtMin(min)}</div>
        <div style="font-size: 0.75rem; color: #6c757d;">${pct}%</div>
      </div>
    </div>`;
  }).join('');
}

function renderMonthlyWTSummary(monthRecs, totalAll) {
  const wtMap = {};
  WORK_TYPES.forEach(t => wtMap[t] = 0);
  wtMap[PARTY_TYPE] = 0;
  monthRecs.forEach(r => {
    if (r.workType && r.workType !== BREAK_TYPE) {
      if (!wtMap[r.workType]) wtMap[r.workType] = 0;
      wtMap[r.workType] += (r.normalMin||0) + (r.otMin||0) + (r.partyMin||0) + (r.vacationMin||0);
    }
  });
  const list    = document.getElementById('wt-summary-list');
  const entries = Object.entries(wtMap).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
  if (entries.length === 0) {
    list.innerHTML = '<div class="text-sub text-sm text-center" style="padding:8px;">記録なし</div>';
    return;
  }
  list.innerHTML = entries.map(([type, min]) => {
    const pct = totalAll > 0 ? Math.round(min / totalAll * 100) : 0;
    return `<div class="wt-summary-item">
      <div>
        <div>${type}</div>
        <div class="wt-bar-wrap"><div class="wt-bar" style="width:${pct}%"></div></div>
      </div>
      <div style="text-align:right;min-width:80px;">
        <div class="fw-bold">${fmtMin(min)}</div>
        <div class="text-sub text-sm">${pct}%</div>
      </div>
    </div>`;
  }).join('');
}

function renderMonthlyRecords(monthRecs) {
  const container = document.getElementById('monthly-records');
  const byDate = {};
  monthRecs.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });
  const dates = Object.keys(byDate).sort();
  if (dates.length === 0) {
    container.innerHTML = '<div class="text-center text-sub text-sm" style="padding:16px;">記録なし</div>';
    return;
  }
  container.innerHTML = dates.map(date => {
    const recs      = byDate[date];
    const normalMin  = recs.reduce((s,r) => s + (r.normalMin||0), 0);
    const otMin      = recs.reduce((s,r) => s + (r.otMin||0), 0);
    const breakMin   = recs.reduce((s,r) => s + (r.breakMin||0), 0);
    const partyMin   = recs.reduce((s,r) => s + (r.partyMin||0), 0);
    const vacationMin = recs.reduce((s,r) => s + (r.vacationMin||0), 0);
    
    // 時間休の時間を計算
    const ds = dayStatuses.find(s => s.date === date);
    let hourlyHours = 0;
    if (ds && ds.status === 'hourly' && ds.startTime && ds.endTime) {
      hourlyHours = calculateHours(ds.startTime, ds.endTime);
    }
    const hourlyMin = Math.round(hourlyHours * 60);
    
    const d         = new Date(date + 'T00:00:00');
    const dayNames  = ['日','月','火','水','木','金','土'];
    const dow       = dayNames[d.getDay()];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isHol     = isHolidayOrSpecial(date);
    const dateColor = isHol ? '#e53935' : 'var(--primary)';
    return `<div class="monthly-record-item" onclick="openDayDetail('${date}')">
      <div class="mr-date" style="color:${dateColor};">${date}（${dow}）</div>
      <div class="mr-row">
        ${normalMin > 0 ? `<span>通常: ${fmtMin(normalMin)}</span>` : ''}
        ${otMin > 0 ? `<span>時間外: ${fmtMin(otMin)}</span>` : ''}
        ${vacationMin > 0 ? `<span>休暇中業務: ${fmtMin(vacationMin)}</span>` : ''}
        ${breakMin > 0 ? `<span>休憩: ${fmtMin(breakMin)}</span>` : ''}
        ${partyMin > 0 ? `<span>懇親会: ${fmtMin(partyMin)}</span>` : ''}
        ${hourlyMin > 0 ? `<span>時間休: ${fmtMin(hourlyMin)}</span>` : ''}
        ${(normalMin === 0 && otMin === 0 && vacationMin === 0 && breakMin === 0 && partyMin === 0) ? '<span class="text-sub">記録あり</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// 日別詳細モーダル（月次から）
// ============================================================
function openDayDetail(date) {
  const d = new Date(date + 'T00:00:00');
  const dayNames = ['日','月','火','水','木','金','土'];
  document.getElementById('day-detail-title').textContent = `${date}（${dayNames[d.getDay()]}）の記録`;

  const dayRecs = records.filter(r => r.date === date)
    .sort((a,b) => a.startTime.localeCompare(b.startTime));
  const container = document.getElementById('day-detail-records');

  if (dayRecs.length === 0) {
    container.innerHTML = '<div class="text-sub text-sm text-center" style="padding:16px;">記録なし</div>';
  } else {
    container.innerHTML = dayRecs.map(r => {
      const startStr = fmtTime(new Date(r.startTime));
      const endStr   = r.endTime ? fmtTime(new Date(r.endTime)) : '進行中';
      const durMin   = r.endTime ? Math.floor((new Date(r.endTime) - new Date(r.startTime)) / 60000) : 0;
      const dIsSpecial = r.isSpecialDay !== undefined ? r.isSpecialDay : isHolidayOrSpecial(r.date);
      let dBadges = '';
      let dCls = '';
      if (r.type === BREAK_TYPE) {
        dCls = 'break-rec'; dBadges += '<span class="rec-badge badge-break">休憩</span>';
      } else if (r.workType === PARTY_TYPE) {
        dCls = 'party-rec'; dBadges += '<span class="rec-badge badge-party">懇親会</span>';
      } else if (dIsSpecial || (r.otMin > 0 && r.normalMin === 0)) {
        dCls = 'overtime'; dBadges += '<span class="rec-badge badge-ot">時間外</span>';
      } else if (r.otMin > 0) {
        dBadges += '<span class="rec-badge badge-ot">一部時間外</span>';
      }
      if (r.modified) { dCls += ' modified'; dBadges += '<span class="rec-badge badge-mod">修正済</span>'; }
      return `<div class="today-hist-item ${dCls}" onclick="openEditModal('${r.id}');closeDayDetailModal();">
        <div class="hist-header">
          <span class="hist-type">${r.workType}${dBadges}</span>
          <span class="hist-time">${startStr}〜${endStr}</span>
        </div>
        <div class="hist-detail">
          ${durMin > 0 ? fmtMin(durMin) : ''}
          ${r.normalMin > 0 ? ' 通常:' + fmtMin(r.normalMin) : ''}
          ${r.otMin > 0 ? ' 時間外:' + fmtMin(r.otMin) : ''}
          ${r.breakMin > 0 ? ' 休憩:' + fmtMin(r.breakMin) : ''}
          ${r.partyMin > 0 ? ' 懇親会:' + fmtMin(r.partyMin) : ''}
          ${r.memo ? ' | ' + r.memo : ''}
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('day-detail-modal').classList.add('open');
}

function closeDayDetailModal() {
  document.getElementById('day-detail-modal').classList.remove('open');
}

// ============================================================
// 記録修正モーダル
// ============================================================
function openEditModal(id) {
  const rec = records.find(r => r.id === id);
  if (!rec) return;
  document.getElementById('edit-record-id').value = id;
  document.getElementById('edit-type').value       = rec.workType;
  document.getElementById('edit-start').value      = toDatetimeLocal(new Date(rec.startTime));
  document.getElementById('edit-end').value        = rec.endTime ? toDatetimeLocal(new Date(rec.endTime)) : '';
  document.getElementById('edit-memo').value       = rec.memo || '';
  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
}

function saveEdit() {
  const id     = document.getElementById('edit-record-id').value;
  const type   = document.getElementById('edit-type').value;
  const startV = document.getElementById('edit-start').value;
  const endV   = document.getElementById('edit-end').value;
  const memo   = document.getElementById('edit-memo').value.trim();

  if (!startV) { showToast('開始日時を入力してください'); return; }

  const idx = records.findIndex(r => r.id === id);
  if (idx === -1) return;

  const startDt = new Date(startV);
  const endDt   = endV ? new Date(endV) : null;
  if (endDt && endDt <= startDt) { showToast('終了時刻は開始時刻より後にしてください'); return; }

  const dateStr = toDateStr(startDt);
  const rec     = records[idx];
  rec.workType  = type;
  rec.type      = type === BREAK_TYPE ? BREAK_TYPE : (type === PARTY_TYPE ? PARTY_TYPE : 'work');
  rec.startTime = startDt.toISOString();
  rec.endTime   = endDt ? endDt.toISOString() : rec.endTime;
  rec.memo      = memo;
  rec.date      = dateStr;
  rec.modified  = true;

  if (endDt) {
    if (rec.type === BREAK_TYPE) {
      rec.breakMin  = Math.floor((endDt - startDt) / 60000);
      rec.normalMin = 0; rec.otMin = 0; rec.partyMin = 0; rec.vacationMin = 0;
    } else if (rec.workType === PARTY_TYPE) {
      rec.partyMin  = Math.floor((endDt - startDt) / 60000);
      rec.normalMin = 0; rec.otMin = 0; rec.breakMin = 0; rec.vacationMin = 0;
    } else {
      calculateRecordMinutes(rec);
    }
  }

  saveRecords();
  closeEditModal();
  if (currentPage === 'today')   renderTodayPage();
  if (currentPage === 'monthly') renderMonthlyPage();
  showToast('記録を修正しました');
}

function deleteRecord() {
  const id = document.getElementById('edit-record-id').value;
  if (!confirm('この記録を削除しますか？')) return;
  records = records.filter(r => r.id !== id);
  saveRecords();
  closeEditModal();
  if (currentPage === 'today')   renderTodayPage();
  if (currentPage === 'monthly') renderMonthlyPage();
  showToast('記録を削除しました');
}

// ============================================================
// 新規追加モーダル
// ============================================================
function openNewRecordModal() {
  const now = new Date();
  const typeEl  = document.getElementById('new-record-type');
  const startEl = document.getElementById('new-record-start');
  const endEl   = document.getElementById('new-record-end');
  const memoEl  = document.getElementById('new-record-memo');
  if (typeEl)  typeEl.value  = WORK_TYPES[0];
  if (startEl) startEl.value = toDatetimeLocal(now);
  if (endEl)   endEl.value   = toDatetimeLocal(now);
  if (memoEl)  memoEl.value  = '';
  document.getElementById('new-record-modal').classList.add('open');
}

function closeNewRecordModal() {
  document.getElementById('new-record-modal').classList.remove('open');
}

function saveNewRecord() {
  const type   = document.getElementById('new-record-type').value;
  const startV = document.getElementById('new-record-start').value;
  const endV   = document.getElementById('new-record-end').value;
  const memo   = (document.getElementById('new-record-memo').value || '').trim();

  if (!startV || !endV) { showToast('開始・終了日時を入力してください'); return; }
  const startDt = new Date(startV);
  const endDt   = new Date(endV);
  if (endDt <= startDt) { showToast('終了時刻は開始時刻より後にしてください'); return; }

  const rec = {
    id:        genId(),
    workType:  type,
    type:      type === BREAK_TYPE ? BREAK_TYPE : (type === PARTY_TYPE ? PARTY_TYPE : 'work'),
    startTime: startDt.toISOString(),
    endTime:   endDt.toISOString(),
    date:      toDateStr(startDt),
    memo:      memo,
    modified:  true
  };
  calculateRecordMinutes(rec);
  records.push(rec);
  saveRecords();
  closeNewRecordModal();
  renderTodayPage();
  showToast('記録を追加しました');
}

// ============================================================
// 設定画面
// ============================================================
function loadSettingsForm() {
  if (!currentUser) return;
  document.getElementById('cfg-emp-id').value = currentUser.empId || '';
  document.getElementById('cfg-name').value   = currentUser.name;
  document.getElementById('cfg-dept').value   = currentUser.dept;
  document.getElementById('cfg-role').value   = currentUser.role || '';
  document.getElementById('cfg-start').value  = currentUser.workStart;
  document.getElementById('cfg-end').value    = currentUser.workEnd;
  document.getElementById('cfg-break-start').value = currentUser.breakStart;
  document.getElementById('cfg-break-end').value   = currentUser.breakEnd;
}

function saveSettings() {
  const empId = document.getElementById('cfg-emp-id').value.trim();
  const name  = document.getElementById('cfg-name').value.trim();
  const dept  = document.getElementById('cfg-dept').value.trim();
  const role  = document.getElementById('cfg-role').value.trim();
  const start = document.getElementById('cfg-start').value;
  const end   = document.getElementById('cfg-end').value;
  const bStart = document.getElementById('cfg-break-start').value;
  const bEnd   = document.getElementById('cfg-break-end').value;

  if (!/^\d{6}$/.test(empId)) { showToast('社員番号は6桁の数字で入力してください'); return; }
  if (!name) { showToast('氏名を入力してください'); return; }
  
  currentUser = { ...currentUser, empId, name, dept, role, workStart: start, workEnd: end, breakStart: bStart, breakEnd: bEnd };
  saveUser();
  updateHeaderUser();
  showToast('設定を保存しました');
}

// ============================================================
// 祝日・休日設定カレンダー
// ============================================================
function changeSettingsMonth(delta) {
  settingsMonth.month += delta;
  if (settingsMonth.month > 12) { settingsMonth.month = 1;  settingsMonth.year++; }
  if (settingsMonth.month < 1)  { settingsMonth.month = 12; settingsMonth.year--; }
  renderSettingsCalendar();
}

function renderSettingsCalendar() {
  const ym = `${settingsMonth.year}-${String(settingsMonth.month).padStart(2,'0')}`;
  const labelEl = document.getElementById('settings-calendar-month');
  if (!labelEl) return; // 要素が存在しない場合は何もしない
  labelEl.textContent = `${settingsMonth.year}年${settingsMonth.month}月`;
  
  const grid = document.getElementById('settings-calendar-grid');
  if (!grid) return; // 要素が存在しない場合は何もしない
  grid.innerHTML = '';
  
  const firstDay = new Date(settingsMonth.year, settingsMonth.month - 1, 1);
  const lastDay  = new Date(settingsMonth.year, settingsMonth.month, 0);
  
  // 曜日のラベル
  ['日','月','火','水','木','金','土'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-header';
    el.textContent = d;
    grid.appendChild(el);
  });
  
  // 空白
  for (let i = 0; i < firstDay.getDay(); i++) {
    grid.appendChild(document.createElement('div'));
  }
  
  // 日付
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${ym}-${String(d).padStart(2,'0')}`;
    const status  = dayStatuses.find(s => s.date === dateStr);
    const el = document.createElement('div');
    el.className = 'cal-day';
    el.dataset.date = dateStr;
    if (status) {
      const statusMap = { holiday: 'is-holiday', paid: 'is-paid', hourly: 'is-hourly', special: 'is-special' };
      if (statusMap[status.status]) el.classList.add(statusMap[status.status]);
    } else {
      // ユーザー設定がない場合、日本の祝日データで自動判定
      if (getJapanHolidayName(dateStr)) el.classList.add('is-holiday');
    }
    // 土日の色
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    if (dow === 0) el.classList.add('sun');
    if (dow === 6) el.classList.add('sat');
    // 今日のハイライト
    if (dateStr === toDateStr(new Date())) el.classList.add('today');
    // 選択状態
    if (dateStr === selectedCalendarDate) el.classList.add('cal-selected');
    
    const holidayName = getJapanHolidayName(dateStr);
    let content = `<span>${d}</span>`;
    // 祝日名を小さく表示（ユーザー設定がない祝日のみ）
    if (!status && holidayName) {
      content += `<span class="cal-holiday-name">${holidayName}</span>`;
    }
    if (status && status.status === 'hourly' && status.startTime && status.endTime) {
      content += `<span class="cal-hourly-time">${status.startTime}-${status.endTime}</span>`;
    }
    el.innerHTML = content;
    el.onclick = () => openDayStatusModal(dateStr);
    grid.appendChild(el);
  }
}

// 現在選択中の日付（カレンダークリックで設定）
let selectedCalendarDate = null;

function openDayStatusModal(date) {
  selectedCalendarDate = date;
  
  // カレンダーの選択状態を更新
  document.querySelectorAll('.cal-day').forEach(el => el.classList.remove('cal-selected'));
  // クリックされた日付をハイライト
  const clickedEls = document.querySelectorAll('.cal-day');
  clickedEls.forEach(el => {
    if (el.dataset && el.dataset.date === date) el.classList.add('cal-selected');
  });
  const status = dayStatuses.find(s => s.date === date);
  
  // holiday-type-selectの値を設定
  const typeSelect = document.getElementById('holiday-type-select');
  if (typeSelect) typeSelect.value = status ? status.status : 'none';
  
  // 時間休フォームの表示制御
  const hourlyGroup = document.getElementById('hourly-time-group');
  if (hourlyGroup) {
    hourlyGroup.style.display = (status && status.status === 'hourly') ? 'block' : 'none';
  }
  if (status && status.status === 'hourly') {
    // 時間休の既存値をセレクトボックスに反映
    const startSel = document.getElementById('hourly-start-input');
    const endSel   = document.getElementById('hourly-end-input');
    if (startSel && startSel.options.length === 0) buildTimeOptions(startSel, status.startTime || '08:30');
    else if (startSel) startSel.value = status.startTime || '08:30';
    if (endSel   && endSel.options.length === 0)   buildTimeOptions(endSel,   status.endTime   || '09:00');
    else if (endSel)   endSel.value   = status.endTime   || '09:00';
  }
  
  showToast(`${date}を選択しました`);
}

function buildTimeOptions(selectEl, selectedVal) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 10) {
      const val = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      if (val === selectedVal) opt.selected = true;
      selectEl.appendChild(opt);
    }
  }
}

function toggleHourlyTimeGroup() {
  const type = document.getElementById('holiday-type-select').value;
  const group = document.getElementById('hourly-time-group');
  if (!group) return;
  if (type === 'hourly') {
    group.style.display = 'block';
    // 初回表示時に選択肢を生成
    const startSel = document.getElementById('hourly-start-input');
    const endSel   = document.getElementById('hourly-end-input');
    if (startSel && startSel.options.length === 0) buildTimeOptions(startSel, '08:30');
    if (endSel   && endSel.options.length === 0)   buildTimeOptions(endSel,   '09:00');
  } else {
    group.style.display = 'none';
  }
}

function applyHoliday() {
  if (!selectedCalendarDate) { showToast('カレンダーから日付を選択してください'); return; }
  
  const type = document.getElementById('holiday-type-select').value;
  const date = selectedCalendarDate;
  
  dayStatuses = dayStatuses.filter(s => s.date !== date);
  
  if (type !== 'none') {
    const newStatus = { date, status: type };
    if (type === 'hourly') {
      const startSel = document.getElementById('hourly-start-input');
      const endSel   = document.getElementById('hourly-end-input');
      const startVal = startSel ? startSel.value : '';
      const endVal   = endSel   ? endSel.value   : '';
      if (!startVal || !endVal) { showToast('時間休の開始・終了時刻を選択してください'); return; }
      if (startVal >= endVal) { showToast('終了時刻は開始時刻より後にしてください'); return; }
      newStatus.startTime = startVal;
      newStatus.endTime   = endVal;
    }
    dayStatuses.push(newStatus);
  }
  
  saveDayStatuses();
  renderSettingsCalendar();
  showToast('保存しました');
}

function isHolidayOrSpecial(dateStr, targetTime = null) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true; // 土日
  
  // 日本の祝日データで自動判定
  if (getJapanHolidayName(dateStr)) return true;
  
  const status = dayStatuses.find(s => s.date === dateStr);
  if (status) {
    if (status.status === 'holiday' || status.status === 'paid' || status.status === 'special') return true;
    
    // 時間休の場合、targetTime（Dateオブジェクト）が指定されていれば、その時間が時間休の範囲内か判定
    if (status.status === 'hourly' && targetTime) {
      const [sh, sm] = status.startTime.split(':').map(Number);
      const [eh, em] = status.endTime.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const targetMin = targetTime.getHours() * 60 + targetTime.getMinutes();
      
      if (targetMin >= startMin && targetMin < endMin) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================
// データ管理
// ============================================================
function exportJSON() {
  const data = {
    user: currentUser,
    records: records,
    dayStatuses: dayStatuses
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stm_backup_${toDateStr(new Date())}.json`;
  a.click();
}

function resetAll() {
  if (!confirm('すべてのデータを削除して初期化しますか？（この操作は取り消せません）')) return;
  localStorage.clear();
  location.reload();
}

// ============================================================
// CSV出力（LINE WORKS連携）
// ============================================================
function exportCSV() {
  if (!currentUser) return;
  const ym = `${viewMonth.year}-${String(viewMonth.month).padStart(2,'0')}`;
  const monthRecs = records.filter(r => r.date && r.date.startsWith(ym))
    .sort((a,b) => a.startTime.localeCompare(b.startTime));

  if (monthRecs.length === 0) { showToast('出力するデータがありません'); return; }

  // ヘッダー
  let csv = '\uFEFF'; // BOM
  csv += '社員番号,氏名,部門,役職,日付,曜日,業務区分,開始時間,終了時間,通常(分),時間外(分),休憩(分),懇親会(分),休暇中業務(分),メモ\n';

  const dayNames = ['日','月','火','水','木','金','土'];

  monthRecs.forEach(r => {
    const d = new Date(r.date + 'T00:00:00');
    const dow = dayNames[d.getDay()];
    const startT = fmtTime(new Date(r.startTime));
    const endT   = r.endTime ? fmtTime(new Date(r.endTime)) : '';
    
    const row = [
      currentUser.empId || '',
      currentUser.name,
      currentUser.dept,
      currentUser.role || '',
      r.date,
      dow,
      r.workType,
      startT,
      endT,
      r.normalMin || 0,
      r.otMin || 0,
      r.breakMin || 0,
      r.partyMin || 0,
      r.vacationMin || 0,
      (r.memo || '').replace(/,/g, ' ')
    ];
    csv += row.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const fileName = `${viewMonth.year}年${viewMonth.month}月分_業務報告_${currentUser.name}.csv`;

  if (navigator.share) {
    const file = new File([blob], fileName, { type: 'text/csv' });
    navigator.share({
      files: [file],
      title: fileName
    }).catch(() => {
      _downloadFallback(blob, fileName);
    });
  } else {
    _downloadFallback(blob, fileName);
  }
}

function _downloadFallback(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
}

// ============================================================
// ユーティリティ
// ============================================================
function genId() { return Math.random().toString(36).substr(2, 9); }
function toDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtTime(d) {
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
function fmtMin(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2,'0')}`;
}
function toDatetimeLocal(d) {
  const offset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - offset);
  return local.toISOString().slice(0, 16);
}
function calculateHours(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function updateDayStatusBanner() {
  const banner = document.getElementById('day-status-banner');
  if (!banner) return; // 要素が存在しない場合は何もしない
  const today = toDateStr(new Date());
  const status = dayStatuses.find(s => s.date === today);
  
  if (status && status.status !== 'normal') {
    let label = '';
    switch(status.status) {
      case 'holiday': label = '【本日は休日設定です】'; break;
      case 'paid':    label = '【本日は有給休暇設定です】'; break;
      case 'special': label = '【本日は特別休暇設定です】'; break;
      case 'hourly':  label = `【本日は時間休設定です（${status.startTime}～${status.endTime}）】`; break;
    }
    banner.textContent = label;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

function checkStaleSession() {
  if (!activeSession) return;
  const start = new Date(activeSession.startTime);
  const today = new Date();
  if (start.getDate() !== today.getDate() || start.getMonth() !== today.getMonth()) {
    const confirmed = confirm('前日の業務が終了していません。昨日の23:59で終了したことにして記録を保存しますか？\n\n[はい] 23:59で終了保存\n[いいえ] 記録を破棄して新しく開始');
    if (confirmed) {
      const end = new Date(start);
      end.setHours(23, 59, 0, 0);
      endSessionAt(end);
    } else {
      activeSession = null;
      saveActive();
      updateHomeStatus();
    }
  }
}

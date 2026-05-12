/* ============================================================
   営業部 業務時間管理 app.js  v1.11
   - localStorage ベース（サーバー不要・費用ゼロ）
   - PWA対応（オフライン動作）
   ============================================================ */
'use strict';

// ============================================================
// 定数
// ============================================================
const WORK_TYPES = ['九電碍・点','九電管路','他電力碍・点','直送商','在庫商','再エネ','TKD','社内対応'];
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
let selectedWorkType = null;

// ============================================================
// 初期化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  if (!currentUser || !currentUser.name) {
    showSetupScreen();
  } else {
    initApp();
  }
  registerSW();
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
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
  document.getElementById('setup-screen').style.display = 'block';
}
function hideSetupScreen() {
  document.getElementById('setup-screen').style.display = 'none';
}
function saveSetup() {
  const empId = document.getElementById('setup-emp-id').value.trim();
  const name  = document.getElementById('setup-name').value.trim();
  const dept  = document.getElementById('setup-dept').value.trim();
  const start = document.getElementById('setup-start').value || '08:30';
  const end   = document.getElementById('setup-end').value   || '17:30';
  const bStart = document.getElementById('setup-break-start').value || '12:00';
  const bEnd   = document.getElementById('setup-break-end').value   || '13:00';
  
  if (!/^\d{6}$/.test(empId)) { showToast('社員番号は6桁の数字で入力してください'); return; }
  if (!name) { showToast('氏名を入力してください'); return; }
  if (!dept) { showToast('部門を選択してください'); return; }
  
  currentUser = { empId, name, dept, workStart: start, workEnd: end, breakStart: bStart, breakEnd: bEnd };
  saveUser();
  hideSetupScreen();
  initApp();
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
  showPage('home');
}

function updateHeaderUser() {
  if (!currentUser) return;
  document.getElementById('header-name').textContent = `${currentUser.empId || ''} ${currentUser.name}`;
  document.getElementById('header-dept').textContent = currentUser.dept;
}

// ============================================================
// ページ切り替え
// ============================================================
function showPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-' + page).classList.add('active');

  if (page === 'today')    renderTodayPage();
  if (page === 'monthly')  renderMonthlyPage();
  if (page === 'settings') { loadSettingsForm(); renderSettingsCalendar(); }
}

// ============================================================
// ホーム画面の状態更新
// ============================================================
function updateHomeStatus() {
  const nameEl    = document.getElementById('home-work-name');
  const badgeEl   = document.getElementById('home-state-badge');

  if (!activeSession) {
    nameEl.textContent = '業務未開始';
    setBadge(badgeEl, '待機中', 'state-idle');
  } else if (activeSession.type === BREAK_TYPE) {
    nameEl.textContent = '休憩中';
    setBadge(badgeEl, '休憩中', 'state-break');
  } else if (activeSession.workType === PARTY_TYPE) {
    nameEl.textContent = '懇親会対応';
    setBadge(badgeEl, '懇親会中', 'state-party');
  } else {
    nameEl.textContent = activeSession.workType || '---';
    // 通常 or 時間外判定
    const stateLabel = isCurrentOT() ? '時間外業務' : '通常業務';
    setBadge(badgeEl, stateLabel, 'state-working');
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
  if (isHolidayOrSpecial(today)) return true;
  const [sh, sm] = currentUser.workStart.split(':').map(Number);
  const [eh, em] = currentUser.workEnd.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin   = eh * 60 + em;
  const nowMin   = now.getHours() * 60 + now.getMinutes();
  return nowMin < startMin || nowMin >= endMin;
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

function _startNewWork(workType, btn) {
  let memo = "";
  if (workType === PARTY_TYPE) {
    const inputMemo = prompt("懇親会対応のメモを入力してください（誰と何のために）:", "");
    if (inputMemo === null || inputMemo.trim() === "") {
      showToast("懇親会対応の場合、メモは必須です。");
      return;
    }
    memo = inputMemo.trim();
  }
  const now = new Date();
  activeSession = {
    id:        genId(),
    workType:  workType,
    type:      workType === PARTY_TYPE ? PARTY_TYPE : 'work',
    startTime: now.toISOString(),
    memo:      memo
  };
  saveActive();
  selectedWorkType = workType;
  document.querySelectorAll('.wt-btn').forEach(b => b.classList.remove('selected'));
  if (btn) btn.classList.add('selected');
  idleStartTime = null; // 待機タイマーリセット
  checkWarnConditions(); // 警告バナー即時更新
  updateHomeStatus();
  updateElapsed();
  if (currentPage === 'today') renderTodayPage();
  showToast(`「${workType}」を開始しました`);
}// ============================================================
// 円グラフ描画 (Chart.js)
// ============================================================
let charts = {};
function renderPieChart(canvasId, dataMap) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  // 既存のチャートがあれば破棄
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const labels = Object.keys(dataMap).filter(k => dataMap[k] > 0);
  const data   = labels.map(k => dataMap[k]);
  
  if (data.length === 0) {
    ctx.style.display = 'none';
    return;
  }
  ctx.style.display = 'block';

  const colors = {
    '通常': '#2c5f7a',
    '時間外': '#e53935',
    '休憩': '#e65100',
    '懇親会': '#6a1b9a',
    '休暇中': '#00897b'
  };

  charts[canvasId] = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: labels.map(l => colors[l] || '#607d8b'),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#ffffff', font: { size: 10 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const h = Math.floor(val / 60);
              const m = val % 60;
              return `${context.label}: ${h}時間${m}分`;
            }
          }
        }
      }
    }
  });
}

// ============================================================
// 業務区分別集計
// ============================================================
function endWork() {
  if (!activeSession || activeSession.type === BREAK_TYPE) {
    showToast('業務中ではありません'); return;
  }
  endCurrentSession();
  idleStartTime = new Date(); // 待機開始時刻をリセット
  checkWarnConditions();     // 警告バナー即時更新
  updateHomeStatus();
  updateElapsed();
  if (currentPage === 'today') renderTodayPage();
  showToast('業務を終了しました');
}
function endCurrentSession() {
  endSessionAt(new Date());
}

function endSessionAt(endTime) {
  if (!activeSession) return;
  const start = new Date(activeSession.startTime);
  const durMin = Math.floor((endTime - start) / 60000);

  const isParty = activeSession.workType === PARTY_TYPE;
  const isBreak = activeSession.type === BREAK_TYPE;
  const dateStr = toDateStr(start);

  let normalMin = 0, otMin = 0, breakMin = 0, partyMin = 0, vacationMin = 0;

  if (isBreak) {
    breakMin = durMin;
  } else if (isParty) {
    partyMin = durMin;
  } else {
    const { normal, ot, vacation } = splitWorkTime(start, endTime, dateStr);
    normalMin = normal;
    otMin     = ot;
    vacationMin = vacation;
  }

  const rec = {
    id: activeSession.id,
    date: dateStr,
    workType: activeSession.workType,
    type: activeSession.type,
    startTime: activeSession.startTime,
    endTime: endTime.toISOString(),
    durMin,
    normalMin,
    otMin,
    breakMin,
    partyMin,
    vacationMin,
    memo: activeSession.memo || ''
  };

  records.push(rec);
  saveRecords();
  activeSession = null;
  saveActive();
  updateHomeStatus();
}rrentUser ? currentUser.name : '',
    dept:        currentUser ? currentUser.dept  : '',
    createdAt:   now.toISOString(),
    modified:    false
  };
  records.push(rec);
  saveRecords();
  activeSession = null;
  saveActive();
}

// ============================================================
// 休憩開始
// ============================================================
function startBreak() {
  if (!activeSession || activeSession.type === BREAK_TYPE) {
    showToast('業務中でないと休憩できません'); return;
  }
  endCurrentSession();
  const now = new Date();
  activeSession = {
    id:        genId(),
    workType:  BREAK_TYPE,
    type:      BREAK_TYPE,
    startTime: now.toISOString(),
    memo:      ''
  };
  saveActive();
  checkWarnConditions(); // 警告バナー即時更新（休憩中は警告非表示）
  updateHomeStatus();
  updateElapsed();
  if (currentPage === 'today') renderTodayPage();
  showToast('休憩を開始しました');
}

// 休憩終了（業務再開）は業務区分ボタンのタップで行うため、専用の関数は不要になりました。
// tapWorkType関数内で休憩中のタップを検知し、自動的に休憩を終了して新しい業務を開始します。

// ============================================================
// 通常業務 / 時間外 分割計算
// ============================================================
function splitNormalOT(startDt, endDt) {
  const dateStr = toDateStr(startDt);
  if (isHolidayOrSpecial(dateStr)) {
    return { normal: 0, ot: Math.floor((endDt - startDt) / 60000) };
  }
  if (!currentUser) return { normal: 0, ot: Math.floor((endDt - startDt) / 60000) };

  const [sh, sm] = currentUser.workStart.split(':').map(Number);
  const [eh, em] = currentUser.workEnd.split(':').map(Number);
  const dayBase  = new Date(dateStr + 'T00:00:00');
  const wsMs     = dayBase.getTime() + (sh * 60 + sm) * 60000;
  const weMs     = dayBase.getTime() + (eh * 60 + em) * 60000;

  const sMs = startDt.getTime();
  const eMs = endDt.getTime();

  const overlapStart = Math.max(sMs, wsMs);
  const overlapEnd   = Math.min(eMs, weMs);
  const normalMs     = Math.max(0, overlapEnd - overlapStart);
  const totalMs      = eMs - sMs;
  const otMs         = totalMs - normalMs;

  return {
    normal: Math.floor(normalMs / 60000),
    ot:     Math.floor(otMs    / 60000)
  };
}

function isHolidayOrSpecial(dateStr) {
  const d   = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  if (holidays.some(h => h.date === dateStr)) return true;
  const ds = dayStatuses.find(s => s.date === dateStr);
  if (ds && (ds.status === 'paid' || ds.status === 'hourly' || ds.status === 'holiday')) return true;
  return false;
}

// ============================================================
// 有給・休日バナー
// ============================================================
function updateDayStatusBanner() {
  const today   = toDateStr(new Date());
  const d       = new Date(today + 'T00:00:00');
  const dow     = d.getDay();
  const banner  = document.getElementById('day-status-banner');
  const text    = document.getElementById('day-status-text');
  const ds      = dayStatuses.find(s => s.date === today);
  const holiday = holidays.find(h => h.date === today);

  if (ds && ds.status === 'paid') {
    banner.classList.remove('hidden');
    text.textContent = '本日は有給休暇日です';
  } else if (ds && ds.status === 'hourly') {
    banner.classList.remove('hidden');
    text.textContent = '本日は時間休暇日です';
  } else if (ds && ds.status === 'holiday') {
    banner.classList.remove('hidden');
    text.textContent = '本日は特別休日です';
  } else if (dow === 0 || dow === 6) {
    banner.classList.remove('hidden');
    text.textContent = dow === 0 ? '本日は日曜日（休日）です' : '本日は土曜日（休日）です';
  } else if (holiday) {
    banner.classList.remove('hidden');
    text.textContent = `本日は祝日・特別休日です（${holiday.name}）`;
  } else {
    banner.classList.add('hidden');
  }
}

// ============================================================
// 業務押し忘れ防止：前日未終了セッションチェック
// ============================================================
function checkStaleSession() {
  if (!activeSession) return;
  const today     = toDateStr(new Date());
  const sessDate  = toDateStr(new Date(activeSession.startTime));
  if (sessDate === today) return; // 本日のセッションは正常

  // 前日以前のセッションが残っている
  const startStr = fmtTime(new Date(activeSession.startTime));
  const typeStr  = activeSession.workType || '業務';
  const confirmed = confirm(
    `⚠️ 前回の「${typeStr}」（${sessDate} ${startStr}開始）が終了されずに残っています。\n\n` +
    `[はい] → そのまま終了として記録する\n` +
    `[いいえ] → 記録を削除する`
  );
  if (confirmed) {
    // 前日の終業時刻（設定の終業時刻）で終了として記録
    const sessDateObj = new Date(sessDate + 'T00:00:00');
    const [eh, em]    = (currentUser ? currentUser.workEnd : '17:30').split(':').map(Number);
    const endDt       = new Date(sessDateObj.getTime() + (eh * 60 + em) * 60000);
    const startDt     = new Date(activeSession.startTime);
    const durMin      = Math.floor((endDt - startDt) / 60000);
    if (durMin > 0) {
      const { normal, ot, vacation } = splitWorkTime(startDt, endDt, sessDate);
      records.push({
        id:          activeSession.id,
        workType:    activeSession.workType,
        type:        activeSession.type,
        startTime:   activeSession.startTime,
        endTime:     endDt.toISOString(),
        memo:        (activeSession.memo || '') + '（翌日起動時に自動終了）',
        date:        sessDate,
        normalMin:   normal,
        otMin:       ot,
        vacationMin: vacation,
        breakMin:    0,
        partyMin:    0,
        name:        currentUser ? currentUser.name : '',
        dept:        currentUser ? currentUser.dept  : '',
        createdAt:   new Date().toISOString(),
        modified:    true
      });
      saveRecords();
    }
  }
  activeSession = null;
  saveActive();
  updateHomeStatus();
  showToast(confirmed ? '前回の業務を記録しました' : '前回の未記録セッションを削除しました');
}

// ============================================================
// 業務押し忘れ防止：長時間同一業務・待機中警告タイマー
// ============================================================
const WARN_SAME_WORK_MIN  = 90;  // 同一業務区分でこの分数超過で警告
const WARN_IDLE_MIN       = 10;  // 待機中のままこの分数超過で警告
const WARN_BREAK_MIN      = 10;  // 休憩時間内に休憩未開始で警告
let warnTimer = null;
let idleStartTime = null;  // 待機開始時刻

function startWarnTimer() {
  if (warnTimer) clearInterval(warnTimer);
  idleStartTime = activeSession ? null : new Date();
  warnTimer = setInterval(checkWarnConditions, 60000); // 1分ごとにチェック
  checkWarnConditions(); // 起動時に即時実行
}

function checkWarnConditions() {
  const banner = document.getElementById('warn-banner');
  const text   = document.getElementById('warn-banner-text');
  if (!banner || !text) return;

  const now = new Date();

  // 待機中警告：待機開始からWARN_IDLE_MIN分超過
  if (!activeSession) {
    if (!idleStartTime) idleStartTime = now;
    const idleMin = Math.floor((now - idleStartTime) / 60000);
    const today   = toDateStr(now);
    const isHol   = isHolidayOrSpecial(today);

    if (!isHol && currentUser) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      
      // 1. 休憩時間内のチェック
      const [bsH, bsM] = (currentUser.breakStart || '12:00').split(':').map(Number);
      const [beH, beM] = (currentUser.breakEnd   || '13:00').split(':').map(Number);
      const bStartMin = bsH * 60 + bsM;
      const bEndMin   = beH * 60 + beM;
      
      if (nowMin >= bStartMin && nowMin < bEndMin) {
        const breakIdleMin = Math.floor((now - new Date(today + 'T' + (currentUser.breakStart || '12:00') + ':00')) / 60000);
        if (breakIdleMin >= WARN_BREAK_MIN) {
          banner.classList.remove('hidden');
          text.textContent = `休憩時間ですが休憩が開始されていません（${breakIdleMin}分経過）`;
          return;
        }
      }

      // 2. 就業時間内のチェック
      const [sh, sm] = (currentUser.workStart || '08:30').split(':').map(Number);
      const [eh, em] = (currentUser.workEnd   || '17:30').split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin   = eh * 60 + em;
      
      if (nowMin >= startMin && nowMin < endMin) {
        // 休憩時間は除く
        if (nowMin < bStartMin || nowMin >= bEndMin) {
          if (idleMin >= WARN_IDLE_MIN) {
            banner.classList.remove('hidden');
            text.textContent = `業務未開始のまま ${idleMin}分経過―業務区分をタップしてください`;
            return;
          }
        }
      }
    }
    banner.classList.add('hidden');
    return;
  }

  // 業務中の場合：待機タイマーをリセット
  idleStartTime = null;

  // 休憩中は警告不要
  if (activeSession.type === BREAK_TYPE) {
    banner.classList.add('hidden');
    return;
  }

  // 長時間同一業務区分警告
  const start   = new Date(activeSession.startTime);
  const elapsed = Math.floor((now - start) / 60000);
  if (elapsed >= WARN_SAME_WORK_MIN) {
    banner.classList.remove('hidden');
    text.textContent = `「${activeSession.workType}」を ${elapsed}分継続中―業務区分の切り替えを確認してください`;
  } else {
    banner.classList.add('hidden');
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
  if (isHolidayOrSpecial(today)) return; // 休日は分割不要

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

  // 1. 始業時刻を跨いだ瞬間の自動分割（時間外 → 通常業務）
  if (startMin < startMinTime && nowMin === startMinTime) {
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
      memo:      (memo ? memo + ' ' : '') + '（始業時刻により自動分割）'
    };
    saveActive();
    updateHomeStatus();
    showToast('始業時刻のため履歴を分割しました');
    return;
  }

  // 2. 終業時刻を跨いだ瞬間の自動分割（通常業務 → 時間外）
  if (startMin < endMinTime && nowMin === endMinTime) {
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
      memo:      (memo ? memo + ' ' : '') + '（終業時刻により自動分割）'
    };
    saveActive();
    updateHomeStatus();
    showToast('終業時刻のため履歴を分割しました');
    return;
  }

  // 3. 終業20分後の継続確認
  if (nowMin === endMinTime + 20 && otConfirmedId !== activeSession.id) {
    const confirmed = confirm("終業時刻から20分経過しました。時間外計測を続行しますか？\n\n[はい] 続行する\n[いいえ] 終業時刻で終了する（以降の記録を削除）");
    if (confirmed) {
      otConfirmedId = activeSession.id;
    } else {
      // 終業時刻以降の記録を破棄して終了
      activeSession = null;
      saveActive();
      updateHomeStatus();
      showToast('終業時刻で記録を保存しました');
    }
  }
}

// ============================================================
// 本日ページ
// ============================================================
function renderTodayPage() {
  const today = toDateStr(new Date());
  const d     = new Date(today + 'T00:00:00');
  const dayNames = ['日','月','火','水','木','金','土'];
  document.getElementById('today-date-label').textContent =
    `${today}（${dayNames[d.getDay()]}）`;

  const todayRecs = records.filter(r => r.date === today)
    .sort((a,b) => a.startTime.localeCompare(b.startTime));

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

  // 円グラフの描画
  renderPieChart('todayChart', {
    '通常': sumNormal,
    '時間外': sumOT,
    '休憩': sumBreak,
    '懇親会': sumParty,
    '休暇中': sumVacation
  });

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
  const totalAll    = totalNormal + totalOT;

  document.getElementById('sum-total').textContent  = fmtMin(totalAll);
  document.getElementById('sum-normal').textContent = fmtMin(totalNormal);
  document.getElementById('sum-ot').textContent     = fmtMin(totalOT);
  document.getElementById('sum-vacation').textContent = fmtMin(totalVacation);
  document.getElementById('sum-break').textContent  = fmtMin(totalBreak);
  document.getElementById('sum-party').textContent  = fmtMin(totalParty);

  // 円グラフの描画
  renderPieChart('monthlyChart', {
    '通常': totalNormal,
    '時間外': totalOT,
    '休憩': totalBreak,
    '懇親会': totalParty,
    '休暇中': totalVacation
  });

  renderWTSummary(monthRecs, totalAll);
  renderMonthlyRecords(monthRecs);
}

function renderWTSummary(monthRecs, totalAll) {
  const wtMap = {};
  WORK_TYPES.forEach(t => wtMap[t] = 0);
  wtMap[PARTY_TYPE] = 0;
  monthRecs.forEach(r => {
    if (r.workType && r.workType !== BREAK_TYPE) {
      if (!wtMap[r.workType]) wtMap[r.workType] = 0;
      wtMap[r.workType] += (r.normalMin||0) + (r.otMin||0) + (r.partyMin||0);
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
      const { normal, ot, vacation } = splitWorkTime(startDt, endDt, dateStr);
      rec.normalMin = normal;
      rec.otMin     = ot;
      rec.vacationMin = vacation;
      rec.breakMin  = 0; rec.partyMin = 0;
    }
  }

  records[idx] = rec;
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
// CSV出力
// ============================================================
function exportCSV() {
  const ym = `${viewMonth.year}-${String(viewMonth.month).padStart(2,'0')}`;
  const monthRecs = records.filter(r => r.date && r.date.startsWith(ym))
    .sort((a,b) => a.startTime.localeCompare(b.startTime));
  if (monthRecs.length === 0) { showToast('この月の記録がありません'); return; }

  const BOM     = '\uFEFF';
  const headers = ['社員番号','氏名','部門','日付','業務区分','開始日時','終了日時',
                   '通常業務時間(分)','時間外時間(分)','休暇中業務時間(分)','休憩時間(分)','懇親会対応時間(分)','状態',
                   'メモ','記録作成日時','修正フラグ'];
  const rows = monthRecs.map(r => [
    csvEsc(currentUser ? currentUser.empId : ''),
    csvEsc(r.name || ''),
    csvEsc(r.dept || ''),
    csvEsc(r.date || ''),
    csvEsc(r.workType || ''),
    csvEsc(r.startTime ? fmtDatetime(new Date(r.startTime)) : ''),
    csvEsc(r.endTime   ? fmtDatetime(new Date(r.endTime))   : ''),
    r.normalMin || 0,
    r.otMin     || 0,
    r.vacationMin || 0,
    r.breakMin  || 0,
    r.partyMin  || 0,
    (() => {
      if (r.type === BREAK_TYPE) return '休憩';
      if (r.workType === PARTY_TYPE) return '懇親会';
      if (r.vacationMin > 0) return '休暇中業務';
      if (r.otMin > 0) return '時間外業務';
      return '通常業務';
    })(),
    csvEsc(r.memo || ''),
    csvEsc(r.createdAt ? fmtDatetime(new Date(r.createdAt)) : ''),
    r.modified ? '修正済' : ''
  ]);

  const csv      = BOM + [headers, ...rows].map(row => row.join(',')).join('\r\n');
  const fileName = `業務時間_${currentUser ? currentUser.name : 'data'}_${ym}.csv`;
  const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

  // Web Share API の判定と実行
  // Android Chrome等でCSV形式が拒否される場合があるため、Fileオブジェクトのtypeをtext/plainに緩和
  const file = new File([blob], fileName, { type: 'text/plain' });
  
  // navigator.canShare で事前にチェック
  let canShare = false;
  try {
    canShare = navigator.canShare && navigator.canShare({ files: [file] });
  } catch (e) {
    canShare = false;
  }

  if (canShare && navigator.share) {
    navigator.share({
      files: [file],
      title: '業務時間記録',
      text: `${ym}分の業務時間記録CSVです。`
    }).then(() => {
      showToast('共有メニューを開きました');
    }).catch((err) => {
      console.error('Share failed:', err);
      // ユーザーキャンセル(AbortError)以外はフォールバック
      if (err.name !== 'AbortError') {
        fallbackDownload(blob, fileName);
      }
    });
  } else {
    // 共有非対応、またはファイル共有が拒否された場合
    console.log('Web Share API (files) not supported or rejected');
    fallbackDownload(blob, fileName);
  }
}

function fallbackDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSVをダウンロードしました。LINE WORKSで送信してください');
}

function csvEsc(v) {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ============================================================
// 全データバックアップ
// ============================================================
function exportAllData() {
  const data = { user: currentUser, records, holidays, dayStatuses, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `業務時間バックアップ_${toDateStr(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('バックアップを出力しました');
}

function clearAllData() {
  if (!confirm('全データを削除して初期化します。この操作は元に戻せません。本当によろしいですか？')) return;
  if (!confirm('最終確認：全記録・設定が削除されます。続行しますか？')) return;
  [KEY_USER, KEY_RECORDS, KEY_ACTIVE, KEY_HOLIDAYS, KEY_DAYSTATUS].forEach(k => localStorage.removeItem(k));
  location.reload();
}

// ============================================================
// 設定画面カレンダー
// ============================================================
function changeSettingsMonth(delta) {
  settingsMonth.month += delta;
  if (settingsMonth.month > 12) { settingsMonth.month = 1;  settingsMonth.year++; }
  if (settingsMonth.month < 1)  { settingsMonth.month = 12; settingsMonth.year--; }
  renderSettingsCalendar();
}

function renderSettingsCalendar() {
  const container = document.getElementById('settings-calendar-grid');
  const display   = document.getElementById('settings-calendar-month');
  if (!container || !display) return;

  display.textContent = `${settingsMonth.year}年${settingsMonth.month}月`;

  const firstDay = new Date(settingsMonth.year, settingsMonth.month - 1, 1);
  const lastDay  = new Date(settingsMonth.year, settingsMonth.month, 0);
  const startDow = firstDay.getDay(); // 0:日, 1:月...
  const totalDays = lastDay.getDate();

  let html = '';
  const dayNames = ['日','月','火','水','木','金','土'];
  dayNames.forEach(n => html += `<div class="cal-day-head">${n}</div>`);

  // 前月の埋め
  const prevLastDay = new Date(settingsMonth.year, settingsMonth.month - 1, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    html += `<div class="cal-day other-month">${prevLastDay - i}</div>`;
  }

  const todayStr = toDateStr(new Date());

  // 当月
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${settingsMonth.year}-${String(settingsMonth.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dow     = dateObj.getDay();
    const isToday = dateStr === todayStr;
    
    const ds = dayStatuses.find(s => s.date === dateStr);
    const holiday = holidays.find(h => h.date === dateStr);
    
    let cls = 'cal-day';
    if (isToday) cls += ' today';
    if (dow === 0) cls += ' sun';
    if (dow === 6) cls += ' sat';
    
    // 状態クラス
    let dayContent = d;
    if (holiday || (ds && ds.status === 'holiday')) cls += ' is-holiday';
    else if (ds && ds.status === 'paid') cls += ' is-paid';
    else if (ds && ds.status === 'hourly') {
      cls += ' is-hourly';
      if (ds.startTime && ds.endTime) dayContent += `<br><small>${ds.startTime}-${ds.endTime}</small>`;
    }

    html += `<div class="${cls}" onclick="toggleDayStatus('${dateStr}')">${dayContent}</div>`;
  }

  container.innerHTML = html;
}

function toggleDayStatus(dateStr) {
  // サイクル: Normal -> Holiday -> Paid -> Hourly -> Normal
  const dsIdx = dayStatuses.findIndex(s => s.date === dateStr);
  const currentStatus = dsIdx >= 0 ? dayStatuses[dsIdx].status : 'normal';
  
  // 祝日(holidays配列)に既にある場合は、まずそれを削除してdayStatusesで管理するようにする
  const holIdx = holidays.findIndex(h => h.date === dateStr);
  if (holIdx >= 0) {
    holidays.splice(holIdx, 1);
    saveHolidays();
  }

  let nextStatus = 'normal';
  if (currentStatus === 'normal')  nextStatus = 'holiday';
  else if (currentStatus === 'holiday') nextStatus = 'paid';
  else if (currentStatus === 'paid')    nextStatus = 'normal'; // 時間休(hourly)はタップサイクルから除外
  else if (currentStatus === 'hourly')  nextStatus = 'normal';

  let hours = null;
  const hourlyDateInput = document.getElementById("hourly-date");
  const hourlyStartTimeInput = document.getElementById("hourly-start-time");
  const hourlyEndTimeInput = document.getElementById("hourly-end-time");

  // カレンダーの日付をクリックした際に、下部の時間休入力フォームに値をセット
  if (hourlyDateInput && hourlyStartTimeInput && hourlyEndTimeInput) {
    hourlyDateInput.value = dateStr;
    if (currentStatus === 'hourly' && dsIdx >= 0) {
      hourlyStartTimeInput.value = dayStatuses[dsIdx].startTime || '';
      hourlyEndTimeInput.value = dayStatuses[dsIdx].endTime || '';
    } else {
      hourlyStartTimeInput.value = '';
      hourlyEndTimeInput.value = '';
    }
  }
  if (nextStatus === 'hourly') {
    // 時間休の入力は下部のフォームで行うため、ここではプロンプトを出さない
    // ただし、statusをhourlyに切り替える場合は、一旦デフォルト値で設定しておく
    // フォームからの保存時に上書きされる
    const startTimeInput = dsIdx >= 0 && dayStatuses[dsIdx].startTime ? dayStatuses[dsIdx].startTime : '09:00';
    const endTimeInput = dsIdx >= 0 && dayStatuses[dsIdx].endTime ? dayStatuses[dsIdx].endTime : '13:00';
    hours = calculateHours(startTimeInput, endTimeInput); // 時間計算は必要なので残す


  }

  if (dsIdx >= 0) {
    if (nextStatus === 'normal') {
      dayStatuses.splice(dsIdx, 1);
    } else {
      dayStatuses[dsIdx].status = nextStatus;
      if (nextStatus === 'hourly') {
      // 時間休の具体的な時間は下部のフォームで管理するため、ここではステータスのみ更新
      // フォームからの保存時にstartTime/endTimeが設定される
      dayStatuses[dsIdx].startTime = null;
      dayStatuses[dsIdx].endTime = null;
      } else {
        dayStatuses[dsIdx].startTime = null; // 時間休以外はstartTimeを削除
        dayStatuses[dsIdx].endTime = null;   // 時間休以外はendTimeを削除
      }
    }
  } else {
    if (nextStatus !== 'normal') {
      // 時間休の具体的な時間は下部のフォームで管理するため、ここではステータスのみ更新
      // フォームからの保存時にstartTime/endTimeが設定される
      dayStatuses.push({ date: dateStr, status: nextStatus, startTime: null, endTime: null });
    }
  }

  saveDayStatuses();
  renderSettingsCalendar();
  updateDayStatusBanner();
  if (currentPage === 'monthly') renderMonthlyPage();
  
  const statusLabels = { normal: '通常', holiday: '祝日・休日', paid: '有給休暇', hourly: '時間休暇' };
  showToast(`${dateStr} を ${statusLabels[nextStatus]} に設定しました`);
}

// ============================================================
// ユーザー設定
// ============================================================
function loadSettingsForm() {
  if (!currentUser) return;
  document.getElementById('cfg-emp-id').value = currentUser.empId      || '';
  document.getElementById('cfg-name').value   = currentUser.name       || '';
  document.getElementById('cfg-dept').value   = currentUser.dept       || '';
  document.getElementById('cfg-start').value  = currentUser.workStart  || '08:30';
  document.getElementById('cfg-end').value    = currentUser.workEnd    || '17:30';
  document.getElementById('cfg-break-start').value = currentUser.breakStart || '12:00';
  document.getElementById('cfg-break-end').value   = currentUser.breakEnd   || '13:00';
}

function saveUserConfig() {
  const empId = document.getElementById('cfg-emp-id').value.trim();
  const name  = document.getElementById('cfg-name').value.trim();
  const dept  = document.getElementById('cfg-dept').value.trim();
  const start = document.getElementById('cfg-start').value || '08:30';
  const end   = document.getElementById('cfg-end').value   || '17:30';
  const bStart = document.getElementById('cfg-break-start').value || '12:00';
  const bEnd   = document.getElementById('cfg-break-end').value   || '13:00';
  
  if (!/^\d{6}$/.test(empId)) { showToast('社員番号は6桁の数字で入力してください'); return; }
  if (!name) { showToast('氏名を入力してください'); return; }
  
  currentUser = { empId, name, dept, workStart: start, workEnd: end, breakStart: bStart, breakEnd: bEnd };
  saveUser();
  updateHeaderUser();
  showToast('設定を保存しました');
}

// ============================================================
// ユーティリティ
// ============================================================
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function toDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}
function fmtTime(d) {
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
function fmtDatetime(d) {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${fmtTime(d)}`;
}
function fmtMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2,'0')}`;
}
function toDatetimeLocal(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0') + 'T' +
    String(d.getHours()).padStart(2,'0') + ':' +
    String(d.getMinutes()).padStart(2,'0');
}

// ============================================================
// トースト通知
// ============================================================
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

function calculateHours(startTime, endTime) {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const startDate = new Date();
  startDate.setHours(startH, startM, 0, 0);
  const endDate = new Date();
  endDate.setHours(endH, endM, 0, 0);

  if (endDate < startDate) {
    // 終了時間が開始時間より前の場合は翌日と判断
    endDate.setDate(endDate.getDate() + 1);
  }

  const diffMs = endDate - startDate;
  return diffMs / (1000 * 60 * 60);
}

function saveHourlyLeave() {
  const dateInput = document.getElementById('hourly-date').value;
  const startTimeInput = document.getElementById('hourly-start-time').value;
  const endTimeInput = document.getElementById('hourly-end-time').value;

  if (!dateInput || !startTimeInput || !endTimeInput) {
    showToast('日付、開始時間、終了時間をすべて入力してください。');
    return;
  }

  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(startTimeInput) || !timeRegex.test(endTimeInput)) {
    showToast('無効な時間形式です。HH:MM形式で入力してください。');
    return;
  }

  const hours = calculateHours(startTimeInput, endTimeInput);
  if (hours <= 0) {
    showToast('開始時間は終了時間より前である必要があります。');
    return;
  }

  const dateStr = dateInput;
  const dsIdx = dayStatuses.findIndex(s => s.date === dateStr);

  if (dsIdx >= 0) {
    dayStatuses[dsIdx].status = 'hourly';
    dayStatuses[dsIdx].startTime = startTimeInput;
    dayStatuses[dsIdx].endTime = endTimeInput;
  } else {
    dayStatuses.push({ date: dateStr, status: 'hourly', startTime: startTimeInput, endTime: endTimeInput });
  }

  saveDayStatuses();
  renderSettingsCalendar();
  updateDayStatusBanner();
  if (currentPage === 'monthly') renderMonthlyPage();
  showToast(`${dateStr} の時間休を ${startTimeInput}-${endTimeInput} で設定しました`);
}

function clearHourlyLeave() {
  const dateInput = document.getElementById('hourly-date').value;
  if (!dateInput) {
    showToast('クリアする日付を選択してください。');
    return;
  }

  const dateStr = dateInput;
  const dsIdx = dayStatuses.findIndex(s => s.date === dateStr);

  if (dsIdx >= 0 && dayStatuses[dsIdx].status === 'hourly') {
    dayStatuses.splice(dsIdx, 1);
    saveDayStatuses();
    renderSettingsCalendar();
    updateDayStatusBanner();
    if (currentPage === 'monthly') renderMonthlyPage();
    showToast(`${dateStr} の時間休をクリアしました`);
  } else {
    showToast(`${dateStr} は時間休として設定されていません。`);
  }
  document.getElementById('hourly-date').value = '';
  document.getElementById('hourly-start-time').value = '';
  document.getElementById('hourly-end-time').value = '';
}

// ============================================================
// 新規記録追加モーダル
// ============================================================
function openNewRecordModal() {
  const now = new Date();
  document.getElementById("new-record-start").value = toDatetimeLocal(now);
  document.getElementById("new-record-end").value = toDatetimeLocal(now);
  document.getElementById("new-record-memo").value = "";
  document.getElementById("new-record-type").value = WORK_TYPES[0]; // デフォルトで最初の業務区分を選択
  document.getElementById("new-record-modal").classList.add("open");
}

function closeNewRecordModal() {
  document.getElementById("new-record-modal").classList.remove("open");
}

function saveNewRecord() {
  const type = document.getElementById("new-record-type").value;
  const startV = document.getElementById("new-record-start").value;
  const endV = document.getElementById("new-record-end").value;
  const memo = document.getElementById("new-record-memo").value.trim();

  if (!startV) { showToast("開始日時を入力してください"); return; }
  if (!endV) { showToast("終了日時を入力してください"); return; }

  const startDt = new Date(startV);
  const endDt = new Date(endV);

  if (endDt <= startDt) { showToast("終了時刻は開始時刻より後にしてください"); return; }

  // 懇親会対応の場合、メモを必須にする
  if (type === PARTY_TYPE && !memo) {
    showToast("懇親会対応の場合、メモは必須です（誰と何のために）。");
    return;
  }

  const dateStr = toDateStr(startDt);

  const rec = {
    id: genId(),
    workType: type,
    type: type === BREAK_TYPE ? BREAK_TYPE : (type === PARTY_TYPE ? PARTY_TYPE : "work"),
    startTime: startDt.toISOString(),
    endTime: endDt.toISOString(),
    memo: memo,
    modified: true, // 新規追加も修正扱い
    date: dateStr // 日付を追加
  };

  // 時間計算
  const durMin = Math.floor((endDt - startDt) / 60000);
  if (rec.type === BREAK_TYPE) {
    rec.breakMin = durMin;
    rec.normalMin = 0; rec.otMin = 0; rec.partyMin = 0; rec.vacationMin = 0;
  } else if (rec.workType === PARTY_TYPE) {
    rec.partyMin = durMin;
    rec.normalMin = 0; rec.otMin = 0; rec.breakMin = 0; rec.vacationMin = 0;
  } else {
    const { normal, ot, vacation } = splitWorkTime(startDt, endDt, dateStr);
    rec.normalMin = normal;
    rec.otMin = ot;
    rec.vacationMin = vacation;
    rec.breakMin = 0; rec.partyMin = 0;
  }

  records.push(rec);
  saveRecords();
  closeNewRecordModal();
  renderTodayPage();
  if (currentPage === 'monthly') renderMonthlyPage();
  showToast("新しい記録を追加しました");
}

function splitWorkTime(startDt, endDt, dateStr) {
  let normalMin = 0;
  let otMin = 0;
  let vacationMin = 0;

  // 休暇中の業務判定
  const ds = dayStatuses.find(s => s.date === dateStr);
  const isVacationDay = ds && (ds.status === 'holiday' || ds.status === 'paid' || ds.status === 'hourly');

  if (isVacationDay) {
    vacationMin = Math.floor((endDt - startDt) / 60000);
  } else {
    // 通常業務と時間外業務の判定
    const [workStartH, workStartM] = currentUser.workStart.split(':').map(Number);
    const [workEndH, workEndM] = currentUser.workEnd.split(':').map(Number);

    const workStart = new Date(startDt);
    workStart.setHours(workStartH, workStartM, 0, 0);
    const workEnd = new Date(startDt);
    workEnd.setHours(workEndH, workEndM, 0, 0);

    let current = new Date(startDt);
    while (current < endDt) {
      let nextMinute = new Date(current.getTime() + 60 * 1000);
      if (nextMinute > endDt) nextMinute = new Date(endDt); // 終了時間を超えないように調整

      if (current >= workStart && current < workEnd) {
        normalMin++;
      } else {
        otMin++;
      }
      current = nextMinute;
    }
  }
  return { normal: normalMin, ot: otMin, vacation: vacationMin };
}


// ============================================================
// アプリ化ガイド関数
// ============================================================
function showInstallGuide() {
  const modal = document.getElementById('install-guide-modal');
  const iosGuide = document.getElementById('ios-guide');
  const androidGuide = document.getElementById('android-guide');
  
  // OSを判定
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  
  // 該当するガイドのみを表示
  if (isIOS) {
    iosGuide.style.display = 'block';
    androidGuide.style.display = 'none';
  } else if (isAndroid) {
    iosGuide.style.display = 'none';
    androidGuide.style.display = 'block';
  } else {
    // PCの場合は両方表示
    iosGuide.style.display = 'block';
    androidGuide.style.display = 'block';
  }
  
  modal.style.display = 'flex';
}

function closeInstallGuide() {
  const modal = document.getElementById('install-guide-modal');
  modal.style.display = 'none';
}

// モーダルのクリック時に閉じる処理
document.addEventListener('DOMContentLoaded', () => {
  const installGuideModal = document.getElementById('install-guide-modal');
  if (installGuideModal) {
    installGuideModal.addEventListener('click', (e) => {
      if (e.target === installGuideModal) {
        closeInstallGuide();
      }
    });
  }
});

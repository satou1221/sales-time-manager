/* ============================================================
   営業部 業務時間管理 app.js  v1.2
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
  const name  = document.getElementById('setup-name').value.trim();
  const dept  = document.getElementById('setup-dept').value.trim();
  const start = document.getElementById('setup-start').value || '08:30';
  const end   = document.getElementById('setup-end').value   || '17:30';
  if (!name) { showToast('氏名を入力してください'); return; }
  if (!dept) { showToast('部門を入力してください'); return; }
  currentUser = { name, dept, workStart: start, workEnd: end };
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
  renderHolidayList();
  loadSettingsForm();
  showPage('home');
}

function updateHeaderUser() {
  if (!currentUser) return;
  document.getElementById('header-name').textContent = currentUser.name;
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
  if (page === 'settings') { loadSettingsForm(); renderHolidayList(); }
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
  const now = new Date();
  activeSession = {
    id:        genId(),
    workType:  workType,
    type:      workType === PARTY_TYPE ? PARTY_TYPE : 'work',
    startTime: now.toISOString(),
    memo:      ''
  };
  saveActive();
  selectedWorkType = workType;
  document.querySelectorAll('.wt-btn').forEach(b => b.classList.remove('selected'));
  if (btn) btn.classList.add('selected');
  updateHomeStatus();
  updateElapsed();
  if (currentPage === 'today') renderTodayPage();
  showToast(`「${workType}」を開始しました`);
}

// ============================================================
// 業務終了
// ============================================================
function endWork() {
  if (!activeSession || activeSession.type === BREAK_TYPE) {
    showToast('業務中ではありません'); return;
  }
  endCurrentSession();
  updateHomeStatus();
  updateElapsed();
  if (currentPage === 'today') renderTodayPage();
  showToast('業務を終了しました');
}

function endCurrentSession() {
  if (!activeSession) return;
  const now   = new Date();
  const start = new Date(activeSession.startTime);
  const durMin = Math.floor((now - start) / 60000);

  const isParty = activeSession.workType === PARTY_TYPE;
  const isBreak = activeSession.type === BREAK_TYPE;
  const dateStr = toDateStr(start);

  let normalMin = 0, otMin = 0, breakMin = 0, partyMin = 0;

  if (isBreak) {
    breakMin = durMin;
  } else if (isParty) {
    partyMin = durMin;
  } else {
    const { normal, ot } = splitNormalOT(start, now);
    normalMin = normal;
    otMin     = ot;
    // 土日・祝日・有給の場合、0分記録でも時間外フラグを立てる
    if (isHolidayOrSpecial(dateStr) && durMin === 0) {
      otMin = 0; // 時間は0のままだが、normalMinも0のままにして時間外判定を可能にする
    }
  }

  const rec = {
    id:          activeSession.id,
    name:        currentUser ? currentUser.name : '',
    dept:        currentUser ? currentUser.dept  : '',
    date:        dateStr,
    workType:    activeSession.workType,
    type:        activeSession.type,
    startTime:   activeSession.startTime,
    endTime:     now.toISOString(),
    normalMin, otMin, breakMin, partyMin,
    isSpecialDay: isHolidayOrSpecial(dateStr), // 土日・祝日・有給フラグ
    memo:        activeSession.memo || '',
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
  if (ds && (ds.status === 'paid' || ds.status === 'hourly')) return true;
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
// 本日の状態設定（有給・時間休暇）
// ============================================================
function saveDayStatus() {
  const today  = toDateStr(new Date());
  const status = document.getElementById('cfg-day-status').value;
  dayStatuses  = dayStatuses.filter(s => s.date !== today);
  dayStatuses.push({ date: today, status });
  saveDayStatuses();
  updateDayStatusBanner();
  showToast('本日の状態を設定しました');
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
  const sumBreak  = todayRecs.reduce((s,r) => s + (r.breakMin||0), 0);
  const sumParty  = todayRecs.reduce((s,r) => s + (r.partyMin||0), 0);

  document.getElementById('today-sum-normal').textContent = fmtMin(sumNormal);
  document.getElementById('today-sum-ot').textContent     = fmtMin(sumOT);
  document.getElementById('today-sum-break').textContent  = fmtMin(sumBreak);
  document.getElementById('today-sum-party').textContent  = fmtMin(sumParty);

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

  const totalNormal = monthRecs.reduce((s,r) => s + (r.normalMin||0), 0);
  const totalOT     = monthRecs.reduce((s,r) => s + (r.otMin||0), 0);
  const totalBreak  = monthRecs.reduce((s,r) => s + (r.breakMin||0), 0);
  const totalParty  = monthRecs.reduce((s,r) => s + (r.partyMin||0), 0);
  const totalAll    = totalNormal + totalOT;

  document.getElementById('sum-total').textContent  = fmtMin(totalAll);
  document.getElementById('sum-normal').textContent = fmtMin(totalNormal);
  document.getElementById('sum-ot').textContent     = fmtMin(totalOT);
  document.getElementById('sum-break').textContent  = fmtMin(totalBreak);
  document.getElementById('sum-party').textContent  = fmtMin(totalParty);

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
    const normalMin = recs.reduce((s,r) => s + (r.normalMin||0), 0);
    const otMin     = recs.reduce((s,r) => s + (r.otMin||0), 0);
    const breakMin  = recs.reduce((s,r) => s + (r.breakMin||0), 0);
    const partyMin  = recs.reduce((s,r) => s + (r.partyMin||0), 0);
    const d         = new Date(date + 'T00:00:00');
    const dayNames  = ['日','月','火','水','木','金','土'];
    const dow       = dayNames[d.getDay()];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isHol     = holidays.some(h => h.date === date);
    const dateColor = isWeekend || isHol ? '#e53935' : 'var(--primary)';
    return `<div class="monthly-record-item" onclick="openDayDetail('${date}')">
      <div class="mr-date" style="color:${dateColor};">${date}（${dow}）</div>
      <div class="mr-row">
        <span>通常: ${fmtMin(normalMin)}</span>
        <span>時間外: ${fmtMin(otMin)}</span>
        <span>休憩: ${fmtMin(breakMin)}</span>
        ${partyMin > 0 ? `<span>懇親会: ${fmtMin(partyMin)}</span>` : ''}
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

  const rec     = records[idx];
  rec.workType  = type;
  rec.type      = type === BREAK_TYPE ? BREAK_TYPE : (type === PARTY_TYPE ? PARTY_TYPE : 'work');
  rec.startTime = startDt.toISOString();
  rec.endTime   = endDt ? endDt.toISOString() : rec.endTime;
  rec.memo      = memo;
  rec.modified  = true;

  if (endDt) {
    if (rec.type === BREAK_TYPE) {
      rec.breakMin  = Math.floor((endDt - startDt) / 60000);
      rec.normalMin = 0; rec.otMin = 0; rec.partyMin = 0;
    } else if (rec.workType === PARTY_TYPE) {
      rec.partyMin  = Math.floor((endDt - startDt) / 60000);
      rec.normalMin = 0; rec.otMin = 0; rec.breakMin = 0;
    } else {
      const { normal, ot } = splitNormalOT(startDt, endDt);
      rec.normalMin = normal;
      rec.otMin     = ot;
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
  const headers = ['氏名','部門','日付','業務区分','開始日時','終了日時',
                   '通常業務時間(分)','時間外時間(分)','休憩時間(分)','懇親会対応時間(分)',
                   'メモ','記録作成日時','修正フラグ'];
  const rows = monthRecs.map(r => [
    csvEsc(r.name || ''),
    csvEsc(r.dept || ''),
    csvEsc(r.date || ''),
    csvEsc(r.workType || ''),
    csvEsc(r.startTime ? fmtDatetime(new Date(r.startTime)) : ''),
    csvEsc(r.endTime   ? fmtDatetime(new Date(r.endTime))   : ''),
    r.normalMin || 0,
    r.otMin     || 0,
    r.breakMin  || 0,
    r.partyMin  || 0,
    csvEsc(r.memo || ''),
    csvEsc(r.createdAt ? fmtDatetime(new Date(r.createdAt)) : ''),
    r.modified ? '修正済' : ''
  ]);

  const csv      = BOM + [headers, ...rows].map(row => row.join(',')).join('\r\n');
  const fileName = `業務時間_${currentUser ? currentUser.name : 'data'}_${ym}.csv`;
  const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

  // Web Share API が利用可能な場合（スマホブラウザなど）
  if (navigator.canShare && navigator.share) {
    const file = new File([blob], fileName, { type: 'text/csv' });
    navigator.share({
      files: [file],
      title: '業務時間記録',
      text: `${ym}分の業務時間記録CSVです。`
    }).then(() => {
      showToast('共有メニューを開きました');
    }).catch((err) => {
      console.error('Share failed:', err);
      // ユーザーキャンセル以外の場合はフォールバック
      if (err.name !== 'AbortError') {
        fallbackDownload(blob, fileName);
      }
    });
  } else {
    // PCブラウザなどのフォールバック
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
// 祝日設定
// ============================================================
function addHoliday() {
  const date = document.getElementById('holiday-date').value;
  const name = document.getElementById('holiday-name').value.trim() || '祝日';
  if (!date) { showToast('日付を選択してください'); return; }
  if (holidays.some(h => h.date === date)) { showToast('既に登録済みです'); return; }
  holidays.push({ date, name });
  saveHolidays();
  renderHolidayList();
  document.getElementById('holiday-date').value = '';
  document.getElementById('holiday-name').value = '';
  showToast('祝日を追加しました');
}

function removeHoliday(date) {
  holidays = holidays.filter(h => h.date !== date);
  saveHolidays();
  renderHolidayList();
  showToast('削除しました');
}

function renderHolidayList() {
  const list = document.getElementById('holiday-list');
  if (!list) return;
  if (holidays.length === 0) {
    list.innerHTML = '<div class="text-sub text-sm text-center" style="padding:8px;">登録なし</div>';
    return;
  }
  const sorted = [...holidays].sort((a,b) => a.date.localeCompare(b.date));
  list.innerHTML = sorted.map(h =>
    `<div class="holiday-item">
      <span>${h.date}（${h.name}）</span>
      <button class="btn btn-danger" style="padding:4px 10px;font-size:.75rem;" onclick="removeHoliday('${h.date}')">削除</button>
    </div>`
  ).join('');
}

// ============================================================
// ユーザー設定
// ============================================================
function loadSettingsForm() {
  if (!currentUser) return;
  document.getElementById('cfg-name').value  = currentUser.name       || '';
  document.getElementById('cfg-dept').value  = currentUser.dept       || '';
  document.getElementById('cfg-start').value = currentUser.workStart  || '08:30';
  document.getElementById('cfg-end').value   = currentUser.workEnd    || '17:30';
  const today = toDateStr(new Date());
  const ds    = dayStatuses.find(s => s.date === today);
  if (ds) document.getElementById('cfg-day-status').value = ds.status;
}

function saveUserConfig() {
  const name  = document.getElementById('cfg-name').value.trim();
  const dept  = document.getElementById('cfg-dept').value.trim();
  const start = document.getElementById('cfg-start').value || '08:30';
  const end   = document.getElementById('cfg-end').value   || '17:30';
  if (!name) { showToast('氏名を入力してください'); return; }
  currentUser = { name, dept, workStart: start, workEnd: end };
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

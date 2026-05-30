// ── CONFIG ────────────────────────────────────────────────
const CONFIG = {
  sheetId: '1aukCOcUico2s6udxXmyNPgK8MUIJ-qtt0kj-tvMZIyo',
  webhookUrl: 'https://hook.us2.make.com/6grcqyb621wgpobywyktd0fe0g3q1lmr',
  restaurantName: '봉도니',
  instagramId: 'bongdony_jeju',
};

// ── STATE ─────────────────────────────────────────────────
let state = {
  currentTab: 'home',
  reviewStars: 0,
  reservations: [],
  filteredDate: 'today',
  apiKey: localStorage.getItem('claude_api_key') || '',
  aiLoading: false,
};

let addReviewStars = 5;

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  initStars();
  initTabs();
  updateClock();
  setInterval(updateClock, 1000);
  updateOpenStatus();
  setInterval(updateOpenStatus, 60000); // 매 분마다 영업상태 갱신
  updateReviewCount();
  loadReservations();
});

// ── CLOCK ─────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const days = ['일','월','화','수','목','금','토'];
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  const s = String(now.getSeconds()).padStart(2,'0');
  const dateStr = `${now.getMonth()+1}월 ${now.getDate()}일 ${days[now.getDay()]}요일`;
  const el = document.getElementById('header-date');
  if (el) el.textContent = `${dateStr}  ·  ${h}:${m}:${s}`;
  const dl = document.getElementById('home-date-label');
  if (dl) dl.textContent = dateStr;
}

function updateOpenStatus() {
  const badge = document.getElementById('home-open-status');
  if (!badge) return;
  const h = new Date().getHours();
  const isOpen = h >= 12 && h < 22;
  badge.textContent = isOpen ? '영업 중 🟢' : '영업 종료';
  badge.style.color = isOpen ? '#4ade80' : 'rgba(255,255,255,.4)';
  badge.style.background = isOpen ? 'rgba(74,222,128,.1)' : 'rgba(255,255,255,.05)';
  badge.style.borderColor = isOpen ? 'rgba(74,222,128,.2)' : 'rgba(255,255,255,.12)';
}

// ── TABS ──────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab-item').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  document.querySelectorAll('.page').forEach(p =>
    p.classList.toggle('active', p.id === `page-${tab}`)
  );
  if (tab === 'reservations') renderReservations();
  if (tab === 'crm') renderCRM();
  if (tab === 'home') renderHome();
}

// ── HOME ──────────────────────────────────────────────────
function renderHome() {
  const today = formatDate(new Date(), 'YYYY-MM-DD');
  const todayRes = state.reservations.filter(r => r.date === today);
  const el = document.getElementById('home-today-count');
  const totalEl = document.getElementById('home-total');
  if (el) el.textContent = todayRes.length;
  if (totalEl) totalEl.textContent = state.reservations.length;

  renderNextReservation(todayRes);

  const listEl = document.getElementById('home-recent');
  if (!listEl) return;
  const recent = todayRes.slice(0, 3);
  if (!recent.length) {
    listEl.innerHTML = '<div class="empty"><div class="ei">📋</div>오늘 예약이 없습니다</div>';
    return;
  }
  listEl.innerHTML = recent.map(r => `
    <div class="res-item">
      <div class="res-header">
        <span class="res-name">${escapeHtml(r.name)}</span>
        <span class="res-badge complete">${escapeHtml(r.status || '예약완료')}</span>
      </div>
      <div class="res-detail">🕐 ${escapeHtml(r.time)} &nbsp;·&nbsp; 👥 ${escapeHtml(r.people)}명 &nbsp;·&nbsp; 📞 ${escapeHtml(r.phone)}</div>
    </div>
  `).join('');
}

function renderNextReservation(todayRes) {
  const bannerEl = document.getElementById('home-next-res');
  if (!bannerEl) return;

  // 타이머 정리
  if (window._nextResTimer) {
    clearInterval(window._nextResTimer);
    window._nextResTimer = null;
  }

  const now = new Date();
  const upcoming = todayRes
    .filter(r => r.time && /^\d{1,2}:\d{2}$/.test(r.time.trim()))
    .map(r => {
      const [h, m] = r.time.trim().split(':').map(Number);
      const resTime = new Date();
      resTime.setHours(h, m, 0, 0);
      return { ...r, resTime, diff: resTime - now };
    })
    .filter(r => r.diff > 0)
    .sort((a, b) => a.diff - b.diff);

  if (!upcoming.length) { bannerEl.innerHTML = ''; return; }

  const next = upcoming[0];
  const totalMin = Math.floor(next.diff / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const timeLeft = hours > 0 ? `${hours}시간 ${mins}분 후` : `${mins}분 후`;

  bannerEl.innerHTML = `
    <div class="next-res-card">
      <div class="next-res-label">NEXT RESERVATION</div>
      <div class="next-res-main">
        <span class="next-res-name">${escapeHtml(next.name)}</span>
        <span class="next-res-countdown">${timeLeft}</span>
      </div>
      <div class="next-res-footer">
        <span class="next-res-time">🕐 ${escapeHtml(next.time)}</span>
        <span class="next-res-people">👥 ${escapeHtml(next.people)}명</span>
      </div>
    </div>`;

  window._nextResTimer = setInterval(() => renderNextReservation(todayRes), 60000);
}

// ── REVIEW ────────────────────────────────────────────────
function initStars() {
  document.querySelectorAll('.star').forEach((star, i) => {
    star.addEventListener('click', () => {
      state.reviewStars = i + 1;
      document.querySelectorAll('.star').forEach((s, j) =>
        s.classList.toggle('on', j <= i)
      );
    });
  });
}

async function generateReviews() {
  if (state.aiLoading) { toast('생성 중입니다. 잠시 기다려주세요'); return; }
  if (!state.apiKey) { openSettings(); toast('API 키를 먼저 설정해주세요'); return; }
  const review = document.getElementById('review-text').value.trim();
  if (!review) { toast('리뷰 내용을 입력해주세요'); return; }
  if (!state.reviewStars) { toast('별점을 선택해주세요'); return; }

  const resultsEl = document.getElementById('review-results');
  resultsEl.innerHTML = '<div class="loading"><div class="spinner"></div>AI가 답글을 생성하고 있습니다...</div>';
  state.aiLoading = true;

  const prompt = `당신은 제주도 삼겹살 맛집 "${CONFIG.restaurantName}" 사장님입니다.
아래 손님 리뷰에 대한 답글을 3가지 다른 톤으로 작성해주세요.
리뷰 별점: ${state.reviewStars}점
리뷰 내용: "${review}"
요구사항: 각 3~5문장. 봉도니 따뜻한 브랜드 톤. "고객님" 사용.
1번: 감사하고 따뜻한 톤 / 2번: 전문적이고 격식체 / 3번: 친근하고 캐주얼한 톤
형식: "1. [답글]" "2. [답글]" "3. [답글]"`;

  try {
    const res = await claudeAPI(prompt);
    const items = parseNumberedList(res);
    if (!items.length) throw new Error('답글 생성에 실패했습니다. 다시 시도해주세요.');
    resultsEl.innerHTML = items.slice(0, 3).map((text, i) => `
      <div class="ai-result-item">
        <div class="ai-result-header">
          <div class="result-num">답글 ${i + 1}</div>
          <button class="copy-btn" onclick="copyText(this, \`${text.replace(/`/g,'\\`').replace(/\$/g,'\\$')}\`)">복사</button>
        </div>
        <div class="result-text">${escapeHtml(text)}</div>
      </div>`).join('');
  } catch (e) {
    resultsEl.innerHTML = `<div class="empty"><div class="ei">⚠️</div>${escapeHtml(e.message || 'API 오류가 발생했습니다')}</div>`;
  } finally {
    state.aiLoading = false;
  }
}

function clearReviewForm() {
  document.getElementById('review-text').value = '';
  state.reviewStars = 0;
  document.querySelectorAll('.star').forEach(s => s.classList.remove('on'));
  document.getElementById('review-results').innerHTML = '';
}

// ── SNS ───────────────────────────────────────────────────
async function generateCaptions() {
  if (state.aiLoading) { toast('생성 중입니다. 잠시 기다려주세요'); return; }
  if (!state.apiKey) { openSettings(); toast('API 키를 먼저 설정해주세요'); return; }
  const mood = document.getElementById('sns-mood').value.trim();
  const menu = document.getElementById('sns-menu').value.trim();
  if (!mood) { toast('사진 분위기를 입력해주세요'); return; }

  const resultsEl = document.getElementById('sns-results');
  resultsEl.innerHTML = '<div class="loading"><div class="spinner"></div>AI가 캡션을 생성하고 있습니다...</div>';
  state.aiLoading = true;

  const prompt = `당신은 제주도 삼겹살 맛집 "${CONFIG.restaurantName}"의 인스타그램 마케터입니다.
인스타그램 게시물 캡션 3가지를 작성해주세요.
사진 분위기: ${mood}${menu ? `\n메뉴: ${menu}` : ''}
인스타 계정: @${CONFIG.instagramId} / 위치: 제주시 번영로 589
요구사항: 2~4줄 + 해시태그 10~15개. 제주 감성 강조.
1번: 감성적 시적 / 2번: 정보 중심 / 3번: 친근하고 재미있는 톤
형식: "1. [캡션]\n\n[해시태그]" 3개`;

  try {
    const res = await claudeAPI(prompt);
    const items = parseNumberedList(res);
    if (!items.length) throw new Error('캡션 생성에 실패했습니다. 다시 시도해주세요.');
    resultsEl.innerHTML = items.slice(0, 3).map((text, i) => `
      <div class="ai-result-item">
        <div class="ai-result-header">
          <div class="result-num">캡션 ${i + 1}</div>
          <button class="copy-btn" onclick="copyText(this, \`${text.replace(/`/g,'\\`').replace(/\$/g,'\\$')}\`)">복사</button>
        </div>
        <div class="result-text" style="white-space:pre-wrap">${escapeHtml(text)}</div>
      </div>`).join('');
  } catch (e) {
    resultsEl.innerHTML = `<div class="empty"><div class="ei">⚠️</div>${escapeHtml(e.message || 'API 오류가 발생했습니다')}</div>`;
  } finally {
    state.aiLoading = false;
  }
}

function clearSNSForm() {
  document.getElementById('sns-mood').value = '';
  document.getElementById('sns-menu').value = '';
  document.getElementById('sns-results').innerHTML = '';
}

// ── RESERVATIONS ──────────────────────────────────────────
async function loadReservations() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/export?format=csv&gid=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`시트 로드 오류 (${res.status})`);
    const csv = await res.text();

    // \r\n (Windows) 및 \r (Mac) 줄바꿈 모두 처리
    const rows = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').slice(1).filter(r => r.trim());
    state.reservations = rows.map(row => {
      const cols = parseCSVRow(row);
      return {
        id:      cols[0] || '',
        date:    (cols[1] || '').trim(),
        time:    (cols[2] || '').trim(),
        name:    (cols[3] || '').trim(),
        phone:   (cols[4] || '').trim(),
        people:  (cols[5] || '').trim(),
        request: (cols[6] || '').trim(),
        status:  (cols[7] || '예약완료').trim(),
        channel: (cols[8] || '').trim(),
      };
    }).filter(r => r.name);

    renderHome();
    renderCRM();
    updateReviewCount();
  } catch (e) {
    console.warn('시트 로드 실패:', e.message);
  }
}

function renderReservations() {
  const listEl = document.getElementById('res-list');
  if (!listEl) return;
  const today = formatDate(new Date(), 'YYYY-MM-DD');
  const tomorrow = formatDate(new Date(Date.now() + 86400000), 'YYYY-MM-DD');
  const weekLater = formatDate(new Date(Date.now() + 7 * 86400000), 'YYYY-MM-DD');

  let filtered = [...state.reservations];
  if (state.filteredDate === 'today') filtered = filtered.filter(r => r.date === today);
  else if (state.filteredDate === 'tomorrow') filtered = filtered.filter(r => r.date === tomorrow);
  else if (state.filteredDate === 'week') filtered = filtered.filter(r => r.date >= today && r.date <= weekLater);
  filtered.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty"><div class="ei">📋</div>예약이 없습니다<br>카카오톡으로 예약을 받아보세요</div>';
    return;
  }
  listEl.innerHTML = filtered.map(r => {
    const statusCls = r.status === '방문완료' ? 'visited' : r.status === '취소' ? 'cancel' : 'complete';
    return `
    <div class="res-item">
      <div class="res-header">
        <span class="res-name">${escapeHtml(r.name)}</span>
        <span class="res-badge ${statusCls}">${escapeHtml(r.status)}</span>
      </div>
      <div class="res-detail">
        📅 ${escapeHtml(r.date)} &nbsp;·&nbsp; 🕐 ${escapeHtml(r.time)}<br>
        👥 ${escapeHtml(r.people)}명 &nbsp;·&nbsp; 📞 ${escapeHtml(r.phone)}
        ${r.request && r.request !== '없음' ? `<br>📝 ${escapeHtml(r.request)}` : ''}
      </div>
    </div>`;
  }).join('');
}

function setDateFilter(filter) {
  state.filteredDate = filter;
  document.querySelectorAll('.date-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.filter === filter)
  );
  renderReservations();
}

async function refreshReservations() {
  toast('새로고침 중...');
  await loadReservations();
  renderReservations();
  toast('✅ 새로고침 완료');
}

// ── CRM ───────────────────────────────────────────────────
function renderCRM() {
  const el = document.getElementById('crm-list');
  if (!el) return;

  const customerMap = {};
  state.reservations.forEach(r => {
    if (!r.phone) return;
    if (!customerMap[r.phone]) {
      customerMap[r.phone] = { name: r.name, phone: r.phone, visits: 0, lastDate: '' };
    }
    customerMap[r.phone].visits++;
    if (r.date > customerMap[r.phone].lastDate) customerMap[r.phone].lastDate = r.date;
  });

  const customers = Object.values(customerMap).sort((a, b) => b.visits - a.visits);
  if (!customers.length) {
    el.innerHTML = '<div class="empty"><div class="ei">👥</div>예약 데이터가 없습니다</div>';
    return;
  }
  const today = new Date();
  el.innerHTML = customers.map(c => {
    const grade = c.visits >= 5
      ? { cls: 'grade-vip', label: 'VIP ⭐' }
      : c.visits >= 3
        ? { cls: 'grade-regular', label: '단골' }
        : { cls: 'grade-new', label: '신규' };
    const lastDays = c.lastDate ? Math.floor((today - new Date(c.lastDate)) / 86400000) : 999;
    const alert = lastDays > 30 ? ' ⚠️' : '';
    return `
      <div class="crm-item">
        <div class="crm-avatar">${c.visits >= 5 ? '⭐' : c.visits >= 3 ? '🍖' : '👤'}</div>
        <div class="crm-info">
          <div class="crm-name">${escapeHtml(c.name)}${alert}</div>
          <div class="crm-sub">방문 ${c.visits}회 · 최근 ${c.lastDate || '없음'}</div>
        </div>
        <span class="crm-grade ${grade.cls}">${grade.label}</span>
      </div>`;
  }).join('');
}

// ── REVIEW LOG ────────────────────────────────────────────
function getReviewLogs() {
  try { return JSON.parse(localStorage.getItem('review_logs') || '[]'); }
  catch { return []; }
}
function saveReviewLogs(logs) {
  try { localStorage.setItem('review_logs', JSON.stringify(logs)); } catch {}
}

function updateReviewCount() {
  const cutoff = Date.now() - 3 * 86400000;
  const count = getReviewLogs().filter(r => r.ts >= cutoff).length;
  const el = document.getElementById('home-review-count');
  if (el) el.textContent = count;
}

function openReviewLog() {
  document.getElementById('review-log-modal').classList.add('open');
  renderReviewLog();
}
function closeReviewLog() { document.getElementById('review-log-modal').classList.remove('open'); }

function openAddReview() {
  closeReviewLog();
  setTimeout(() => document.getElementById('add-review-modal').classList.add('open'), 200);
  addReviewStars = 5;
  document.querySelectorAll('.add-star').forEach(s => s.style.filter = 'none');
  document.getElementById('add-review-content').value = '';
  document.getElementById('add-review-replied').value = '0';
}
function closeAddReview() {
  document.getElementById('add-review-modal').classList.remove('open');
  setTimeout(() => openReviewLog(), 200);
}

function setAddStar(i) {
  addReviewStars = i + 1;
  document.querySelectorAll('.add-star').forEach((s, j) =>
    s.style.filter = j <= i ? 'none' : 'grayscale(1) brightness(.4)'
  );
}

function saveReviewLog() {
  const content = document.getElementById('add-review-content').value.trim();
  if (!content) { toast('리뷰 내용을 입력해주세요'); return; }
  const logs = getReviewLogs();
  logs.unshift({
    id: Date.now(), ts: Date.now(),
    platform: document.getElementById('add-review-platform').value,
    stars: addReviewStars, content,
    replied: document.getElementById('add-review-replied').value === '1',
  });
  saveReviewLogs(logs);
  updateReviewCount();
  closeAddReview();
  toast('✅ 리뷰가 저장됐습니다');
}

function toggleReplied(id) {
  const logs = getReviewLogs();
  const log = logs.find(l => l.id === id);
  if (log) { log.replied = !log.replied; saveReviewLogs(logs); renderReviewLog(); updateReviewCount(); }
}

function deleteReviewLog(id) {
  saveReviewLogs(getReviewLogs().filter(l => l.id !== id));
  renderReviewLog();
  updateReviewCount();
}

function renderReviewLog() {
  const el = document.getElementById('review-log-list');
  if (!el) return;
  const cutoff = Date.now() - 3 * 86400000;
  const logs = getReviewLogs().filter(r => r.ts >= cutoff);
  if (!logs.length) {
    el.innerHTML = '<div class="empty"><div class="ei">💬</div>최근 3일간 기록된 리뷰가 없습니다<br>리뷰를 받으면 추가해보세요</div>';
    return;
  }
  el.innerHTML = logs.map(r => {
    const date = new Date(r.ts);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    const stars = '⭐'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
    const safeContent = escapeHtml(r.content);
    const safeForAttr = r.content.replace(/'/g, '&apos;').replace(/"/g, '&quot;');
    return `
      <div class="review-log-item">
        <div class="rl-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="rl-platform">${escapeHtml(r.platform)}</span>
            <span style="font-size:12px">${stars}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="rl-date">${dateStr}</span>
            <button class="rl-del" onclick="deleteReviewLog(${r.id})">✕</button>
          </div>
        </div>
        <div class="rl-content">${safeContent}</div>
        <div class="rl-footer">
          <button class="rl-reply-btn ${r.replied ? 'replied' : ''}" onclick="toggleReplied(${r.id})">
            ${r.replied ? '✅ 답변완료' : '⬜ 미답변'}
          </button>
          <button class="btn btn-outline btn-sm" onclick="useReviewInTab('${safeForAttr}',${r.stars})">답글 생성</button>
        </div>
      </div>`;
  }).join('');
}

function useReviewInTab(content, stars) {
  closeReviewLog();
  setTimeout(() => {
    switchTab('review');
    document.getElementById('review-text').value = content;
    state.reviewStars = stars;
    document.querySelectorAll('.star').forEach((s, j) => s.classList.toggle('on', j < stars));
  }, 300);
}

// ── SETTINGS ──────────────────────────────────────────────
function openSettings() {
  document.getElementById('settings-modal').classList.add('open');
  document.getElementById('api-key-input').value = state.apiKey;
}
function closeSettings() { document.getElementById('settings-modal').classList.remove('open'); }
function saveSettings() {
  const key = document.getElementById('api-key-input').value.trim();
  state.apiKey = key;
  localStorage.setItem('claude_api_key', key);
  closeSettings();
  toast('✅ 설정이 저장되었습니다');
}

// ── CLAUDE API ────────────────────────────────────────────
async function claudeAPI(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('API 키가 올바르지 않습니다. 설정을 확인해주세요.');
      if (res.status === 429) throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      throw new Error(err.error?.message || `API 오류 (${res.status})`);
    }
    const data = await res.json();
    return data.content[0].text;
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('요청 시간이 초과됐습니다. 다시 시도해주세요.');
    throw e;
  }
}

// ── UTILS ─────────────────────────────────────────────────
function copyText(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✅';
    setTimeout(() => btn.textContent = '복사', 1500);
    toast('클립보드에 복사됐습니다');
  }).catch(() => toast('복사 실패'));
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function formatDate(date, fmt) {
  const d = new Date(date);
  const days = ['일','월','화','수','목','금','토'];
  return fmt
    .replace('YYYY', d.getFullYear())
    .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
    .replace('DD', String(d.getDate()).padStart(2, '0'))
    .replace('ddd', days[d.getDay()]);
}

function parseCSVRow(row) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '"') {
      if (inQuote && row[i + 1] === '"') { cur += '"'; i++; } // escaped quote
      else { inQuote = !inQuote; }
      continue;
    }
    if (row[i] === ',' && !inQuote) { result.push(cur.trim()); cur = ''; continue; }
    cur += row[i];
  }
  result.push(cur.trim());
  return result;
}

// AI 응답에서 번호 목록 파싱 (더 강건한 버전)
function parseNumberedList(text) {
  const results = [];
  const lines = text.split('\n');
  let current = '';
  for (const line of lines) {
    if (/^[123]\.\s+/.test(line.trim())) {
      if (current.trim()) results.push(current.trim());
      current = line.replace(/^[123]\.\s+/, '');
    } else if (current !== '') {
      current += '\n' + line;
    }
  }
  if (current.trim()) results.push(current.trim());

  // 파싱 실패 시 텍스트 그대로 3분할 시도
  if (!results.length) {
    const fallback = text.split(/\n\n+/).filter(s => s.trim().length > 10);
    return fallback.slice(0, 3);
  }
  return results;
}

// XSS 방지용 HTML 이스케이프
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

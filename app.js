// ── CONFIG ────────────────────────────────────────────────
const CONFIG = {
  sheetId: '1aukCOcUico2s6udxXmyNPgK8MUIJ-qtt0kj-tvMZIyo',
  webhookUrl: 'https://hook.us2.make.com/6grcqyb621wgpobywyktd0fe0g3q1lmr',
  restaurantName: '봉도니',
  instagramId: 'bongdony_jeju',
  reservationRefreshMs: 30000,
  oneSignalAppId: '239d5b75-6ff7-4f7b-b05c-e9885841c10c',
  syncWebhookUrl: 'https://hook.us2.make.com/n2td26rk2eeq3lhqdvlwnt6yxmrlv331',
};

// ── STATE ─────────────────────────────────────────────────
let state = {
  currentTab: 'home',
  reviewStars: 0,
  reservations: [],
  filteredDate: 'today',
  apiKey: localStorage.getItem('claude_api_key') || '',
  aiLoading: false,
  snsPhoto: null, // { media_type, data }
  reservationsLoading: false,
  lastReservationLoadAt: null,
  reservationError: '',
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
  startReservationAutoRefresh();
  checkInstaReminder();
  setInterval(checkInstaReminder, 60000); // 매 분 체크 → 오후 5시 정각에 표시
  initOneSignal();
  renderHomeInvWidget();
  renderHomePlMini();
});

// ── 인스타 게시 알림 배너 ────────────────────────────────
function checkInstaReminder() {
  const banner = document.getElementById('insta-banner');
  if (!banner) return;
  const now = new Date();
  const today = formatDate(now, 'YYYY-MM-DD');
  const dismissed = localStorage.getItem('insta_reminder_date');
  // 오후 5시(17시)부터 자정 전까지, 오늘 안 닫았으면 표시
  if (now.getHours() >= 17 && dismissed !== today) {
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
}
function dismissInstaReminder() {
  localStorage.setItem('insta_reminder_date', formatDate(new Date(), 'YYYY-MM-DD'));
  const b = document.getElementById('insta-banner');
  if (b) b.classList.remove('show');
}
function gotoSNS() {
  dismissInstaReminder();
  switchTab('sns');
}

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
  if (tab === 'home') { renderHome(); renderHomeInvWidget(); renderHomePlMini(); }
  if (tab === 'inventory') renderInventory();
  if (tab === 'pl') renderPl();
}

function startReservationAutoRefresh() {
  setInterval(() => {
    if (!document.hidden) loadReservations({ silent: true });
  }, CONFIG.reservationRefreshMs);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadReservations({ silent: true });
  });
}

// ── HOME ──────────────────────────────────────────────────
function sparkBars(items, getDate) {
  const days = 7;
  const counts = new Array(days).fill(0);
  const base = new Date(); base.setHours(0, 0, 0, 0);
  items.forEach(it => {
    const raw = getDate(it); if (raw == null) return;
    const d = new Date(raw); if (isNaN(d)) return; d.setHours(0, 0, 0, 0);
    const diff = Math.round((base - d) / 86400000);
    if (diff >= 0 && diff < days) counts[days - 1 - diff]++;
  });
  const max = Math.max(...counts, 1);
  return counts.map(c => `<i style="height:${c ? Math.max(c / max * 100, 14) : 8}%"></i>`).join('');
}

function renderHome() {
  const today = formatDate(new Date(), 'YYYY-MM-DD');
  const todayRes = state.reservations.filter(r => r.dateKey === today);
  const el = document.getElementById('home-today-count');
  const totalEl = document.getElementById('home-total');
  if (el) el.textContent = todayRes.length;
  if (totalEl) totalEl.textContent = state.reservations.length;

  const sr = document.getElementById('spark-res');
  if (sr) sr.innerHTML = sparkBars(state.reservations, r => r.dateKey || r.date);
  const srv = document.getElementById('spark-rev');
  if (srv) srv.innerHTML = sparkBars(getReviewLogs(), r => r.ts);

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
      <div class="res-detail">🕐 ${escapeHtml(r.time)} &nbsp;·&nbsp; 👥 ${escapeHtml(formatPeople(r.people))} &nbsp;·&nbsp; 📞 ${escapeHtml(r.phone)}</div>
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
    .filter(r => Number.isFinite(r.timeMinutes))
    .map(r => {
      const resTime = new Date();
      resTime.setHours(Math.floor(r.timeMinutes / 60), r.timeMinutes % 60, 0, 0);
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
        <span class="next-res-people">👥 ${escapeHtml(formatPeople(next.people))}</span>
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

  const prompt = `당신은 제주시 봉개동에 위치한 삼겹살 맛집 "${CONFIG.restaurantName}"의 사장님입니다.
아래 손님 리뷰에 사장님이 직접 다는 답글 3개를 작성하세요. 각각 서로 다른 사장님 성격으로:
· 답글1 = 젊고 친절한 남자 사장님 (다정하고 트렌디한 말투)
· 답글2 = 씩씩하고 즐겁고 친절한 사장님 (활기차고 에너지 넘치는 말투)
· 답글3 = 유쾌하고 유머러스한 친절한 사장님 (위트있고 웃음 주는 말투)

[별점에 따라 답글 방향을 반드시 다르게]
· 4~5점: 진심 어린 감사 + 재방문 환영
· 3점: 감사 인사 + 아쉬우셨던 점 개선 약속
· 1~2점: 정중한 사과 + 구체적 개선 의지 + 다시 모실 기회 부탁

리뷰 별점: ${state.reviewStars}점
리뷰 내용: "${review}"

규칙:
- 각 답글 3~5문장, "고객님" 호칭, 봉도니의 따뜻한 톤
- 사장님이 고기를 직접 구워준다는 표현은 절대 쓰지 마세요(봉도니는 손님이 직접 굽습니다)
- 반드시 아래 형식 그대로만 출력. 제목·설명·번호목록 쓰지 마세요.

###1###
(답글 본문)
###2###
(답글 본문)
###3###
(답글 본문)`;

  const personas = ['젊은 사장님', '씩씩한 사장님', '유머 사장님'];

  try {
    const res = await claudeAPI(prompt);
    let items = res.split(/###\s*\d+\s*###/).slice(1).map(s => s.trim()).filter(Boolean);
    if (items.length < 2) items = parseNumberedList(res); // 형식 안 지켰을 때 폴백
    if (!items.length) throw new Error('답글 생성에 실패했습니다. 다시 시도해주세요.');
    resultsEl.innerHTML = items.slice(0, 3).map((text, i) => `
      <div class="ai-result-item">
        <div class="ai-result-header">
          <div class="result-num">답글 ${i + 1}${personas[i] ? ' · ' + personas[i] : ''}</div>
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
// 사진 선택 → 리사이즈 → 미리보기 + base64 저장
function handlePhotoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('이미지 파일만 업로드할 수 있습니다'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      // 큰 사진은 1280px로 축소 (API 비용·속도 최적화)
      const maxSize = 1280;
      let { width, height } = img;
      if (width > height && width > maxSize) {
        height = Math.round(height * maxSize / width); width = maxSize;
      } else if (height >= width && height > maxSize) {
        width = Math.round(width * maxSize / height); height = maxSize;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      // 미리보기 표시
      const zone = document.getElementById('photo-upload-zone');
      const preview = document.getElementById('photo-preview');
      preview.src = dataUrl;
      zone.classList.add('has-image');
      if (!zone.querySelector('.photo-badge')) {
        const badge = document.createElement('div');
        badge.className = 'photo-badge';
        badge.textContent = '📷 사진 변경';
        zone.appendChild(badge);
      }

      // base64 데이터만 추출해 저장
      state.snsPhoto = { media_type: 'image/jpeg', data: dataUrl.split(',')[1] };
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function generateCaptions() {
  if (state.aiLoading) { toast('생성 중입니다. 잠시 기다려주세요'); return; }
  if (!state.apiKey) { openSettings(); toast('API 키를 먼저 설정해주세요'); return; }
  const mood = document.getElementById('sns-mood').value.trim();
  const menu = document.getElementById('sns-menu').value.trim();
  if (!state.snsPhoto && !mood) { toast('사진을 올리거나 설명을 입력해주세요'); return; }

  const resultsEl = document.getElementById('sns-results');
  resultsEl.innerHTML = '<div class="loading"><div class="spinner"></div>AI가 캡션을 생성하고 있습니다...</div>';
  state.aiLoading = true;

  const prompt = `당신은 제주시 봉개동에 위치한 삼겹살 맛집 "${CONFIG.restaurantName}"의 사장님입니다.
${state.snsPhoto ? '첨부된 사진을 자세히 보고, 사진 속 음식·분위기·색감·장면을 살려서 ' : ''}인스타그램 게시물 캡션 3개를 작성하세요.
${mood ? `추가 설명: ${mood}` : ''}${menu ? `\n메뉴: ${menu}` : ''}
인스타 계정: @${CONFIG.instagramId} / 위치: 제주시 봉개동

각 캡션은 서로 다른 "사장님 성격"으로 써주세요:
· 캡션1 = 젊고 친절한 남자 사장님 (다정하고 트렌디한 말투)
· 캡션2 = 씩씩하고 즐겁고 친절한 사장님 (활기차고 에너지 넘치는 말투)
· 캡션3 = 유쾌하고 유머러스한 친절한 사장님 (위트있고 웃음 주는 말투)

각 캡션: 본문 2~4줄 + 마지막 줄에 해시태그 정확히 7개(제주·봉도니·삼겹살 감성, # 포함, 공백 구분).
사장님이 고기를 직접 구워준다는 표현은 쓰지 마세요(봉도니는 손님이 직접 굽습니다).
반드시 아래 형식 그대로만 출력하세요. 제목·설명·번호목록 절대 쓰지 마세요.

###1###
(캡션 본문)
(해시태그 7개)
###2###
(캡션 본문)
(해시태그 7개)
###3###
(캡션 본문)
(해시태그 7개)`;

  const personas = ['젊은 사장님', '씩씩한 사장님', '유머 사장님'];

  try {
    const res = await claudeAPI(prompt, state.snsPhoto);
    let items = res.split(/###\s*\d+\s*###/).slice(1).map(s => s.trim()).filter(Boolean);
    if (items.length < 2) items = parseNumberedList(res); // 형식 안 지켰을 때 폴백
    if (!items.length) throw new Error('캡션 생성에 실패했습니다. 다시 시도해주세요.');
    resultsEl.innerHTML = items.slice(0, 3).map((text, i) => `
      <div class="ai-result-item">
        <div class="ai-result-header">
          <div class="result-num">캡션 ${i + 1}${personas[i] ? ' · ' + personas[i] : ''}</div>
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
  document.getElementById('sns-photo').value = '';
  state.snsPhoto = null;
  const zone = document.getElementById('photo-upload-zone');
  zone.classList.remove('has-image');
  const badge = zone.querySelector('.photo-badge');
  if (badge) badge.remove();
  document.getElementById('photo-preview').src = '';
}

// ── RESERVATIONS ──────────────────────────────────────────
async function loadReservations() {
  if (state.reservationsLoading) return;
  state.reservationsLoading = true;
  try {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/export?format=csv&gid=0&cacheBust=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`시트 로드 오류 (${res.status})`);
    const csv = await res.text();

    // \r\n (Windows) 및 \r (Mac) 줄바꿈 모두 처리
    const rows = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').slice(1).filter(r => r.trim());
    state.reservations = rows.map(row => {
      const cols = parseCSVRow(row);
      const contact = normalizeReservationContact(cols[3], cols[4], cols[5]);
      return {
        id:      cols[0] || '',
        date:    formatReservationDate(cols[1] || ''),
        dateKey: normalizeReservationDate(cols[1] || ''),
        time:    (cols[2] || '').trim(),
        timeMinutes: parseReservationTime(cols[2] || ''),
        name:    contact.name,
        phone:   contact.phone,
        people:  contact.people,
        request: (cols[6] || '').trim(),
        status:  (cols[7] || '예약완료').trim(),
        channel: (cols[8] || '').trim(),
      };
    }).filter(r => r.name);

    state.reservationError = '';
    state.lastReservationLoadAt = new Date();
    renderHome();
    renderCRM();
    if (state.currentTab === 'reservations') renderReservations();
    updateReviewCount();
  } catch (e) {
    state.reservationError = e.message || '시트 로드 실패';
    console.warn('시트 로드 실패:', e.message);
    if (state.currentTab === 'reservations') renderReservations();
  } finally {
    state.reservationsLoading = false;
  }
}

function renderReservations() {
  const listEl = document.getElementById('res-list');
  if (!listEl) return;
  if (state.reservationError) {
    listEl.innerHTML = `
      <div class="empty">
        <div class="ei">⚠️</div>
        구글시트 연결을 확인해주세요<br>
        시트를 링크가 있는 모든 사용자가 볼 수 있게 공유해야 합니다.
      </div>`;
    return;
  }
  const today = formatDate(new Date(), 'YYYY-MM-DD');
  const tomorrow = formatDate(new Date(Date.now() + 86400000), 'YYYY-MM-DD');
  const weekLater = formatDate(new Date(Date.now() + 7 * 86400000), 'YYYY-MM-DD');

  let filtered = [...state.reservations];
  if (state.filteredDate === 'today') filtered = filtered.filter(r => r.dateKey === today);
  else if (state.filteredDate === 'tomorrow') filtered = filtered.filter(r => r.dateKey === tomorrow);
  else if (state.filteredDate === 'week') filtered = filtered.filter(r => r.dateKey >= today && r.dateKey <= weekLater);
  filtered.sort((a, b) =>
    (a.dateKey || a.date).localeCompare(b.dateKey || b.date) ||
    (a.timeMinutes ?? 9999) - (b.timeMinutes ?? 9999)
  );

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
        👥 ${escapeHtml(formatPeople(r.people))} &nbsp;·&nbsp; 📞 ${escapeHtml(r.phone)}
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
  toast(state.reservationError ? '구글시트 공유 설정이 필요합니다' : '✅ 새로고침 완료');
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
  updatePushStatus();
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
// image: { media_type, data } 가 있으면 사진까지 함께 분석 (Vision)
async function claudeAPI(prompt, image) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000); // 45초 (사진 분석은 더 오래 걸림)

  const content = image
    ? [
        { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } },
        { type: 'text', text: prompt },
      ]
    : prompt;

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
        messages: [{ role: 'user', content }],
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

function normalizeReservationDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const today = new Date();
  const lowered = raw.replace(/\s+/g, '');
  if (lowered === '오늘') return formatDate(today, 'YYYY-MM-DD');
  if (lowered === '내일') return formatDate(new Date(today.getTime() + 86400000), 'YYYY-MM-DD');

  if (/^\d{5}$/.test(lowered)) {
    return googleSerialDateToKey(Number(lowered));
  }

  let match = raw.match(/(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  if (match) return toDateKey(Number(match[1]), Number(match[2]), Number(match[3]));

  match = raw.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = inferReservationYear(month, day);
    return toDateKey(year, month, day);
  }

  return raw;
}

function formatReservationDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{5}$/.test(raw)) {
    const date = googleSerialDateToDate(Number(raw));
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  }
  return raw;
}

function googleSerialDateToKey(serial) {
  return formatDate(googleSerialDateToDate(serial), 'YYYY-MM-DD');
}

function googleSerialDateToDate(serial) {
  // Google Sheets date serial 1 is 1899-12-31.
  return new Date(Date.UTC(1899, 11, 30 + serial));
}

function inferReservationYear(month, day) {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), month - 1, day);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  return candidate < thirtyDaysAgo ? now.getFullYear() + 1 : now.getFullYear();
}

function toDateKey(year, month, day) {
  return [
    year,
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function parseReservationTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let match = raw.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const normalized = raw.replace(/\s+/g, '');
  const isPm = /(오후|저녁|밤)/.test(normalized);
  const isAm = /(오전|아침|새벽)/.test(normalized);

  if (isPm && hour < 12) hour += 12;
  if (isAm && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}

function normalizeReservationContact(nameCell, phoneCell, peopleCell) {
  const values = [nameCell, phoneCell, peopleCell].map(v => String(v || '').trim());
  const phone = values.find(isLikelyPhone) || values[1] || '';
  const people = values.find(isLikelyPeople) || values[2] || '';
  const name = values.find(v => v && v !== phone && v !== people) || values[0] || '';

  return {
    name,
    phone,
    people: normalizePeopleText(people),
  };
}

function isLikelyPhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 6 && /^[\d\s\-().+]+$/.test(raw);
}

function isLikelyPeople(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})\s*명?$/);
  if (!match) return false;
  const count = Number(match[1]);
  return count >= 1 && count <= 30;
}

function normalizePeopleText(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})\s*명?$/);
  return match ? `${Number(match[1])}명` : raw;
}

function formatPeople(value) {
  return normalizePeopleText(value);
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

// ── 푸시 알림 (OneSignal) ──────────────────────────────────
function initOneSignal() {
  if (!CONFIG.oneSignalAppId || CONFIG.oneSignalAppId === 'YOUR_ONESIGNAL_APP_ID') return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    await OneSignal.init({
      appId: CONFIG.oneSignalAppId,
      serviceWorkerPath: 'sw.js',
      serviceWorkerScope: '/',
      notifyButton: { enable: false },
    });
    updatePushStatus();
  });
}

async function updatePushStatus() {
  const btn = document.getElementById('push-toggle-btn');
  const txt = document.getElementById('push-status-text');
  if (!btn || !txt) return;
  try {
    const subscribed = window.OneSignal?.User?.PushSubscription?.optedIn;
    if (subscribed) {
      btn.textContent = '알림 끄기';
      btn.style.borderColor = 'var(--gold)';
      txt.textContent = '✅ 켜짐 · 새 예약 알림 받는 중';
      txt.style.color = 'var(--gold)';
    } else {
      btn.textContent = '알림 켜기';
      btn.style.borderColor = '';
      txt.textContent = '꺼짐';
      txt.style.color = 'var(--text3)';
    }
  } catch(e) {
    txt.textContent = '상태 확인 실패';
  }
}

async function togglePushNotifications() {
  if (!window.OneSignal) {
    showToast('OneSignal이 초기화되지 않았습니다');
    return;
  }
  try {
    const isSubscribed = window.OneSignal.User.PushSubscription.optedIn;
    if (isSubscribed) {
      await window.OneSignal.User.PushSubscription.optOut();
      showToast('예약 알림을 껐습니다');
    } else {
      await window.OneSignal.User.PushSubscription.optIn();
      showToast('예약 알림을 켰습니다 🔔');
    }
    updatePushStatus();
  } catch(e) {
    showToast('알림 설정 중 오류가 발생했습니다');
  }
}

// ══════════════════════════════════════════════════════
// 📦 재고 관리
// ══════════════════════════════════════════════════════
const INV_DEFAULT = [
  {id:'m1',cat:'meat',name:'삼겹살',stock:15,minStock:5,unit:'kg',ordered:false},
  {id:'m2',cat:'meat',name:'오겹살',stock:10,minStock:3,unit:'kg',ordered:false},
  {id:'m3',cat:'meat',name:'생갈비',stock:8,minStock:3,unit:'kg',ordered:false},
  {id:'m4',cat:'meat',name:'항정살',stock:8,minStock:3,unit:'kg',ordered:false},
  {id:'m5',cat:'meat',name:'목살',stock:10,minStock:3,unit:'kg',ordered:false},
  {id:'v1',cat:'veg',name:'상추',stock:10,minStock:5,unit:'봉',ordered:false},
  {id:'v2',cat:'veg',name:'깻잎',stock:8,minStock:4,unit:'봉',ordered:false},
  {id:'v3',cat:'veg',name:'쑥갓',stock:6,minStock:3,unit:'봉',ordered:false},
  {id:'v4',cat:'veg',name:'마늘',stock:5,minStock:2,unit:'망',ordered:false},
  {id:'v5',cat:'veg',name:'양파',stock:8,minStock:3,unit:'망',ordered:false},
  {id:'v6',cat:'veg',name:'대파',stock:5,minStock:2,unit:'단',ordered:false},
  {id:'v7',cat:'veg',name:'새송이버섯',stock:8,minStock:3,unit:'봉',ordered:false},
  {id:'v8',cat:'veg',name:'쌈장',stock:3,minStock:1,unit:'통',ordered:false},
  {id:'d1',cat:'drink',name:'소주',stock:5,minStock:2,unit:'박스',ordered:false},
  {id:'d2',cat:'drink',name:'맥주',stock:5,minStock:2,unit:'박스',ordered:false},
  {id:'d3',cat:'drink',name:'막걸리',stock:20,minStock:5,unit:'병',ordered:false},
  {id:'d4',cat:'drink',name:'콜라',stock:20,minStock:5,unit:'병',ordered:false},
  {id:'d5',cat:'drink',name:'사이다',stock:20,minStock:5,unit:'병',ordered:false},
  {id:'d6',cat:'drink',name:'생수',stock:3,minStock:1,unit:'박스',ordered:false},
  {id:'e1',cat:'etc',name:'쌀',stock:20,minStock:5,unit:'kg',ordered:false},
  {id:'e2',cat:'etc',name:'기름',stock:3,minStock:1,unit:'통',ordered:false},
  {id:'e3',cat:'etc',name:'된장',stock:2,minStock:1,unit:'통',ordered:false},
  {id:'e4',cat:'etc',name:'두부',stock:10,minStock:3,unit:'모',ordered:false},
  {id:'e5',cat:'etc',name:'계란',stock:3,minStock:1,unit:'판',ordered:false},
];

let invItems = JSON.parse(localStorage.getItem('inv_items') || 'null') || INV_DEFAULT.map(i => ({...i}));
let invCatFilter = 'all';

// ── 구글 시트 동기화 공통 ──────────────────────────────────
let _invSyncTimer = null;
let _plSyncTimer  = null;

function syncToSheet(type, data) {
  fetch(CONFIG.syncWebhookUrl, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({type, data: JSON.stringify(data)})
  }).catch(() => {});
}

async function loadFromSheet(sheetName) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const resp = await fetch(url + '&t=' + Date.now()); // 캐시 무효화
    if (!resp.ok) return null;
    const text = await resp.text();
    const rows = text.trim().split('\n').filter(r => r.trim()).map(r => parseCSVRow(r));
    // 마지막 행부터 역순으로 유효한 JSON 배열 찾기
    for (let i = rows.length - 1; i >= 0; i--) {
      const col = rows[i][1];
      if (col && col.trim().startsWith('[')) {
        return JSON.parse(col.trim());
      }
    }
    return null;
  } catch(e) { return null; }
}

function saveInvItems() {
  localStorage.setItem('inv_items', JSON.stringify(invItems));
  clearTimeout(_invSyncTimer);
  // 시트에는 변하는 값(id, stock, ordered)만 저장 → 한글 이름은 앱코드 INV_DEFAULT에서 항상 가져옴
  const mutable = invItems.map(({id, stock, ordered}) => ({id, stock, ordered}));
  _invSyncTimer = setTimeout(() => syncToSheet('inv', mutable), 2000);
}

function getInvStatus(item) {
  const r = item.stock / item.minStock;
  if (r >= 2)   return 'ok';
  if (r >= 1)   return 'yellow';
  if (r >= 0.5) return 'orange';
  return 'red';
}
const INV_STATUS_LABEL = {red:'긴급', orange:'부족', yellow:'주의', ok:'충분'};
const INV_STATUS_EMOJI = {red:'🔴', orange:'🟠', yellow:'🟡', ok:'✅'};

async function renderInventory() {
  // 구글 시트에서 최신 데이터 로드
  const listEl = document.getElementById('inv-item-list');
  if (listEl) listEl.innerHTML = '<div class="loading"><div class="spinner"></div>시트에서 불러오는 중...</div>';
  const sheetData = await loadFromSheet('재고');
  if (sheetData && Array.isArray(sheetData) && sheetData.length > 0) {
    // INV_DEFAULT(이름·단위 포함)와 시트데이터(id·stock·ordered)를 병합
    invItems = INV_DEFAULT.map(def => {
      const s = sheetData.find(x => x.id === def.id);
      return s ? {...def, stock: s.stock ?? def.stock, ordered: s.ordered ?? false} : {...def};
    });
    localStorage.setItem('inv_items', JSON.stringify(invItems));
  }

  const catNames = {meat:'🥩 고기류', veg:'🥬 채소·쌈', drink:'🍺 음료', etc:'📦 기타'};
  const groups = invCatFilter === 'all' ? ['meat','veg','drink','etc'] : [invCatFilter];
  const alertItems = invItems.filter(i => getInvStatus(i) !== 'ok');

  // 알림 바
  const alertBar = document.getElementById('inv-alert-bar');
  if (alertBar) {
    alertBar.classList.remove('hidden', 'ok-state');
    if (alertItems.length > 0) {
      alertBar.textContent = `⚠️ 발주 필요 ${alertItems.length}개 항목이 있습니다`;
    } else {
      alertBar.textContent = '✅ 모든 재료 재고가 충분합니다';
      alertBar.classList.add('ok-state');
    }
  }

  // 아이템 목록
  let html = '';
  groups.forEach(cat => {
    const items = invItems.filter(i => i.cat === cat);
    if (!items.length) return;
    html += `<div class="inv-group-label">${catNames[cat]}</div>`;
    items.forEach(item => {
      const st = getInvStatus(item);
      const pct = Math.min(100, Math.round(item.stock / (item.minStock * 2) * 100));
      const orderClass = item.ordered ? 'ordered' : (st !== 'ok' ? 'needs-order' : '');
      const orderText = item.ordered ? '✅발주완료' : '발주';
      html += `<div class="inv-item status-${st}" id="inv-${item.id}">
        <div class="inv-status-badge" id="ibadge-${item.id}">${INV_STATUS_EMOJI[st]}</div>
        <div style="flex:1;min-width:0">
          <div class="inv-name">${item.name}</div>
          <div class="inv-bar-wrap"><div class="inv-bar bar-${st}" id="ibar-${item.id}" style="width:${pct}%"></div></div>
        </div>
        <div class="inv-qty-area">
          <button class="inv-qty-btn" onclick="adjInv('${item.id}',-1)">−</button>
          <div class="inv-qty-display">
            <div class="inv-qty-num" id="iqn-${item.id}">${item.stock}</div>
            <div class="inv-qty-unit">${item.unit}</div>
          </div>
          <button class="inv-qty-btn" onclick="adjInv('${item.id}',1)">+</button>
        </div>
        <button class="inv-order-btn ${orderClass}" id="iobtn-${item.id}" onclick="toggleInvOrder('${item.id}')">${orderText}</button>
      </div>`;
    });
  });
  if (listEl) listEl.innerHTML = html; // listEl은 함수 상단에서 이미 선언됨
  renderHomeInvWidget();
}

function adjInv(id, delta) {
  const item = invItems.find(i => i.id === id);
  if (!item) return;
  item.stock = Math.max(0, item.stock + delta);
  saveInvItems();

  // 해당 아이템만 DOM 업데이트 (전체 재렌더링 없이)
  const st = getInvStatus(item);
  const pct = Math.min(100, Math.round(item.stock / (item.minStock * 2) * 100));
  const numEl = document.getElementById(`iqn-${id}`);
  if (numEl) numEl.textContent = item.stock;
  const el = document.getElementById(`inv-${id}`);
  if (el) el.className = `inv-item status-${st}`;
  const badge = document.getElementById(`ibadge-${id}`);
  if (badge) badge.textContent = INV_STATUS_EMOJI[st];
  const bar = document.getElementById(`ibar-${id}`);
  if (bar) { bar.style.width = pct + '%'; bar.className = `inv-bar bar-${st}`; }
  const oBtn = document.getElementById(`iobtn-${id}`);
  if (oBtn) {
    oBtn.className = `inv-order-btn ${item.ordered ? 'ordered' : (st !== 'ok' ? 'needs-order' : '')}`;
  }

  // 알림 바 업데이트
  const alertItems = invItems.filter(i => getInvStatus(i) !== 'ok');
  const alertBar = document.getElementById('inv-alert-bar');
  if (alertBar) {
    alertBar.classList.remove('hidden', 'ok-state');
    if (alertItems.length > 0) {
      alertBar.textContent = `⚠️ 발주 필요 ${alertItems.length}개 항목이 있습니다`;
    } else {
      alertBar.textContent = '✅ 모든 재료 재고가 충분합니다';
      alertBar.classList.add('ok-state');
    }
  }
  renderHomeInvWidget();
}

function toggleInvOrder(id) {
  const item = invItems.find(i => i.id === id);
  if (!item) return;
  item.ordered = !item.ordered;
  saveInvItems();
  renderInventory();
  renderOrderList();
  showToast(item.ordered ? `${item.name} 발주 완료 처리` : `${item.name} 발주 취소`);
}

function filterInv(el, cat) {
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  invCatFilter = cat;
  renderInventory();
}

function openOrderListModal() {
  renderOrderList();
  document.getElementById('order-modal').classList.add('open');
}
function closeOrderModal() { document.getElementById('order-modal').classList.remove('open'); }

function renderOrderList() {
  const items = invItems.filter(i => getInvStatus(i) !== 'ok');
  const el = document.getElementById('order-modal-list');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<div class="empty"><span class="ei">✅</span>발주 필요 항목이 없습니다</div>';
    return;
  }
  el.innerHTML = items.map(item => {
    const st = getInvStatus(item);
    return `<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--cream2)">
      <span>${INV_STATUS_EMOJI[st]}</span>
      <span style="flex:1;font-size:14px;font-weight:800">${item.name}</span>
      <span style="font-size:12px;color:var(--text3)">${item.stock}${item.unit} 남음</span>
      <span class="hiw-tag ${st}">${INV_STATUS_LABEL[st]}</span>
      <button class="inv-order-btn ${item.ordered ? 'ordered' : 'needs-order'}"
        onclick="toggleInvOrder('${item.id}')">${item.ordered ? '✅완료' : '발주필요'}</button>
    </div>`;
  }).join('');
}

function renderHomeInvWidget() {
  const widget = document.getElementById('home-inv-widget');
  const listEl = document.getElementById('home-inv-list');
  if (!widget || !listEl) return;
  const alertItems = invItems
    .filter(i => getInvStatus(i) !== 'ok')
    .sort((a, b) => {
      const o = {red:0, orange:1, yellow:2, ok:3};
      return o[getInvStatus(a)] - o[getInvStatus(b)];
    })
    .slice(0, 5);
  if (!alertItems.length) { widget.style.display = 'none'; return; }
  widget.style.display = 'block';
  listEl.innerHTML = alertItems.map(item => {
    const st = getInvStatus(item);
    return `<div class="hiw-row">
      <div class="hiw-dot ${st}"></div>
      <div class="hiw-iname">${item.name}</div>
      <div class="hiw-qty ${st}">${item.stock} ${item.unit}</div>
      <span class="hiw-tag ${st}">${INV_STATUS_LABEL[st]}</span>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// 💰 손익계산서
// ══════════════════════════════════════════════════════
let plLogs = JSON.parse(localStorage.getItem('pl_logs') || '[]');
let plCurrentMonth = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
})();

function savePlLogs() {
  localStorage.setItem('pl_logs', JSON.stringify(plLogs));
  clearTimeout(_plSyncTimer);
  _plSyncTimer = setTimeout(() => syncToSheet('pl', plLogs), 1000); // 1초 디바운스
}

function fmtWon(n) {
  const abs = Math.abs(n);
  if (abs >= 100000000) return (n / 100000000).toFixed(1) + '억원';
  if (abs >= 10000) return (n / 10000).toFixed(0) + '만원';
  return n.toLocaleString() + '원';
}

function getMonthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${y}년 ${parseInt(m)}월`;
}

function changeMonth(delta) {
  const [y, m] = plCurrentMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  plCurrentMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  renderPl(); // async — 탭 전환 시 시트 재로드
}

async function renderPl() {
  // 구글 시트에서 최신 데이터 로드
  const sheetData = await loadFromSheet('손익');
  if (sheetData && Array.isArray(sheetData)) {
    plLogs = sheetData;
    localStorage.setItem('pl_logs', JSON.stringify(plLogs));
  }

  const labelEl = document.getElementById('pl-month-label');
  if (labelEl) labelEl.textContent = getMonthLabel(plCurrentMonth);

  const entries = plLogs.filter(e => e.date && e.date.startsWith(plCurrentMonth));
  const totalIncome  = entries.reduce((s, e) => s + (e.income  || 0), 0);
  const totalExpense = entries.reduce((s, e) => s + (e.expense || 0), 0);
  const profit = totalIncome - totalExpense;

  const incEl = document.getElementById('pl-income-val');
  const expEl = document.getElementById('pl-expense-val');
  const prfEl = document.getElementById('pl-profit-val');
  if (incEl) incEl.textContent = fmtWon(totalIncome);
  if (expEl) expEl.textContent = fmtWon(totalExpense);
  if (prfEl) prfEl.textContent = (profit >= 0 ? '+' : '') + fmtWon(profit);

  renderPlChart();
  renderPlEntries(entries);
  renderHomePlMini();
}

function renderPlChart() {
  const chartEl = document.getElementById('pl-chart-area');
  if (!chartEl) return;
  const months = [];
  const [cy, cm] = plCurrentMonth.split('-').map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(cy, cm - 1 - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const ents = plLogs.filter(e => e.date && e.date.startsWith(ym));
    months.push({
      label: String(d.getMonth() + 1) + '월',
      income:  ents.reduce((s, e) => s + (e.income  || 0), 0),
      expense: ents.reduce((s, e) => s + (e.expense || 0), 0),
    });
  }
  const maxVal = Math.max(...months.map(m => m.income), 1);
  chartEl.innerHTML = months.map(m => {
    const ih = Math.round(m.income  / maxVal * 74);
    const eh = Math.round(m.expense / maxVal * 74);
    const ph = Math.max(Math.round((m.income - m.expense) / maxVal * 74), 0);
    return `<div class="pl-chart-col">
      <div class="pl-chart-bars">
        <div class="pl-chart-bar pl-bar-income"  style="height:${Math.max(ih,3)}px;width:9px"></div>
        <div class="pl-chart-bar pl-bar-expense" style="height:${Math.max(eh,3)}px;width:9px"></div>
        <div class="pl-chart-bar pl-bar-profit"  style="height:${Math.max(ph,3)}px;width:6px"></div>
      </div>
      <div class="pl-chart-label">${m.label}</div>
    </div>`;
  }).join('');
}

function renderPlEntries(entries) {
  const listEl = document.getElementById('pl-entries-list');
  if (!listEl) return;
  const sorted = entries.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) {
    listEl.innerHTML = '<div class="empty"><span class="ei">📋</span>이번달 입력 내역이 없습니다<br>아래 버튼으로 오늘 수입·지출을 입력해보세요</div>';
    return;
  }
  listEl.innerHTML = sorted.map(e => {
    const profit = (e.income || 0) - (e.expense || 0);
    const d = e.date.slice(5).replace('-', '/');
    return `<div class="pl-entry-item">
      <div class="ple-date">${d}</div>
      <div class="ple-memo">${escapeHtml(e.memo || '메모 없음')}</div>
      <div class="ple-amounts">
        <div class="ple-income">${(e.income||0).toLocaleString()}원</div>
        <div class="ple-expense">−${(e.expense||0).toLocaleString()}원</div>
      </div>
      <div class="ple-profit-badge ${profit >= 0 ? 'pos' : 'neg'}">${profit >= 0 ? '+' : ''}${fmtWon(profit)}</div>
      <button class="ple-del-btn" onclick="deletePlEntry('${e.id}')">✕</button>
    </div>`;
  }).join('');
}

function renderHomePlMini() {
  const el = document.getElementById('home-pl-mini');
  if (!el) return;
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const entries = plLogs.filter(e => e.date && e.date.startsWith(ym));
  if (!entries.length) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const totalIncome  = entries.reduce((s, e) => s + (e.income  || 0), 0);
  const totalExpense = entries.reduce((s, e) => s + (e.expense || 0), 0);
  const profit = totalIncome - totalExpense;
  const valEl = document.getElementById('home-pl-val');
  if (valEl) valEl.textContent = (profit >= 0 ? '+' : '') + fmtWon(profit);
  const pctEl = document.getElementById('home-pl-pct');
  if (pctEl) {
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
    const prevEnts = plLogs.filter(e => e.date && e.date.startsWith(prevYm));
    const prevProfit = prevEnts.reduce((s, e) => s + (e.income||0) - (e.expense||0), 0);
    if (prevProfit !== 0) {
      const pct = Math.round((profit - prevProfit) / Math.abs(prevProfit) * 100);
      pctEl.textContent = (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + '% 전월 대비';
      pctEl.className = 'hpm-profit-pct ' + (pct >= 0 ? 'pos' : 'neg');
    } else {
      pctEl.textContent = `${entries.length}일 입력됨`;
      pctEl.className = 'hpm-profit-pct pos';
    }
  }
}

function openPlModal() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  document.getElementById('pl-input-date').value = dateStr;
  document.getElementById('pl-input-income').value = '';
  document.getElementById('pl-input-expense').value = '';
  document.getElementById('pl-input-memo').value = '';
  document.getElementById('pl-modal').classList.add('open');
}
function closePlModal() { document.getElementById('pl-modal').classList.remove('open'); }

function savePlEntry() {
  const date    = document.getElementById('pl-input-date').value;
  const income  = parseInt(document.getElementById('pl-input-income').value)  || 0;
  const expense = parseInt(document.getElementById('pl-input-expense').value) || 0;
  const memo    = document.getElementById('pl-input-memo').value.trim();
  if (!date) { showToast('날짜를 입력해주세요'); return; }
  if (!income && !expense) { showToast('매출 또는 지출을 입력해주세요'); return; }
  plLogs = plLogs.filter(e => e.date !== date); // 같은 날짜 중복 제거
  plLogs.push({ id: date + '_' + Date.now(), date, income, expense, memo });
  savePlLogs();
  closePlModal();
  renderPl();
  showToast('저장됐습니다 ✅');
}

function deletePlEntry(id) {
  plLogs = plLogs.filter(e => e.id !== id);
  savePlLogs();
  renderPl();
  showToast('삭제됐습니다');
}

// ── 강제 앱 업데이트 (캐시 초기화 + 새로고침) ──────────────
async function forceAppRefresh() {
  const btn = document.getElementById('refresh-btn');
  // 버튼 스피너 애니메이션
  if (btn) {
    btn.style.animation = 'spin .6s linear infinite';
    btn.style.pointerEvents = 'none';
  }
  showToast('최신 버전으로 업데이트 중...');

  try {
    // 1. 서비스워커 전체 해제
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    // 2. 캐시 전체 삭제
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
    }
  } catch(e) {}

  // 3. 강제 새로고침 (캐시 무시)
  location.reload();
}

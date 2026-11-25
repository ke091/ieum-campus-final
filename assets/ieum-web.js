(() => {
  const workspace = document.getElementById('ieumWorkspace');
  const rail = workspace.querySelector('.ieum-rail');
  const sourceNav = document.getElementById('campusNav');
  const compact = matchMedia('(max-width: 1023px), (max-width: 1400px) and (pointer: coarse)');
  const main = document.getElementById('campusSurface');
  const extras = document.getElementById('ieumHomeExtras');

  let timetableFeed;
  let timetableFeedUntil = 0;
  async function getTimetableFeed() {
    if (Date.now() < timetableFeedUntil) return timetableFeed;
    timetableFeedUntil = Date.now() + 180000;
    timetableFeed = (async () => {
      const urls = ['https://raw.githubusercontent.com/ke091/ieum-campus/main/data/timetable.json','./data/timetable.json'];
      for (const url of urls) {
        try {
          const response = await fetch(url,{signal:AbortSignal.timeout(2300),credentials:'omit'});
          if (!response.ok) continue;
          const body = await response.text();
          if (body.length > 1500000) continue;
          const data = JSON.parse(body);
          if (/^20\d{2}-\d{2}-\d{2}$/.test(data?.checkedOn) && data.lessons && typeof data.lessons === 'object') return data;
        } catch { /* Use the published copy when the data feed cannot be read. */ }
      }
      return null;
    })();
    return timetableFeed;
  }

  if (document.body.hasAttribute('data-web-timetable')) timetableWebFeed.load = async (week,grade,room) => {
    const data = await getTimetableFeed();
    if (!data) return null;
    const academicYear = day => Number(day.slice(0,4)) - Number(Number(day.slice(5,7))<3);
    const rooms = new Map();
    for (const key of Object.keys(data.lessons)) {
      const parts = /^(20\d{2}-\d{2}-\d{2}):([1-3]):([1-9]\d?)$/.exec(key);
      if (!parts || academicYear(parts[1]) !== academicYear(week)) continue;
      rooms.set(parts[2]+':'+parts[3],{grade:Number(parts[2]),room:Number(parts[3])});
    }
    const classes = [...rooms.values()].sort((a,b)=>a.grade-b.grade || a.room-b.room);
    const selected = rooms.get(grade+':'+room) ?? classes.find(item=>item.grade===grade) ?? classes[0];
    if (!selected) return null;
    const days = Array.from({length:5},(_,index)=>timetableDate(week,index));
    const lessons = data.lessons[[week,selected.grade,selected.room].join(':')];
    if (!Array.isArray(lessons) || !lessons.length || lessons.length>250 || !lessons.every(item=>item &&
        days.includes(item.date) && Number.isInteger(item.period) && item.period>=0 && item.period<=20 &&
        typeof item.subject==='string' && item.subject.length>0 && item.subject.length<=200)) return null;
    return {classes,selected,days,lessons,savedOn:data.checkedOn,backup:'web'};
  };

  const dock = document.createElement('nav');
  dock.className = 'ieum-web-dock';
  dock.setAttribute('aria-label', '빠른 메뉴');
  dock.innerHTML = `
    <button type="button" data-campus-tab="home"><svg aria-hidden="true"><use href="#i-grid"/></svg>홈</button>
    <button type="button" data-campus-tab="notices" data-web-news><svg aria-hidden="true"><use href="#i-file"/></svg><span>교내 소식</span></button>
    <button type="button" data-campus-tab="events"><svg aria-hidden="true"><use href="#i-calendar"/></svg>행사</button>
    <button type="button" data-campus-tab="messages"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21 4 10 15m11-11-7 17-4-6-7-4Z"/></svg>문자<span class="ieum-message-badge hidden" aria-hidden="true"></span></button>
    <button type="button" aria-controls="ieumWebMenu" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>전체 메뉴</button>`;
  workspace.append(dock);

  const menu = document.createElement('dialog');
  menu.id = 'ieumWebMenu';
  menu.setAttribute('aria-labelledby', 'ieumWebMenuTitle');
  menu.innerHTML = `<header class="ieum-web-menu-head"><h2 id="ieumWebMenuTitle">이음 메뉴</h2>
    <button type="button" class="icon-btn" aria-label="메뉴 닫기" data-web-menu-close>×</button></header>`;
  document.body.append(menu);

  const toggle = dock.querySelector('[aria-controls=ieumWebMenu]');
  const messages = dock.querySelector('[data-campus-tab=messages]');
  const messageSource = document.getElementById('ieumMessagesEntry');
  const messageBadge = messages.querySelector('.ieum-message-badge');
  const sourceBadge = messageSource.querySelector('[data-message-badge]');

  function syncDock() {
    const personal = personalAccount();
    const news = dock.querySelector('[data-web-news]');
    news.dataset.campusTab = personal ? 'nurijip' : 'notices';
    news.querySelector('span').textContent = personal ? '누리집' : '교내 소식';
    dock.classList.toggle('ieum-web-dock-personal',personal);
    const active = sourceNav.querySelector('[aria-current=page]')?.dataset.campusTab;
    for (const button of dock.querySelectorAll('[data-campus-tab]')) {
      const source = sourceNav.querySelector('[data-campus-tab="' + button.dataset.campusTab + '"]');
      button.classList.toggle('hidden',Boolean(source?.classList.contains('hidden')));
      if (active === button.dataset.campusTab) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    const badge = sourceBadge.textContent;
    if (messageBadge.textContent !== badge) messageBadge.textContent = badge;
    messageBadge.classList.toggle('hidden', sourceBadge.classList.contains('hidden'));
    const messageLabel = messageSource.getAttribute('aria-label');
    if (messageLabel) messages.setAttribute('aria-label', messageLabel);
    else messages.removeAttribute('aria-label');
  }

  function positionNavigation() {
    if (compact.matches) {
      menu.append(rail);
      main.append(extras);
    } else {
      if (menu.open) menu.close();
      workspace.prepend(rail);
      workspace.insertBefore(extras,dock);
    }
    if (campusParticipant() || personalAccount()) showCampusExtras(campus.request);
  }

  toggle.addEventListener('click', () => {
    menu.showModal();
    toggle.setAttribute('aria-expanded', 'true');
  });
  menu.addEventListener('close', () => toggle.setAttribute('aria-expanded', 'false'));
  menu.addEventListener('click', event => {
    if (event.target === menu || event.target.closest('[data-web-menu-close], #campusNav button')) menu.close();
  });

  const changes = new MutationObserver(syncDock);
  changes.observe(sourceNav, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['aria-current', 'aria-label', 'class'] });
  compact.addEventListener('change', positionNavigation);
  positionNavigation();
  syncDock();

  const navigation = '#campusNav button, [data-campus-tab], [data-campus-event], [data-campus-notice], [data-event-proposal], [data-school-section], [data-announcement-room], [data-linked-announcement]';
  document.addEventListener('click', event => {
    if (compact.matches && event.target.closest(navigation)) window.scrollTo({ top: 0, behavior: 'instant' });
  });
})();

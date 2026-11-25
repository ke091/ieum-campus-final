(() => {
  'use strict';

  function mount({ host, get, post, escape, current, signOut }) {
    let data, date = '', route = null, rosterFilter = 'waiting', rosterSearch = '', transferredId = '', busy = false, fetchSequence = 0;
    let message = '';
    let managing = false, settings = null, confirmedAction = null;
    const root = document.createElement('section');
    root.className = 'bus-workspace';
    const busIcon = '<svg class="bus-icon" aria-hidden="true"><use href="#i-bus"/></svg>';
    root.innerHTML = `<header class="bus-hero"><div class="bus-brand">
      <span class="bus-brand-icon">${busIcon}</span><div><h1>길벗</h1><p>금요일 통학버스</p></div></div></header>
      <div class="bus-toolbar"><div class="bus-operating-day"><label>운행일
        <span class="bus-date-control"><span class="bus-date-value" data-bus-date-value aria-hidden="true">—</span>
          <select data-bus-date disabled></select></span></label>
      <span class="bus-week-label hidden" data-bus-this-week>이번 주</span></div>
      <div class="bus-toolbar-actions"><button class="btn secondary hidden" type="button" data-bus-settings>운영 설정</button>
      <button class="btn secondary" type="button" data-bus-refresh>새로고침</button></div></div>
      <p class="bus-feedback small" role="status"></p><div class="bus-content" aria-label="통학버스 현황"></div>
      <dialog class="bus-confirm" aria-labelledby="bus-confirm-title" aria-describedby="bus-confirm-detail">
        <h2 id="bus-confirm-title"></h2><p id="bus-confirm-detail"></p>
        <div class="bus-form-actions">
          <button class="btn secondary" type="button" data-bus-dialog="cancel" autofocus>취소</button>
          <button class="btn bus-danger" type="button" data-bus-dialog="confirm"></button>
        </div>
      </dialog>`;
    host.replaceChildren(root);
    const content = root.querySelector('.bus-content');
    const feedback = root.querySelector('.bus-feedback');
    const dateSelect = root.querySelector('[data-bus-date]');
    const dateValue = root.querySelector('[data-bus-date-value]');
    const weekLabel = root.querySelector('[data-bus-this-week]');
    const refresh = root.querySelector('[data-bus-refresh]');
    const settingsButton = root.querySelector('[data-bus-settings]');
    const toolbar = root.querySelector('.bus-toolbar');
    const dialog = root.querySelector('.bus-confirm');
    const fmtDate = day => day.replace(/^(\d{4})-(\d\d)-(\d\d)$/, '$1. $2. $3. (금)');
    const routeName = key => key ? data.routes[key] : '미탑승';
    const requestLabel = row => row.requestKind === 'skip' ? '미탑승' :
      [routeName(row.requestRoute), row.requestDropoff && row.requestDropoff + ' 하차'].filter(Boolean).join(' · ');
    const boardingState = row => row.boardedAt ? 'boarded' : row.route ? 'waiting' : 'absent';
    const boardingLabels = { all:'탑승 예정', waiting:'탑승 대기', boarded:'탑승 완료', absent:'미탑승' };
    const requestStates = { pending:'확인 대기', approved:'변경 적용', declined:'반려' };
    const stateLabel = row => boardingLabels[boardingState(row)];
    const boardClock = new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', hour:'numeric', minute:'2-digit' });
    const lineSymbol = '<span class="bus-line-symbol">' + busIcon + '</span>';
    const confirmCopy = {
      withdraw: ['요청을 취소할까요?', '승인 대기 중인 이번 주 요청을 취소해요.', '요청 취소'],
      'self-unboard': ['탑승 완료를 취소할까요?', '선생님 명단에 다시 탑승 대기로 표시돼요.', '탑승 완료 취소'],
      'delete-departure': ['정원을 지울까요?', '선택한 노선의 정원을 미지정으로 바꿔요.', '정원 지우기'],
      'release-duty': ['담당을 해제할까요?', '선택한 노선에서 담당 교사 배정을 해제해요.', '담당 해제'],
      'reset-attendance': ['탑승 체크를 초기화할까요?', '선택한 노선의 탑승 완료 표시를 모두 확인 전으로 돌려요.', '탑승 체크 초기화'],
      'delete-request': ['변경 요청을 삭제할까요?', '요청 내역을 삭제해요. 이미 반영된 배정은 그대로예요.', '요청 삭제'],
      'reset-assignment': ['이번 주 배정을 초기화할까요?', '기본 노선과 하차 장소로 되돌리고 변경 요청을 삭제해요.', '배정 초기화'],
    };
    const routeActions = new Set(['duty','delete-departure','release-duty','reset-attendance']);
    const control = (action, label, row, primary = false) =>
      `<button class="btn ${primary ? 'primary' : 'secondary'}${Object.hasOwn(confirmCopy,action) && action !== 'withdraw' ? ' bus-text-danger' : ''}" type="button" data-bus-action="${action}"
        ${row ? `data-bus-id="${escape(row.id)}"` : ''}>${label}</button>`;
    const option = (value, label, selected = false) =>
      `<option value="${escape(value)}"${selected ? ' selected' : ''}>${escape(label)}</option>`;
    const options = (selected, includeSkip) => (includeSkip ? option('skip', '이번 주 미탑승', !selected) : '') +
      Object.entries(data.routes).map(([key, name]) => option(key, name, key === selected)).join('');
    const routeOptions = selected => option('', '노선 선택', !selected) +
      Object.entries(data.routes).map(([key,name]) => option(key,name,key === selected)).join('');
    const hasStops = key => Boolean(data.stops?.[key]?.length);
    const stopOptions = (key, selected = '', required = false) =>
      option('', required ? '하차 장소 선택' : '미지정', !selected) +
      (data.stops?.[key] || []).map(stop => option(stop, stop, selected === stop)).join('');
    const stopField = (key, selected = '', required = false) =>
      `<label data-bus-stop-field class="${hasStops(key) ? '' : 'hidden'}">하차 장소
        <select name="dropoff"${hasStops(key) ? '' : ' disabled'}${required ? ' required' : ''}>${stopOptions(key, selected, required)}</select></label>`;

    function updateStopField(form, selected = '') {
      const key = form.elements.route.value;
      form.querySelector('[data-bus-stop-field]').classList.toggle('hidden', !hasStops(key));
      const stop = form.elements.dropoff;
      stop.disabled = !hasStops(key);
      stop.innerHTML = stopOptions(key, selected, stop.required);
    }
    const departureFor = key => data.departures.find(item => item.route === key);
    const dutyFor = key => data.duty.find(item => item.route === key);
    const departureTime = () => data.departureTime || '14:35';

    function updateDateLabel(day) {
      dateValue.textContent = fmtDate(day);
      weekLabel.classList.toggle('hidden',day !== dateSelect.options[0]?.value);
    }

    function confirmAction([title, detail, actionLabel], perform) {
      confirmedAction = perform;
      dialog.querySelector('h2').textContent = title;
      dialog.querySelector('p').textContent = detail;
      dialog.querySelector('[data-bus-dialog=confirm]').textContent = actionLabel;
      dialog.returnValue = 'cancel';
      dialog.showModal();
    }

    function runBusAction(action, id) {
      const row = data.records.find(record => record.id === id);
      const duty = action === 'duty' ? dutyFor(route) : null;
      const copy = duty ? ['담당을 이어받을까요?', routeName(route) + ' 담당을 ' + duty.name + '에게서 이어받아요.', '담당 이어받기']
        : action === 'self-board' && row?.requestState === 'pending'
        ? ['현재 노선에 탑승했나요?', '탑승을 완료하면 대기 중인 변경 요청이 닫혀요.', '탑승 완료']
        : confirmCopy[action];
      const changes = routeActions.has(action) ? { route } : {};
      if (!copy) { modify(action, id, changes); return; }
      const version = row?.version;
      const day = data.date;
      confirmAction(copy, () => {
        if (data?.date !== day || (id && data.records.find(row => row.id === id)?.version !== version)) {
          feedback.textContent = '명단이 바뀌었어요. 다시 확인해 주세요.';
          return;
        }
        modify(action, id, changes);
      });
    }

    function tripFacts(ticket) {
      const time = departureTime();
      const [hour, minute] = time.split(':').map(Number);
      const readableTime = `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}시 ${minute}분`;
      return `<dl class="bus-trip-facts"><div><dt>출발 시각</dt>
        <dd><time datetime="${escape(time)}">${readableTime}</time></dd></div>
        <div><dt>하차 장소</dt><dd>${escape(ticket.dropoff || '미지정')}</dd></div></dl>`;
    }

    function departureBoard(active) {
      const time = escape(departureTime());
      return `<section class="bus-board" aria-labelledby="bus-board-title">
        <header class="bus-board-head"><h2 id="bus-board-title">노선별 운행표</h2>
          <button type="button" class="btn secondary bus-board-all" data-bus-route="" aria-pressed="${!active}">전체 노선</button></header>
        <div class="bus-route-grid" role="group" aria-label="노선 선택">
        ${Object.entries(data.routes).map(([key,name]) => {
          const passengers = data.records.filter(row => row.route === key);
          const boarded = passengers.filter(row => row.boardedAt).length;
          const duty = dutyFor(key);
          return `<button type="button" class="bus-route-card" data-line="${escape(key)}"
            data-bus-route="${escape(key)}" aria-pressed="${key === active}">
            <span class="bus-route-heading"><span class="bus-route-label">${lineSymbol}<strong>${escape(name)}</strong></span>
              <span class="bus-board-arrow" aria-hidden="true">›</span></span>
            <span class="bus-route-meta"><span><time datetime="${time}">${time}</time> 출발</span>
              <span>탑승 <strong>${boarded}</strong> / ${passengers.length}명</span></span>
            <span class="bus-route-duty"><span>담당</span> <strong>${escape(duty?.name || '미정')}</strong></span>
          </button>`;
        }).join('')}</div>
      </section>`;
    }

    function studentView() {
      const [row] = data.records;
      if (!row) return `<section class="bus-panel"><h2>${data.editable ? '등록된 기본 노선이 없어요' : '해당 날짜의 이용 기록이 없어요'}</h2>
        <p>배정 내용을 확인하려면 통학버스 담당 선생님께 문의하세요.</p></section>`;
      const duty = dutyFor(row.route);
      const state = boardingState(row);
      return `<div class="bus-student-layout"><section class="bus-ticket" data-line="${escape(row.route || '')}" data-ticket-state="${state}">
        <div class="bus-ticket-paper">
          <header class="bus-panel-head">
            <div><p>내 탑승권</p><div class="bus-route-label">${lineSymbol}<h2>${escape(routeName(row.route))}</h2></div></div>
            <span class="bus-chip" data-state="${state}">${stateLabel(row)}</span>
          </header>
          ${row.route ? tripFacts(row) : ''}
        </div>
        <div class="bus-ticket-coupon">
          <dl class="bus-ticket-stub">
            <div><dt>탑승자</dt><dd>${escape(row.name)} <small>${escape(row.id)}</small></dd></div>
            <div><dt>운행일</dt><dd><time datetime="${escape(data.date)}">${escape(fmtDate(data.date))}</time></dd></div>
            ${row.route ? `<div class="bus-ticket-duty"><dt>담당 선생님</dt><dd>${escape(duty?.name || '미정')}</dd></div>` : ''}
          </dl>
        ${row.boardedAt ? `<div class="bus-ticket-action">
          <p><strong>탑승 시각</strong> <time datetime="${escape(row.boardedAt)}">${boardClock.format(new Date(row.boardedAt))}</time></p>
          ${data.editable && row.boardedByStudent ? control('self-unboard','탑승 완료 취소',row) : ''}
        </div>` : data.editable && row.route ? `<div class="bus-ticket-action">
          ${control('self-board','탑승 완료',row,true)}<p>버스에 탄 뒤 눌러 주세요.</p>
        </div>` : ''}</div></section>
        ${row.requestState || (data.editable && !row.boardedAt) ? `<section class="bus-panel bus-student-change"><h2>노선 변경</h2>
          ${row.requestState ? `<div class="bus-request-summary" data-state="${row.requestState}">
            <strong>${requestStates[row.requestState]}</strong><p>${escape(requestLabel(row))}</p>
            ${data.editable && row.requestState === 'pending' ? control('withdraw','요청 취소',row) : ''}
          </div>` : ''}
          ${data.editable && !row.boardedAt && row.requestState !== 'pending' ? `<details class="bus-edit"><summary>변경 요청하기</summary>
              <form class="bus-adjust" data-bus-form="request">
                <label>변경할 노선 <select name="route" required>
                  <option value="">노선 선택</option>
                  ${row.route ? option('skip', '이번 주 안 타요') : ''}
                  ${Object.entries(data.routes)
                    .map(([key,name]) => option(key, name + (key === row.route ? ' · 하차 장소만 변경' : ''))).join('')}
                </select></label>
                ${stopField('', '', true)}
                <button class="btn primary">선생님께 요청</button>
              </form></details>` : ''}</section>` : ''}</div>`;
    }

    function routeDutyPanel() {
      if (!route || !data.editable) return '';
      const duty = dutyFor(route);
      const teachers = data.dutyTeachers || [];
      return `<section class="bus-panel bus-duty-panel" aria-label="${escape(routeName(route))} 담당 선생님 배정">
        <div><h2>담당 선생님</h2><p>${escape(routeName(route))} · ${escape(duty?.name || '미정')}</p></div>
        <div class="bus-form-actions">
          ${data.admin && teachers.length ? `<form class="bus-duty-form" data-bus-form="duty">
            <select name="teacherId" aria-label="담당 선생님 선택" required>
              ${option('', '담당 선생님 선택', !duty?.id)}
              ${teachers.map(person => option(person.id, person.name, person.id === duty?.id)).join('')}
            </select><button class="btn secondary">담당 저장</button></form>` : ''}
          ${!data.admin && !duty?.mine ? control('duty', duty ? '담당 이어받기' : '담당 맡기') : ''}
          ${duty && (duty.mine || data.admin) ? control('release-duty','담당 해제') : ''}
        </div></section>`;
    }

    function routeOperations(planned, checked) {
      if (!route) return '';
      const departure = departureFor(route);
      return `<section class="bus-panel"><details class="bus-edit"><summary>${escape(routeName(route))} 운행 설정</summary>
        <div class="bus-operations">
          <div><h3>차량 정원</h3>
            <p>${departure?.capacity ? `정원 ${departure.capacity}명 · ${planned > departure.capacity
              ? '정원 초과 ' + (planned - departure.capacity) : '남은 좌석 ' + (departure.capacity - planned)}명` : '미지정'}</p>
            ${data.editable ? `<details class="bus-edit"><summary>정원 설정</summary>
            <form class="bus-settings-editor" data-bus-form="departure">
              <label>정원 <input type="number" name="capacity" min="1" max="600" value="${departure?.capacity || ''}" placeholder="미지정"></label>
              <div class="bus-form-actions"><button class="btn secondary">정원 저장</button>
                ${departure?.capacity ? control('delete-departure','정원 지우기') : ''}</div>
            </form></details>` : ''}</div>
          ${data.editable && checked ? `<div><h3>탑승 확인</h3>${control('reset-attendance','탑승 체크 초기화')}</div>` : ''}
        </div></details></section>`;
    }

    function teacherRequests() {
      const pending = data.records.filter(row => row.requestState === 'pending' &&
        (!route || (row.route || row.baseRoute) === route || row.requestRoute === route));
      const processed = data.records.filter(row => ['approved','declined'].includes(row.requestState));
      const currentAssignment = row => [routeName(row.route), row.dropoff].filter(Boolean).join(' · ');
      return `<section class="bus-panel bus-requests">
        <header class="bus-panel-head"><h2>노선 변경 요청</h2><span class="bus-count">${pending.length}건</span></header>
        ${pending.length ? pending.map(row => `<div class="bus-row">
          <div class="bus-row-main"><strong>${escape(row.name)}</strong> <small>${escape(row.id)}</small>
          <p class="bus-transition"><span>${escape(currentAssignment(row))}</span><span aria-hidden="true">→</span>
          <strong>${escape(requestLabel(row))}</strong></p></div>
          <div class="bus-row-actions">${data.editable ? control('approve','변경 적용',row,true) +
            control('decline','반려',row) : '미처리'}</div>
        </div>`).join('') : '<p class="bus-empty">처리할 요청이 없어요.</p>'}
        ${processed.length ? `<details data-bus-history><summary>처리한 요청 ${processed.length}건</summary>
          ${processed.map(row=>`<div class="bus-row"><div class="bus-row-main"><strong>${escape(row.name)}</strong> <small>${escape(row.id)}</small>
            <p>${escape(requestLabel(row))} · ${requestStates[row.requestState]}</p></div>
            ${data.editable ? control('delete-request','요청 삭제',row) : ''}</div>`).join('')}
          </details>` : ''}
      </section>`;
    }

    function studentRow(row) {
      const status = boardingState(row);
      const search = (row.id+row.name).normalize('NFC').replace(/\s/g,'').toLowerCase();
      const source = row.boardedByStudent ? '학생 본인 확인' : row.checkedBy ? row.checkedBy + ' 확인' : '교사 확인';
      return `<div class="bus-row bus-passenger${row.id === transferredId ? ' bus-transferred' : ''}"
        data-bus-passenger="${status}" data-bus-search-match="${escape(search)}">
        <div class="bus-row-main"><div class="bus-passenger-name"><strong>${escape(row.name)}</strong> <small>${escape(row.id)}</small></div>
          <p>${escape(routeName(row.route))}${row.route && row.dropoff ? ' · ' + escape(row.dropoff) + ' 하차' : ''}</p>
          ${row.boardedAt ? `<p class="bus-source"><time datetime="${escape(row.boardedAt)}">${boardClock.format(new Date(row.boardedAt))}</time> · ${escape(source)}</p>` : ''}
        </div>
        <div class="bus-row-actions">
          ${data.editable && (row.boardedAt ? control('unboard','체크 취소',row) : row.route ? control('board','탑승 체크',row,true) : '') || ''}
          ${data.editable && !row.boardedAt ? `<details class="bus-edit"><summary>배정 변경</summary>
            <form class="bus-adjust" data-bus-form="assign" data-bus-id="${escape(row.id)}">
              <label>이번 주 노선 <select name="route">${options(row.route,true)}</select></label>
              ${stopField(row.route, row.dropoff)}
              <button class="btn secondary">저장</button>
              ${row.route !== row.baseRoute || row.dropoff !== row.baseDropoff || row.requestState ? control('reset-assignment','배정 초기화',row) : ''}
            </form></details>` : ''}
        </div></div>`;
    }

    function teacherView() {
      const rows = route ? data.records.filter(row => (row.route || row.baseRoute) === route) : data.records;
      const planned = rows.filter(row => row.route).length;
      const checked = rows.filter(row => row.boardedAt).length;
      const totals = { all:planned, waiting:planned-checked, boarded:checked, absent:rows.length-planned };
      const stat = key => `<button type="button" class="bus-stat" data-bus-list="${key}" aria-pressed="${key === rosterFilter}">
        <span>${boardingLabels[key]}</span><strong>${totals[key]}<small>명</small></strong></button>`;
      return `${departureBoard(route)}${routeDutyPanel()}
        <section class="bus-panel bus-attendance"><header class="bus-panel-head"><h2>${route ? escape(routeName(route)) : '전체 노선'} 탑승 현황</h2></header>
          <div class="bus-stats" role="group" aria-label="탑승 상태 선택">${['all','waiting','boarded'].map(stat).join('')}</div>
        </section>
        ${teacherRequests()}
        <section class="bus-panel bus-roster-panel"><header class="bus-roster-title">
          <div><h2 data-bus-roster-heading>탑승 명단</h2><p data-bus-roster-count class="bus-visible-count"></p></div>
          <div class="bus-roster-tools"><div class="bus-search">
            <input type="search" data-bus-search value="${escape(rosterSearch)}" aria-label="이름 또는 학번 검색" placeholder="이름 또는 학번 검색" maxlength="100"></div>
            <button type="button" class="btn secondary" data-bus-list="absent" aria-pressed="${rosterFilter==='absent'}">미탑승 ${totals.absent}명</button>
          </div></header>
          <div class="bus-roster">${rows.map(studentRow).join('')}
            <p data-bus-empty class="bus-empty hidden">표시할 학생이 없어요.</p>
          </div>
        </section>
        ${routeOperations(planned,checked)}`;
    }

    function filterRoster() {
      const roster = content.querySelector('.bus-roster');
      if (!roster) return;
      const query = rosterSearch.normalize('NFC').replace(/\s/g,'').toLowerCase();
      let visible = 0;
      for (const row of roster.querySelectorAll('[data-bus-passenger]')) {
        const status = row.dataset.busPassenger;
        const matches = (rosterFilter === 'all' ? status !== 'absent' : status === rosterFilter)
          && row.dataset.busSearchMatch.includes(query);
        row.classList.toggle('hidden',!matches);
        if (matches) visible++;
      }
      for (const button of content.querySelectorAll('[data-bus-list]')) {
        button.setAttribute('aria-pressed', String(button.dataset.busList === rosterFilter));
      }
      content.querySelector('[data-bus-roster-heading]').textContent = boardingLabels[rosterFilter] + ' 명단';
      content.querySelector('[data-bus-roster-count]').textContent = visible + '명';
      roster.querySelector('[data-bus-empty]').classList.toggle('hidden',visible !== 0);
    }

    function settingsView() {
      if (!settings) return '<section class="bus-panel"><p>운영 설정을 불러오는 중…</p></section>';
      const total = settings.students.filter(student => student.route).length;
      return `<div class="bus-settings"><h2 class="bus-settings-heading">운영 설정</h2>
      <section class="bus-panel bus-settings-card">
        <header class="bus-settings-head"><div><h2>기본 노선 등록</h2>
          <p>매주 사용하는 학생별 노선을 관리해요.</p></div><span class="bus-settings-count">${total}명 배정 · 전체 ${settings.students.length}명</span></header>
        <form class="bus-settings-form" data-bus-form="base">
          <label>학생 <select name="student" required><option value="">학번과 이름으로 선택</option>
            ${settings.students.map(student=>option(student.id,student.id+' '+student.name)).join('')}</select></label>
          <label>기본 노선 <select name="route" required>${routeOptions('')}</select></label>
          ${stopField('')}
          <div class="bus-form-actions"><button class="btn primary">기본 노선 저장</button>
            <button class="btn secondary bus-text-danger" type="button" data-bus-base-delete disabled>배정 삭제</button></div>
        </form>
        <details class="bus-settings-details"><summary>명단 한 번에 등록</summary>
          <form class="bus-settings-form" data-bus-form="bulk">
            <label>명단 파일 <input type="file" name="file" accept=".xlsx,.csv,.tsv"></label>
            <label>또는 명단 붙여넣기 <textarea name="rows" placeholder="학번,노선,하차 장소"></textarea></label>
            <p class="small muted">첫 줄에 학번, 노선, 하차 장소 열을 넣으세요. 이름까지 넣으면 아직 이음에 가입하지 않은 학생도 명단에 담을 수 있어요.</p>
            <div class="bus-form-actions"><button class="btn primary">명단 등록</button>
              <button class="btn secondary" type="reset">입력 지우기</button></div>
          </form></details>
      </section>
      <section class="bus-panel bus-settings-card bus-reset-panel">
        <details><summary>기본 노선 초기화</summary>
          <p>선택한 노선의 기본 배정을 삭제해요. 학생 계정과 이미 확인한 탑승 기록은 유지돼요.</p>
          <form class="bus-settings-form" data-bus-form="reset-base">
            <label>초기화 범위 <select name="route">${option('','전체 노선',true)}
              ${Object.entries(data.routes).map(([key,name])=>option(key,name)).join('')}</select></label>
            <div><button class="btn secondary bus-text-danger"${total ? '' : ' disabled'}>기본 노선 초기화</button></div>
          </form>
        </details>
      </section></div>`;
    }

    function rosterFromRows(rows) {
      const clean = value => String(value ?? '').trim();
      const first = rows[0]?.map(clean) || [];
      const idColumn = first.indexOf('학번'), routeColumn = first.indexOf('노선');
      const nameColumn = first.indexOf('이름');
      const stopColumn = first.findIndex(label => label.replace(/\s/g,'') === '하차장소');
      const headed = idColumn >= 0 && routeColumn >= 0;
      const lookup = new Map(Object.entries(data.routes).flatMap(([key,name]) => [
        [key,key], [name.replace(/[·\s]/g,''),key],
      ]));
      return (headed ? rows.slice(1) : rows).filter(row=>row.some(cell=>clean(cell))).map(row => {
        const id = clean(row[headed ? idColumn : 0]);
        const label = clean(row[headed ? routeColumn : row.length - 1]).replace(/[·\s]/g,'');
        const selected = lookup.get(label);
        if (!/^[1-3][1-9]\d{2}$/.test(id) || !selected) throw Error('학번 또는 노선명이 올바르지 않아요. 세 노선 중 하나를 입력하세요.');
        const name = headed && nameColumn >= 0 ? clean(row[nameColumn]) : '';
        const dropoff = headed && stopColumn >= 0 ? clean(row[stopColumn]) : undefined;
        return { id, route:selected, ...(name ? {name} : {}), dropoff };
      });
    }

    async function bulkRows(form) {
      const file = form.elements.file.files[0];
      if (file && file.size > 2*1024*1024) throw Error('명단 파일을 2MB 이하로 올려 주세요.');
      if (file && /\.xlsx$/i.test(file.name)) {
        if (!window.XLSX) throw Error('엑셀 읽기 기능을 불러오지 못했어요.');
        const workbook = window.XLSX.read(await file.arrayBuffer(), {type:'array'});
        return rosterFromRows(window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header:1,defval:''}));
      }
      const input = file ? await file.text() : form.elements.rows.value;
      return rosterFromRows(input.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(line=>
        line.split(line.includes('\t')?'\t':',').map(value=>value.trim().replace(/^"(.*)"$/,'$1'))));
    }

    function render() {
      if (!data) return;
      toolbar.classList.toggle('hidden', Boolean(data.locked));
      if (data.locked) {
        content.textContent = '교사용 길벗을 열려면 공용 서버 업데이트가 필요해요.';
        return;
      }
      root.querySelector('.bus-brand p').textContent = data.teacher ? '금요일 통학버스 · 교사용' : '금요일 통학버스';
      dateSelect.innerHTML = data.dates.map(day => option(day, fmtDate(day), day === data.date)).join('');
      updateDateLabel(data.date);
      dateSelect.disabled = busy || managing;
      settingsButton.classList.toggle('hidden',!data.admin);
      settingsButton.textContent = managing ? '탑승 명단' : '운영 설정';
      const search = document.activeElement;
      const caret = search?.hasAttribute('data-bus-search') ? [search.selectionStart,search.selectionEnd] : null;
      const historyOpen = Boolean(content.querySelector('[data-bus-history][open]'));
      content.innerHTML = managing ? settingsView() : data.teacher ? teacherView() : studentView();
      if (data.teacher && !managing) {
        filterRoster();
        const history = content.querySelector('[data-bus-history]');
        if (history) history.open = historyOpen;
        if (caret) {
          const input = content.querySelector('[data-bus-search]');
          input.focus({preventScroll:true});
          input.setSelectionRange(...caret);
        }
      }
    }

    async function loadSettings() {
      if (!current() || !managing) return;
      try {
        const value = await get('/campus/bus/settings');
        if (current() && managing) { settings = value; render(); feedback.textContent = message; }
      } catch (error) { if (current()) feedback.textContent = error.message; }
    }

    async function changeSettings(input) {
      if (busy || !current()) return;
      busy = true;
      content.inert = true;
      feedback.textContent = '저장 중…';
      try {
        const result = await post('/campus/bus/settings', input);
        message = input.action === 'reset-assignments' ? result.removed + '명의 기본 노선을 초기화했어요.' :
          input.action === 'assignments' && input.rows.every(row=>row.route === null) ? '기본 배정을 삭제했어요.' :
          result.count ? result.count + '명의 기본 노선을 저장했어요.' : '변경을 저장했어요.';
      } catch (error) {
        if (error.status === 401 && current()) signOut();
        feedback.textContent = error.message;
        return;
      } finally {
        busy = false;
        content.inert = false;
      }
      if (managing) await loadSettings();
      else await load({ force:true });
    }

    async function load({ force = false, quiet = false } = {}) {
      if (busy || !current()) return;
      const sequence = ++fetchSequence;
      if (!quiet) feedback.textContent = '명단을 불러오는 중…';
      try {
        const next = await get('/campus/bus' + (date ? '?' + new URLSearchParams({ date }) : ''));
        if (!current() || sequence !== fetchSequence) return;
        const changed = JSON.stringify(data) !== JSON.stringify(next);
        if (force || changed) {
          if (quiet && changed) message = '';
          data = next;
          if (route === null && data.teacher) route = data.duty.find(item => item.mine)?.route || '';
          render();
        }
        feedback.textContent = message;
      } catch (error) {
        if (!current() || sequence !== fetchSequence) return;
        if (error.status === 401) signOut();
        feedback.textContent = error.message;
      }
    }

    async function tearTicket() {
      const ticket = content.querySelector('.bus-ticket[data-ticket-state=waiting]');
      const coupon = ticket?.querySelector('.bus-ticket-coupon');
      if (!coupon || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      ticket.setAttribute('data-tearing','');
      const animation = coupon.getAnimations().find(item => item.animationName === 'bus-ticket-tear');
      if (animation) {
        let timeout;
        try {
          await Promise.race([animation.finished.catch(() => {}), new Promise(resolve => { timeout = setTimeout(resolve, 800); })]);
        } finally { clearTimeout(timeout); }
      }
      ticket.removeAttribute('data-tearing');
    }

    async function modify(action, id, changes = {}) {
      if (busy || !data?.editable) return;
      const row = data.records.find(record => record.id === id) || data.records[0];
      busy = true;
      fetchSequence++;
      content.inert = true;
      message = '';
      feedback.textContent = '저장 중…';
      refresh.disabled = dateSelect.disabled = true;
      let showTransfer = false;
      try {
        const result = await post('/campus/bus', { action, date: data.date, id, version: row?.version, ...changes });
        message = {
          request:'변경 요청을 보냈어요.', approve:'변경 내용을 탑승권에 적용했어요.',
          'self-board':'탑승 완료로 기록했어요.', 'self-unboard':'탑승 대기로 돌아갔어요.',
          duty:'담당 선생님을 저장했어요.',
        }[action] || '변경을 저장했어요.';
        if (action === 'self-board' && current()) {
          feedback.textContent = message;
          await tearTicket();
        }
        if ((action === 'approve' || action === 'assign') && row) {
          const destination = result.route === undefined ? (action === 'approve' ? row.requestRoute : changes.route) : result.route;
          route = destination || row.baseRoute;
          rosterFilter = destination ? 'all' : 'absent';
          rosterSearch = '';
          transferredId = row.id;
          showTransfer = true;
          message = destination ? `${row.name} 학생을 ${routeName(destination)} 탑승 예정 명단에 반영했어요.` :
            `${row.name} 학생을 미탑승 명단에 반영했어요.`;
        }
      } catch (error) {
        message = error.message;
        if (error.status === 401 && current()) signOut();
      } finally {
        busy = false;
        if (current()) {
          refresh.disabled = dateSelect.disabled = false;
          await load({ force:true });
        }
        content.inert = false;
      }
      if (showTransfer && current()) content.querySelector('.bus-transferred')?.scrollIntoView({block:'nearest'});
    }

    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || busy) return;
      if (button.dataset.busDialog) { dialog.close(button.dataset.busDialog); return; }
      if ('busRefresh' in button.dataset) { message = ''; managing ? loadSettings() : load({ force:true }); }
      if ('busSettings' in button.dataset) {
        managing = !managing;
        message = '';
        render();
        if (managing) loadSettings();
        else load({ force:true });
      }
      if ('busRoute' in button.dataset) {
        route = button.dataset.busRoute;
        transferredId = '';
        render();
        content.querySelector('[data-bus-route][aria-pressed=true]')?.focus({preventScroll:true});
      }
      if (button.dataset.busList) { rosterFilter = button.dataset.busList; filterRoster(); }
      if (button.dataset.busAction) runBusAction(button.dataset.busAction, button.dataset.busId);
      if ('busBaseDelete' in button.dataset) {
        const person = settings.students.find(student=>student.id === button.form.elements.student.value);
        if (!person?.route) return;
        confirmAction(['기본 배정을 삭제할까요?',person.name + ' 학생의 기본 노선 배정을 삭제해요.','배정 삭제'],
          () => changeSettings({action:'assignments',rows:[{id:person.id,route:null}]}));
      }
    });
    dialog.addEventListener('close', () => {
      const perform = confirmedAction;
      confirmedAction = null;
      if (dialog.returnValue === 'confirm' && current()) perform?.();
    });
    root.addEventListener('input', event => {
      if ('busSearch' in event.target.dataset) {
        rosterSearch = event.target.value;
        filterRoster();
      }
    });
    root.addEventListener('change', event => {
      if ('busDate' in event.target.dataset) {
        date = event.target.value;
        route = null;
        transferredId = '';
        updateDateLabel(date);
        data = undefined;
        message = '';
        content.replaceChildren();
        load({ force:true });
      }
      const form = event.target.form;
      const action = form?.dataset.busForm;
      if (event.target.name === 'student' && action === 'base') {
        const selected = settings.students.find(person=>person.id === event.target.value);
        form.elements.route.value = selected?.route || '';
        form.querySelector('[data-bus-base-delete]').disabled = !selected?.route;
        updateStopField(form, selected?.dropoff || '');
      }
      if (event.target.name === 'route' && ['request', 'assign', 'base'].includes(action)) {
        const selected = event.target.value;
        const row = action === 'assign' ? data.records.find(record => record.id === form.dataset.busId) :
          action === 'base' ? settings.students.find(student => student.id === form.elements.student.value) : null;
        const stop = selected === row?.route ? row.dropoff : selected === row?.baseRoute ? row.baseDropoff : '';
        updateStopField(form, stop);
      }
    });
    root.addEventListener('submit', async event => {
      const form = event.target;
      const action = form.dataset.busForm;
      if (!action) return;
      event.preventDefault();
      const values = new FormData(form);
      const next = values.get('route'), dropoff = values.get('dropoff') ?? undefined;
      if (action === 'assign') modify(action, form.dataset.busId, { route:next === 'skip' ? null : next, dropoff });
      else if (action === 'request' && next) modify(action, undefined, { kind:next === 'skip' ? 'skip' : 'move', route:next, dropoff });
      else if (action === 'duty') modify(action, undefined, { route, teacherId:values.get('teacherId') });
      else if (action === 'departure') {
        const capacity = form.elements.capacity.value;
        modify(action, undefined, { route, time:departureTime(), capacity:capacity ? Number(capacity) : null });
      } else if (action === 'base') {
        await changeSettings({action:'assignments',rows:[{id:form.elements.student.value,route:next||null,dropoff}]});
      } else if (action === 'bulk') {
        try { await changeSettings({action:'assignments',rows:await bulkRows(form)}); }
        catch (error) { feedback.textContent=error.message; }
      } else if (action === 'reset-base') {
        const label = next ? routeName(next) : '전체 노선';
        confirmAction(['기본 노선을 초기화할까요?',label + '의 기본 배정이 삭제돼요. 학생 계정과 확인한 탑승 기록은 유지돼요.','기본 노선 초기화'],
          () => changeSettings({action:'reset-assignments',route:next||null}));
      }
    });

    async function poll() {
      if (!current()) return;
      if (!managing && !data?.locked && !busy && !dialog.open && !document.hidden && !content.querySelector('.bus-edit[open],select:focus')) await load({ quiet:true });
      if (current()) setTimeout(poll, 3500);
    }
    load({ force:true }).then(() => { if (current()) setTimeout(poll, 3500); });
  }

  window.mountIeumBus = mount;
})();

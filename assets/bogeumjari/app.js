import { addDays, deadline, residence, building, returnStatus } from './domain.js';

const $=id=>document.getElementById(id);
const integrated=document.body.dataset.ieum==='true';
const e=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const day=stamp=>stamp?.replaceAll('-','.')||'';
const clock=stamp=>stamp?stamp.replace('T',' ').replaceAll('-','.'): '—';
const displayTime=stamp=>stamp?new Date(stamp).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}):'';
const norm=value=>String(value??'').normalize('NFC').replace(/\s/g,'').toLocaleLowerCase();
const match=(person,search)=>[person?.name,person?.number].some(value=>norm(value).includes(norm(search)));
const statusLabels={pending:'확인 대기',approved:'승인',rejected:'반려'};
const requestLabels={none:'일반 입실',overnight:'외박',late:'지연 입실'};
const roleLabels={manager:'운영 관리자',staff:'기록 관리',viewer:'조회 전용'};
const tabs={home:['◫','대시보드'],students:['♙','학생 관리'],penalties:['≡','벌점 기록'],attendance:['◷','입실·외박 관리'],settings:['⚙','관리 설정']};
const studentTabs={home:['◫','내 생활관'],attendance:['◷','입실·외박'],penalties:['≡','내 벌점 기록'],settings:['⚙','내 계정']};
let state, view='home', sunday, handler, toastTimer, loginMode='staff';
let studentFilter={}, penaltyFilter={}, attendanceFilter={};
const data=()=>state.data;
const student=id=>data().students.find(person=>person.id===id);
const myStudent=()=>student(state.user.id);
const getRecord=id=>data().attendance.find(row=>row.studentId===id&&row.sunday===sunday);
const points=id=>data().penalties.filter(row=>row.studentId===id&&!row.deletedAt).reduce((sum,row)=>sum+row.points,0);
const gradeLabel=person=>person.grade+'학년';
const label=person=>person?person.name+' · '+person.number+' · '+gradeLabel(person):'';
const badge=(value,tone='')=>`<span class="badge ${tone}">${e(value)}</span>`;
const empty=value=>`<p class="empty">${e(value)}</p>`;
const button=(caption,action,options={})=>`<button type="button" class="button ${options.style||'secondary'}" data-action="${action}"${options.id?` data-id="${e(options.id)}"`:''}>${e(caption)}</button>`;
const option=(value,name,selected)=>`<option value="${e(value)}"${String(value)===String(selected)?' selected':''}>${e(name)}</option>`;
const choices=(value,entries)=>entries.map(([key,name])=>option(key,name,value)).join('');
const select=(name,caption,entries,selected='',required=false)=>`<label>${caption}<select name="${name}" ${required?'required':''}>${choices(selected,entries)}</select></label>`;
const input=(name,caption,type='text',value='',extra='')=>`<label>${caption}<input name="${name}" type="${type}" value="${e(value)}" ${extra}></label>`;
const note=(name,caption,value='',required=false)=>`<label class="wide">${caption}<textarea name="${name}" maxlength="1000" ${required?'required':''}>${e(value)}</textarea></label>`;
const title=(name,sub='',actions='')=>`<div class="page-title"><div><h1>${e(name)}</h1>${sub?`<p class="subtle">${e(sub)}</p>`:''}</div>${actions}</div>`;
const panel=(name,inside,action='')=>`<section class="card panel"><div class="heading-row"><h2>${name}</h2>${action}</div>${inside}</section>`;
const rowHead=(headers,classes='')=>`<div class="row head ${classes}" aria-hidden="true">${headers.map(value=>'<div>'+value+'</div>').join('')}</div>`;
const cell=(caption,value)=>`<div data-label="${caption}">${value}</div>`;
const nameButton=person=>`<button class="text-button" type="button" data-action="student-detail" data-id="${e(person.id)}">${e(person.name)}</button><p class="subtle">${e(person.number)} · ${gradeLabel(person)}</p>`;
function weekControl(){
 return `<div class="week" aria-label="일요일 이동">${button('‹','week-prev',{style:'plain small'})}
  <input type="date" id="week-date" aria-label="조회할 일요일" step="7" min="2020-01-05" value="${e(sunday)}">
  ${button('›','week-next',{style:'plain small'})}${button('이번 주','week-current',{style:'plain small'})}</div>`;
}
function statusBadges(row){
 const status=returnStatus(row,sunday,state.now);
 return badge(status.label,status.overnight?'violet':status.arrived?'good':status.label==='마감 후 미입실'?'warn':'')
  +(row?.status?badge(requestLabels[row.kind]+' '+statusLabels[row.status],row.status==='rejected'?'bad':row.status==='approved'?'good':'warn'):'')
  +(status.needsReview&&row?.status!=='pending'?badge('사유 확인 필요','warn'):'');
}
const stats=()=>{
 const items=data().students.map(person=>({person,status:returnStatus(getRecord(person.id),sunday,state.now),row:getRecord(person.id)}));
 return {items,arrived:items.filter(item=>item.status.arrived).length,review:items.filter(item=>item.status.needsReview).length,
  overnight:items.filter(item=>item.status.overnight).length};
};
function dashboard(){
 if(!state.grant.roster)return studentHome();
 const {items,arrived,review,overnight}=stats();
 const stat=(caption,value,more='',accent=false)=>`<div class="card stat${accent?' highlight':''}"><h3>${caption}</h3><strong>${value}<small>명</small></strong><small>${more}</small></div>`;
 const housing=['구관','신관'].map(name=>{
  const list=items.filter(item=>building(item.person)===name);
  const landed=list.filter(item=>item.status.arrived).length;
  const passes=list.filter(item=>item.status.overnight&&!item.status.arrived).length;
  return `<article class="house"><div class="house-line"><h3>${name}</h3>${badge('전체 '+list.length+'명','violet')}</div>
   <progress value="${landed}" max="${list.length||1}" aria-label="${name} 입실 인원"></progress>
   <p class="subtle">입실 ${landed}명 · 외박 직등교 ${passes}명 · ${state.now>deadline(sunday)?'미입실':'입실 대기'} ${list.length-landed-passes}명</p></article>`;
 }).join('');
 const latest=activePenalties().slice(0,5).map(row=>{
  const person=student(row.studentId);
  return `<div class="simple-row"><div>${nameButton(person)}<p class="subtle">${day(row.date)} · ${e(row.title)}</p></div>${badge(row.points+'점','violet')}</div>`;
 }).join('');
 const reviewRows=items.filter(item=>item.status.needsReview).slice(0,5).map(({person,row})=>`<div class="simple-row">
  <div>${nameButton(person)}<p class="subtle">${row.kind==='none'?'지연 입실 사유 확인 필요':e(requestLabels[row.kind]+' · '+row.reason)}</p></div>
  ${state.grant.write?button('확인','attendance-edit',{id:person.id,style:'secondary small'}):badge('확인 필요','warn')}</div>`).join('');
 return title('대시보드','2026학년도 기숙사 운영 현황',weekControl())+
  `<section class="hero"><div class="hero-content"><p class="school">일요일 입실</p><h2>${day(sunday)} 오후 8시 마감</h2>
   <p class="subtle">기록은 한국 시간 기준으로 저장됩니다.</p></div>${button('입실 현황 보기','go-attendance',{style:'primary'})}</section>
   <div class="cards">${stat('전체 학생',items.length,'남학생 '+items.filter(item=>item.person.sex==='M').length+'명 · 여학생 '+items.filter(item=>item.person.sex==='F').length+'명')}
   ${stat('입실 완료',arrived,'실제 입실 시간 기록',true)}${stat('확인 필요',review,'외박·지연 입실 사유')}
   ${stat('외박 승인',overnight,'월요일 학교 직등교')}</div>
   <div class="grid-two">${panel('생활관별 현황','<div class="housing">'+housing+'</div>')}
   ${panel('확인이 필요한 기록',reviewRows?'<div class="simple-list">'+reviewRows+'</div>':empty('확인이 필요한 기록이 없습니다.'),button('목록 보기','review-list',{style:'plain small'}))}</div>
   ${panel('최근 벌점 기록',latest?'<div class="simple-list">'+latest+'</div>':empty('등록된 벌점이 없습니다.'),
     button('전체 내역','go-penalties',{style:'plain small'}))}`;
}
function studentHome(){
 const person=myStudent();
 const row=getRecord(person.id);
 return title('내 생활관',label(person),weekControl())+
  `<section class="hero"><div class="hero-content"><p class="school">나의 생활관</p><h2>${e(residence(person))}</h2>
  <p class="subtle">${day(sunday)} 일요일 오후 8시 입실 마감</p></div>${button('입실·외박 보기','go-attendance',{style:'primary'})}</section>
  <div class="grid-two">${panel('이번 입실 상태',statusBadges(row)+`<p>${row?.actualAt?'실제 입실 '+clock(row.actualAt):'아직 실제 입실 시간이 기록되지 않았습니다.'}</p>`)}
  ${panel('누적 벌점',`<div class="stat highlight"><strong>${points(person.id)}<small>점</small></strong></div>`,button('내역 보기','go-penalties',{style:'plain small'}))}</div>`;
}
function studentsView(){
 const filters=`<div class="filters four">
  ${input('query','이름 또는 학번 검색','search',studentFilter.query,'placeholder="예: 김승현" maxlength="60"')}
  ${select('grade','학년',[['','전체'],['1','1학년'],['2','2학년']],studentFilter.grade)}
  ${select('sex','성별',[['','전체'],['M','남학생'],['F','여학생']],studentFilter.sex)}
  ${select('house','생활관',[['','전체'],['구관','구관'],['신관','신관 전체'],['신관 4층','신관 4층']],studentFilter.house)}</div>`;
 return title('학생 관리','학생을 선택하면 생활관과 생활 기록을 볼 수 있습니다.',
  state.grant.manage?button('＋ 학생 추가','student-new',{style:'primary'}):'')+
  panel('학생 명단','<div id="student-filters">'+filters+'</div><div id="student-results"></div>');
}
function renderStudents(){
 const subset=data().students.filter(person=>match(person,studentFilter.query)
  &&(!studentFilter.grade||person.grade===Number(studentFilter.grade))
  &&(!studentFilter.sex||person.sex===studentFilter.sex)&&(!studentFilter.house||(studentFilter.house==='신관'?building(person)==='신관':residence(person)===studentFilter.house)))
  .sort((a,b)=>a.number.localeCompare(b.number));
 $('student-results').innerHTML=`<p class="subtle" role="status">${subset.length}명</p>`+(subset.length?`<div class="rows">
  ${rowHead(['학생','성별','생활관','누적 벌점','관리'])}
  ${subset.map(person=>`<div class="row">${cell('학생',nameButton(person))}${cell('성별',person.sex==='F'?'여학생':'남학생')}
  ${cell('생활관',badge(residence(person),'violet'))}${cell('누적 벌점',points(person.id)+'점')}
  <div class="actions">${state.grant.manage?button('수정','student-edit',{id:person.id,style:'plain small'}):''}</div></div>`).join('')}</div>`:empty('조건에 맞는 학생이 없습니다.'));
}
const activePenalties=()=>data().penalties.filter(row=>!row.deletedAt).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
function penaltySubset(){
 return (penaltyFilter.trash?data().penalties.filter(row=>row.deletedAt).sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt)):activePenalties())
  .filter(row=>match(student(row.studentId),penaltyFilter.query)&&(!penaltyFilter.from||row.date>=penaltyFilter.from)
   &&(!penaltyFilter.to||row.date<=penaltyFilter.to));
}
function penaltiesView(){
 const write=state.grant.write;
 const actions=`<div class="toolbar">${write?button('＋ 벌점 기록','penalty-new',{style:'primary'}):''}
  ${state.grant.roster?button('CSV 내보내기','penalty-csv',{style:'plain'}):''}
  ${write?button(penaltyFilter.trash?'일반 기록':'휴지통','penalty-trash',{style:'plain'}):''}</div>`;
 return title(state.grant.roster?'벌점 기록':'내 벌점 기록',state.grant.roster?'항목의 기본 점수를 바꿔도 이미 저장한 기록에는 기존 점수가 표시됩니다.':'누적 '+points(state.user.id)+'점',actions)+
  panel(penaltyFilter.trash?'삭제한 벌점':'벌점 내역',`<div class="filters three" id="penalty-filters">${state.grant.roster?input('query','학생 이름 또는 학번','search',penaltyFilter.query):''}
  ${input('from','시작 날짜','date',penaltyFilter.from)}${input('to','종료 날짜','date',penaltyFilter.to)}</div><div id="penalty-results"></div>`);
}
function renderPenalties(){
 const list=penaltySubset();
 $('penalty-results').innerHTML=list.length?`<div class="rows">${rowHead(['학생','항목','날짜','점수','관리'],'compact')}
  ${list.map(row=>`<div class="row compact">${cell('학생',state.grant.roster?nameButton(student(row.studentId)):e(label(myStudent())))}
  ${cell('항목','<strong>'+e(row.title)+'</strong><p class="subtle">'+e(row.author)+(row.memo?' · '+e(row.memo):'')+'</p>')}
  ${cell('날짜',day(row.date))}${cell('점수',badge(row.points+'점','violet'))}
  <div class="actions">${state.grant.write?(row.deletedAt?button('복구','penalty-undo',{id:row.id,style:'plain small'}):
    button('수정','penalty-edit',{id:row.id,style:'plain small'})+button('삭제','penalty-delete',{id:row.id,style:'danger small'})):''}</div></div>`).join('')}</div>`:empty('조회할 벌점 기록이 없습니다.');
}
function attendanceView(){
 if(!state.grant.roster)return studentAttendance();
 const tools=`<div class="filters four" id="attendance-filters">
  ${input('query','이름 또는 학번 검색','search',attendanceFilter.query,'placeholder="학생 이름"')}
  ${select('house','생활관',[['','전체'],['구관','구관'],['신관','신관 전체'],['신관 4층','신관 4층']],attendanceFilter.house)}
  ${select('status','현황',[['','전체'],['review','확인 필요'],['arrived','입실 완료'],['overnight','외박 승인'],['missing','대기·미입실']],attendanceFilter.status)}
  ${select('kind','신청 구분',[['','전체'],['overnight','외박'],['late','지연 입실']],attendanceFilter.kind)}</div>`;
 return title('입실·외박 관리',day(sunday)+' 일요일 · 오후 8시 입실 마감 (한국 시간)',weekControl())+
  panel('일요일 입실 현황',tools+'<div id="attendance-results"></div>');
}
function renderAttendance(){
 const rows=stats().items.filter(({person,status,row})=>match(person,attendanceFilter.query)&&
  (!attendanceFilter.house||(attendanceFilter.house==='신관'?building(person)==='신관':residence(person)===attendanceFilter.house))
  &&(!attendanceFilter.kind||row?.kind===attendanceFilter.kind)
  &&(!attendanceFilter.status||(attendanceFilter.status==='missing'?!status.arrived&&!status.overnight:
   ({review:status.needsReview,arrived:status.arrived,overnight:status.overnight})[attendanceFilter.status])))
  .sort((a,b)=>Number(b.status.needsReview)-Number(a.status.needsReview)||a.person.number.localeCompare(b.person.number));
 $('attendance-results').innerHTML=`<p class="subtle" role="status">${rows.length}명</p>`+(rows.length?`<div class="rows">
  ${rowHead(['학생','생활관','상태','실제 입실','관리'],'article')}
  ${rows.map(({person,row})=>`<div class="row article">${cell('학생',nameButton(person))}
   ${cell('생활관',e(residence(person)))}${cell('상태',statusBadges(row))}
   ${cell('실제 입실',row?.actualAt?clock(row.actualAt):'—')}
   <div class="actions">${state.grant.write?button(row?'기록 열기':'입실 등록','attendance-edit',{id:person.id,style:'plain small'}):''}</div></div>`).join('')}</div>`:empty('조건에 맞는 학생이 없습니다.'));
}
function requestDescription(row,week){
 if(!row)return '';
 return (row.reason?`<p><strong>신청 사유</strong> ${e(row.reason)}</p>`:'')
  +(row.expectedAt?`<p><strong>입실 예정</strong> ${clock(row.expectedAt)}</p>`:'')
  +(row.actualAt?`<p><strong>실제 입실</strong> ${clock(row.actualAt)} · ${e(row.checkedBy)}</p>`:'')
  +(row.kind==='overnight'&&row.status==='approved'?`<p><strong>직등교</strong> ${day(addDays(week,1))} 월요일</p>`:'')
  +(row.reviewer?`<p class="subtle">확인 담당 ${e(row.reviewer)} · ${e(displayTime(row.reviewedAt))}</p>`:'');
}
function historyFor(person){
 const list=data().attendance.filter(row=>row.studentId===person.id).sort((a,b)=>b.sunday.localeCompare(a.sunday));
 return list.length?list.map(row=>`<article class="house"><div class="house-line"><strong>${day(row.sunday)} 일요일</strong>
  ${badge(returnStatus(row,row.sunday,state.now).label,'violet')}${row.status?badge(statusLabels[row.status]):''}
  </div>${requestDescription(row,row.sunday)}</article>`).join(''):empty('입실 또는 신청 기록이 없습니다.');
}
function studentAttendance(){
 const row=getRecord(state.user.id);
 const action=row?.status==='approved'?'':button(row?.status==='pending'?'신청 수정':'외박·지연 입실 신청','request-edit',{style:'primary'});
 return title('입실·외박',day(sunday)+' 일요일 · 오후 8시 입실 마감 (한국 시간)',weekControl())+
  panel('선택한 일요일',`<div class="row-between"><div>${statusBadges(row)}</div><div class="toolbar">${action}
  ${row?.status==='pending'?button('신청 취소','request-cancel',{style:'danger'}):''}</div></div>
  ${requestDescription(row,sunday)||'<p class="subtle">실제 입실은 사감 선생님이 기록합니다.</p>'}`)+
  panel('나의 입실·외박 기록',historyFor(myStudent()));
}
function settings(){
 const account=panel('계정',`<p>${e(state.user.name)} · ${state.grant.roster?e(roleLabels[state.user.role]):'학생'}</p>`,integrated?'':button('비밀번호 변경','password',{style:'plain small'}));
 if(!state.grant.manage)return title(state.grant.roster?'관리 설정':'내 계정')+account;
 const rules=data().rules.map(rule=>`<div class="simple-row"><div><strong>${e(rule.title)}</strong><p class="subtle">기본 ${rule.points}점</p></div>
  <div class="toolbar">${button('수정','rule-edit',{id:rule.id,style:'plain small'})}${button('삭제','rule-delete',{id:rule.id,style:'danger small'})}</div></div>`).join('');
 const staffRows=state.staff.map(person=>`<div class="row permission-row"><strong>${e(person.name)}</strong><p>${e(roleLabels[person.role])}</p>
  <div class="actions">${person.role==='manager'?'':button('권한 변경','staff-role',{id:person.id,style:'plain small'})}</div></div>`).join('');
 return title('관리 설정','벌점 기준과 조회·기록 권한을 설정할 수 있습니다.')+account+
  panel('데이터 백업·복원',`<p class="subtle">명단, 벌점, 휴지통, 입실·외박 기록을 JSON으로 내려받습니다. 로그인 정보는 백업 파일에 포함되지 않습니다.</p>
   <div class="toolbar">${button('전체 백업 다운로드','backup') }${button('백업 파일 복원','backup-restore',{style:'plain'})}
   <input type="file" id="backup-file" accept=".json,application/json" hidden></div>`)+
  panel('교직원 권한','<div class="rows">'+staffRows+'</div>')+
  panel('벌점 항목 · '+data().rules.length+'개',rules||empty('등록된 벌점 항목이 없습니다.'),button('＋ 항목 추가','rule-new',{style:'primary small'}));
}

function draw(){
 const isStaff=state.grant.roster;
 const list=isStaff?tabs:studentTabs;
 $('account-name').textContent=state.user.name+' · '+(isStaff?'교직원':'학생');
 $('nav').innerHTML=Object.entries(list).map(([key,[glyph,caption]])=>`<button type="button" class="nav-item" data-nav="${key}" ${view===key?'aria-current="page"':''}><span class="nav-glyph" aria-hidden="true">${glyph}</span>${caption}</button>`).join('');
 $('content').innerHTML=({home:dashboard,students:studentsView,penalties:penaltiesView,attendance:attendanceView,settings})[view]();
 renderStudentsIfNeeded();
}
function renderStudentsIfNeeded(){
 if(view==='students')renderStudents();
 if(view==='penalties')renderPenalties();
 if(view==='attendance'&&state.grant.roster)renderAttendance();
}
function go(page){view=page;draw();window.scrollTo(0,0);}
let requestSequence=0;
function ieumRequest(path,body){
 if(window.parent===window)return Promise.reject(new Error('이음에서 로그인한 뒤 교내 프로그램의 보금자리를 열어 주세요.'));
 const requestId=++requestSequence;
 return new Promise((resolve,reject)=>{
  const finish=()=>{clearTimeout(timeout);window.removeEventListener('message',reply);};
  function reply(event){
   if(event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='ieum-dorm-response'||event.data.requestId!==requestId)return;
   finish();
   if(event.data.status)reject(Object.assign(new Error(event.data.error),{status:event.data.status}));
   else resolve(event.data.result);
  }
  const timeout=setTimeout(()=>{finish();reject(new Error('이음 서버 응답이 늦습니다. 보금자리를 다시 열어 주세요.'));},16000);
  window.addEventListener('message',reply);
  window.parent.postMessage({type:'ieum-dorm-request',requestId,path,body},location.origin);
 });
}
async function api(path,body){
 if(integrated)return ieumRequest(path,body);
 const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',
  headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json();
 if(!response.ok)throw Object.assign(new Error(result.error||'서버에 연결할 수 없습니다.'),{status:response.status});
 return result;
}
function notify(message){
 clearTimeout(toastTimer);
 $('notice').textContent=message;
 $('notice').hidden=false;
 toastTimer=setTimeout(()=>$('notice').hidden=true,4300);
}
function signInScreen(message){
 state=null;view='home';sunday=undefined;
 $('shell').hidden=true;$('content').replaceChildren();$('nav').replaceChildren();
 if($('dialog').open)$('dialog').close();
 if(integrated){
  $('ieum-status').textContent=message||'이음에 다시 로그인한 뒤 보금자리를 열어 주세요.';
  $('ieum-message').hidden=false;
  return;
 }
 $('signin').hidden=false;
 $('login-form').reset();
}
async function enter(){
 state=await api('state');sunday=state.sunday;view='home';
 studentFilter={};penaltyFilter={};attendanceFilter={};
 if($('signin'))$('signin').hidden=true;
 $('ieum-message').hidden=true;$('shell').hidden=false;draw();
}
function openDialog(heading,markup,action=null,caption='저장'){
 handler=action;
 $('dialog-title').textContent=heading;$('dialog-body').innerHTML=markup;$('dialog-error').textContent='';
 $('dialog-submit').textContent=caption;$('dialog-foot').hidden=!action;
 if(!$('dialog').open)$('dialog').showModal();
}
function confirm(title,description,action,caption){
 openDialog(title,`<p>${e(description)}</p>`,action,caption);
}
async function save(body,message){
 try{
  const next=await api('write',{...body,revision:state.revision});
  state=next;draw();notify(message);
  const issued=Object.entries(next.issued||{});
  return issued.length?()=>openDialog('학생 접속정보',`<p class="subtle">각 비밀번호는 해당 학생에게만 전달하세요.</p>
   <div class="simple-list">${issued.map(([id,password])=>`<div class="simple-row"><strong>${e(label(student(id)))}</strong><code>${e(password)}</code></div>`).join('')}</div>`):null;
 }catch(error){
  if(error.status===409){state=await api('state');draw();}
  if(error.status===401)signInScreen();
  throw error;
 }
}
const fields=value=>new FormData(value);
const get=(form,name)=>String(fields(form).get(name)??'');
function editStudent(id){
 const person=id?student(id):null;
 openDialog(person?'학생 정보 수정':'학생 추가',`<div class="fields">
  ${input('name','이름','text',person?.name,'required maxlength="60"')}
  ${input('number','학번','text',person?.number,'required inputmode="numeric" pattern="[12][1-9][0-9]{2}" maxlength="4"')}
  ${select('grade','학년',[[1,'1학년'],[2,'2학년']],person?.grade||1,true)}
  ${select('sex','성별',[['M','남학생'],['F','여학생']],person?.sex||'M',true)}
  <p class="subtle">생활관은 학년과 성별에 따라 배정됩니다.</p></div>`,form=>save({action:'student-save',id,
   name:get(form,'name'),number:get(form,'number'),grade:Number(get(form,'grade')),sex:get(form,'sex')},'학생 정보를 저장했습니다.'));
}
function detail(id){
 const person=student(id);
 if(!person)return;
 const rows=activePenalties().filter(row=>row.studentId===id).map(row=>`<div class="simple-row">
  <div><strong>${e(row.title)}</strong><p class="subtle">${day(row.date)} · ${e(row.author)}${row.memo?' · '+e(row.memo):''}</p></div>${badge(row.points+'점','violet')}</div>`).join('');
 openDialog(person.name+' 학생',`<dl class="detail-info">
  <div><dt>학번</dt><dd>${e(person.number)}</dd></div><div><dt>학년</dt><dd>${gradeLabel(person)}</dd></div>
  <div><dt>성별</dt><dd>${person.sex==='F'?'여학생':'남학생'}</dd></div><div><dt>생활관</dt><dd>${e(residence(person))}</dd></div>
  <div><dt>누적 벌점</dt><dd>${points(id)}점</dd></div></dl>
  <section class="detail-section"><h3>벌점 내역</h3>${rows?'<div class="simple-list">'+rows+'</div>':empty('등록된 벌점이 없습니다.')}</section>
  <section class="detail-section"><h3>입실·외박 기록</h3>${historyFor(person)}</section>
  <div class="toolbar">${state.grant.write?button('벌점 기록','penalty-for',{id,style:'primary'}):''}
  ${state.grant.manage&&!integrated?button('비밀번호 재발급','student-reset',{id,style:'plain'}):''}</div>`);
}
function editPenalty(id,personId){
 const row=id?data().penalties.find(p=>p.id===id):null;
 const rules=data().rules.map(rule=>[rule.id,rule.title+' · '+rule.points+'점']);
 if(row){
  const index=rules.findIndex(([key])=>key===row.ruleId);
  const historical=[row.ruleId,row.title+' · 기존 기록 '+row.points+'점'];
  if(index<0)rules.unshift(historical);
  else rules[index]=historical;
 }
 if(!rules.length){
  openDialog('벌점 항목이 없습니다',`<p>관리 설정에서 먼저 벌점 항목을 등록하세요.</p>
    ${state.grant.manage?button('관리 설정 열기','settings-open'):''}`);
  return;
 }
 const students=data().students.slice().sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.number.localeCompare(b.number));
 openDialog(row?'벌점 기록 수정':'벌점 기록',`<div class="fields"><div class="wide">${input('student_search','학생 이름 또는 학번 검색','search','',
  'placeholder="선택할 학생 찾기" maxlength="60"')}</div>
  <div class="wide">${select('studentId','학생',[['','학생 선택'],...students.map(person=>[person.id,label(person)])],row?.studentId||personId,true)}</div>
  <div class="wide">${select('ruleId','벌점 항목',[['','항목 선택'],...rules],row?.ruleId,true)}</div>
  ${input('points','점수','number',row?.points,'required min="1" max="999"')}
  ${input('date','날짜','date',row?.date||state.today,'required')}
  ${note('memo','메모',row?.memo)}</div><p class="subtle">기록 담당 ${e(row?.author||state.user.name)}</p>`,
  form=>save({action:'penalty-save',id,studentId:get(form,'studentId'),ruleId:get(form,'ruleId'),
   points:Number(get(form,'points')),date:get(form,'date'),memo:get(form,'memo')},'벌점 기록을 저장했습니다.'));
}
function editRule(id){
 const rule=id?data().rules.find(item=>item.id===id):null;
 openDialog(rule?'벌점 항목 수정':'벌점 항목 추가',`<div class="fields"><div class="wide">${input('title','항목명','text',rule?.title,'required maxlength="170"')}</div>
  ${input('points','기본 점수','number',rule?.points,'required min="1" max="999"')}</div>`,
  form=>save({action:'rule-save',id,title:get(form,'title'),points:Number(get(form,'points'))},'벌점 항목을 저장했습니다.'));
}
function editAttendance(id,studentMode=false){
 const person=student(id);
 const row=getRecord(id);
 const staffMode=!studentMode;
 const kind=row?.kind&&row.kind!=='none'?row.kind:studentMode?'overnight':row?.actualAt>deadline(sunday)?'late':'none';
 const kindChoices=Object.entries(requestLabels).filter(([key])=>staffMode||key!=='none');
 const caption=studentMode?'외박·지연 입실 신청':person.name+' 입실·외박';
 openDialog(caption,`<p class="subtle">${e(label(person))} · ${day(sunday)} 일요일 · 오후 8시 마감</p>
   <div class="fields">${select('kind','구분',kindChoices,kind,true)}
   ${staffMode?`<div id="approval-field">${select('status','사감 확인',Object.entries(statusLabels),row?.status||'pending',true)}</div>`:''}
   <div class="wide" id="reason-field">${note('reason','신청 또는 지연 사유',row?.reason,true)}</div>
   <div class="wide" id="expected-field">${input('expectedAt','지연 입실 예정 (한국 시간)','datetime-local',row?.expectedAt)}</div>
   ${staffMode?`<div class="wide">${input('actualAt','실제 입실 (한국 시간)','datetime-local',row?.actualAt)}</div>
    <div class="toolbar wide">${button('현재 시간 넣기','actual-now',{style:'plain small'})}</div>`:''}
   </div>${row?.reviewedAt?`<p class="subtle">마지막 확인 ${e(row.reviewer)} · ${e(displayTime(row.reviewedAt))}</p>`:''}`,
  form=>save({action:studentMode?'request-save':'attendance-save',studentId:id,sunday,kind:get(form,'kind'),reason:get(form,'reason'),
   status:get(form,'status'),expectedAt:get(form,'expectedAt'),actualAt:get(form,'actualAt')},studentMode?'신청을 보냈습니다.':'입실·외박 기록을 저장했습니다.'),
   studentMode?'신청 보내기':'저장');
 attendanceFields();
}
function attendanceFields(){
 const kind=$('dialog-form').elements.kind?.value;
 if(!kind||!$('reason-field'))return;
 for(const [id,show] of [['reason-field',kind!=='none'],['approval-field',kind!=='none'],['expected-field',kind==='late']]){
  const field=$(id);
  if(!field)continue;
  field.hidden=!show;
  for(const control of field.querySelectorAll('select,input,textarea')){control.disabled=!show;control.required=show;}
 }
}
function download(filename,value,type){
 const url=URL.createObjectURL(new Blob([value],{type}));
 const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function csv(){
 const rows=penaltySubset().map(row=>{
  const person=student(row.studentId);
  return [person.number,person.name,gradeLabel(person),row.title,row.points,row.date,row.memo,row.author,row.deletedAt?displayTime(row.deletedAt):''];
 });
 const quote=value=>{
  let cell=String(value??'');
  if(/^[\s\u0000-\u001f]*[=+\-@]/.test(cell))cell="'"+cell;
  return '"'+cell.replaceAll('"','""')+'"';
 };
 download('보금자리_벌점_'+state.today+'.csv','\uFEFF'+[['학번','이름','학년','항목','점수','날짜','메모','기록 담당','삭제 시각'],...rows]
  .map(row=>row.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}

const actions={
 close:()=>$('dialog').close(),
 'go-attendance':()=>go('attendance'),
 'go-penalties':()=>go('penalties'),
 'review-list':()=>{attendanceFilter={status:'review'};go('attendance');},
 'week-prev':()=>{sunday=addDays(sunday,-7);draw();},
 'week-next':()=>{sunday=addDays(sunday,7);draw();},
 'week-current':()=>{sunday=state.sunday;draw();},
 'student-new':()=>editStudent(),
 'student-edit':id=>editStudent(id),
 'student-detail':id=>detail(id),
 'penalty-new':()=>editPenalty(),
 'penalty-for':id=>editPenalty(null,id),
 'penalty-edit':id=>editPenalty(id),
 'penalty-trash':()=>{penaltyFilter.trash=!penaltyFilter.trash;draw();},
 'penalty-csv':csv,
 'penalty-delete':id=>confirm('벌점 기록 삭제','삭제하면 누적 점수에서 제외되며 휴지통에서 다시 복구할 수 있습니다.',
  ()=>save({action:'penalty-delete',id},'벌점 기록을 휴지통으로 옮겼습니다.'),'휴지통으로 이동'),
 'penalty-undo':id=>confirm('벌점 기록 복구','이 기록을 복구해 학생의 누적 점수에 다시 포함합니다.',
  ()=>save({action:'penalty-undo',id},'벌점 기록을 복구했습니다.'),'복구'),
 'rule-new':()=>editRule(),
 'rule-edit':id=>editRule(id),
 'rule-delete':id=>confirm('벌점 항목 삭제','앞으로 새 기록에 이 항목을 선택할 수 없습니다. 기존 벌점 기록은 계속 표시됩니다.',
  ()=>save({action:'rule-remove',id},'벌점 항목을 삭제했습니다.'),'항목 삭제'),
 'attendance-edit':id=>editAttendance(id),
 'request-edit':()=>editAttendance(state.user.id,true),
 'request-cancel':()=>confirm('신청 취소','선택한 일요일의 확인 대기 신청을 취소합니다.',
  ()=>save({action:'request-cancel',sunday},'신청을 취소했습니다.'),'신청 취소'),
 'actual-now':()=>$('dialog-form').elements.actualAt.value=new Date(Date.now()+9*3600000).toISOString().slice(0,16),
 'settings-open':()=>{$('dialog').close();go('settings');},
 'student-reset':id=>confirm('비밀번호 재발급',student(id).name+' 학생의 비밀번호를 바꾸고 기존 로그인 세션을 종료합니다.',
  ()=>save({action:'student-reset',id},'새 비밀번호를 발급했습니다.'),'비밀번호 재발급'),
 'staff-role':id=>{
  const person=state.staff.find(member=>member.id===id);
  openDialog(person.name+' 권한',select('role','권한',[['staff','기록 관리'],['viewer','조회 전용']],person.role,true),
   form=>save({action:'staff-role',id,role:get(form,'role')},'교직원 권한을 저장했습니다.'));
 },
 backup:()=>download('보금자리_백업_'+state.today+'.json',JSON.stringify(data(),null,2),'application/json;charset=utf-8'),
 'backup-restore':()=>$('backup-file').click(),
 password:()=>openDialog('비밀번호 변경',input('current','현재 비밀번호','password','','required autocomplete="current-password"')+
   input('password','새 비밀번호','password','','required minlength="8" maxlength="200" autocomplete="new-password"')+
   input('confirm','새 비밀번호 확인','password','','required minlength="8" maxlength="200" autocomplete="new-password"'),async form=>{
    if(get(form,'password')!==get(form,'confirm'))throw new Error('새 비밀번호가 서로 다릅니다.');
    await api('password',{current:get(form,'current'),password:get(form,'password')});
    notify('비밀번호를 변경했습니다.');
   }),
 refresh:async()=>{
  try{state=await api('state');draw();notify('최신 기록을 불러왔습니다.');}
  catch(error){if(error.status===401)signInScreen();else throw error;}
 },
 logout:async()=>{await api('logout',{});signInScreen();},
};
document.addEventListener('click',async event=>{
 const node=event.target.closest('button');
 if(!node)return;
 if(node.dataset.loginMode){
  loginMode=node.dataset.loginMode;
  $('login-label').textContent=loginMode==='student'?'학생 학번':'교직원 이름';
  $('login-form').elements.login.inputMode=loginMode==='student'?'numeric':'text';
  $('login-form').elements.login.value='';
  $('login-error').textContent='';
  for(const item of document.querySelectorAll('[data-login-mode]'))item.setAttribute('aria-pressed',String(item===node));
  return;
 }
 if(node.dataset.nav){go(node.dataset.nav);return;}
 const action=actions[node.dataset.action];
 if(!action||node.disabled)return;
 try{await action(node.dataset.id);}catch(error){notify(error.message);}
});
function updateFilters(target){
 for(const [id,filter,render] of [['student-filters',studentFilter,renderStudents],['penalty-filters',penaltyFilter,renderPenalties],
  ['attendance-filters',attendanceFilter,renderAttendance]]){
  if(target.closest('#'+id)){filter[target.name]=target.value;render();return;}
 }
 if(target.name==='student_search'){
  const field=$('dialog-form').elements.studentId;
  const picked=field.value;
  const matches=data().students.filter(person=>match(person,target.value)).sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.number.localeCompare(b.number));
  field.innerHTML=choices(picked,[['','학생 선택'],...matches.map(person=>[person.id,label(person)])]);
 }
}
document.addEventListener('input',event=>{
 if(state&&event.target.matches('input[type=search]'))updateFilters(event.target);
});
document.addEventListener('change',async event=>{
 const target=event.target;
 if(!state)return;
 if(target.id==='backup-file'){
  const [file]=target.files;
  target.value='';
  if(!file)return;
  try{
   if(file.size>16*1024*1024)throw new Error('16MB 이하의 백업을 선택하세요.');
   const backup=JSON.parse(await file.text());
   confirm('백업 복원','현재 명단과 생활 기록을 선택한 백업으로 교체합니다. 먼저 현재 백업을 내려받았는지 확인하세요.',
     ()=>save({action:'backup-restore',backup},'백업을 복원했습니다.'),'백업 복원');
  }catch(error){notify(error instanceof SyntaxError?'읽을 수 있는 JSON 백업 파일을 선택하세요.':error.message);}
 }else if(target.id==='week-date'){
  if(!target.value||new Date(target.value).getUTCDay()!==0){target.value=sunday;notify('일요일 날짜를 선택하세요.');return;}
  sunday=target.value;draw();
 }else if(target.name==='kind'&&target.closest('#dialog'))attendanceFields();
 else if(target.name==='ruleId'&&target.closest('#dialog')){
  const rule=data().rules.find(item=>item.id===target.value);
  if(rule)$('dialog-form').elements.points.value=rule.points;
 }else if(!target.matches('input[type=search]'))updateFilters(target);
});
$('dialog-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!handler)return;
 const submit=$('dialog-submit');
 submit.disabled=true;$('dialog-error').textContent='';
 try{
  const finish=await handler(event.currentTarget);
  $('dialog').close();
  if(typeof finish==='function')finish();
 }catch(error){$('dialog-error').textContent=error.message;}
 finally{submit.disabled=false;}
});
$('login-form')?.addEventListener('submit',async event=>{
 event.preventDefault();
 const submit=event.submitter,form=event.currentTarget;
 submit.disabled=true;$('login-error').textContent='';
 try{await api('login',{login:get(form,'login'),password:get(form,'password'),mode:loginMode});form.reset();await enter();}
 catch(error){$('login-error').textContent=error.message;}
 finally{submit.disabled=false;}
});
if(integrated){
 $('dorm-logout').hidden=true;
 $('ieum-message').hidden=false;
}
enter().catch(error=>{
 if(integrated)signInScreen(error.message);
 else if(error.status!==401)$('login-error').textContent='서버에 연결할 수 없습니다. 프로그램이 실행 중인지 확인하세요.';
});

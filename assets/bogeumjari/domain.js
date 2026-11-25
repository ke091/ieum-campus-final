const DAY=86400000;
export const addDays=(day,delta)=>new Date(Date.parse(day)+delta*DAY).toISOString().slice(0,10);
export const deadline=sunday=>sunday+'T20:00';
export const residence=person=>person?.sex==='F'?'신관 4층':person?.grade===1?'구관':'신관';
export const building=person=>residence(person)==='구관'?'구관':'신관';
export function returnStatus(row,sunday,now){
 const late=Boolean(row?.actualAt && row.actualAt>deadline(sunday));
 const overnight=row?.kind==='overnight'&&row.status==='approved';
 const pending=row?.status==='pending';
 const needsReview=pending || (late && !(row.kind==='late' && ['approved','rejected'].includes(row.status)));
 let label='입실 대기';
 if(row?.actualAt)label=late?'지연 입실 완료':'입실 완료';
 else if(overnight)label='월요일 학교 직등교';
 else if(row?.kind==='late'&&row.status==='approved')label='지연 입실 예정';
 else if(now>deadline(sunday))label='마감 후 미입실';
 return {label,needsReview,overnight,arrived:Boolean(row?.actualAt),late};
}

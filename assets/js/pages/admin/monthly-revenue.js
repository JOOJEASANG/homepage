// Preserve the existing reception-date revenue definition, using a rolling 12-month window.
export function monthlyRevenue(quotes, now = new Date()) {
  const months = Array.from({length:12}, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
    return {key: monthKey(d), count:0, total:0, confirmed:0};
  });
  const byKey = new Map(months.map(m => [m.key,m]));
  for (const q of quotes) {
    if (!q.createdAt || q.status === '주문취소' || q.requestType === 'estimate') continue;
    const d = typeof q.createdAt.toDate === 'function' ? q.createdAt.toDate() : new Date(q.createdAt);
    if (!Number.isFinite(d?.getTime?.())) continue;
    const m = byKey.get(monthKey(d));
    if (!m) continue;
    const raw = Number(q.finalPrice || q.totalPrice || 0);
    const price = Number.isFinite(raw) ? raw : 0;
    m.count++;
    m.total += price;
    if (['결제완료','작업완료'].includes(q.status)) m.confirmed += price;
  }
  return months;
}
function monthKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}
export function revenueAxisMax(months) {
  const max = Math.max(0,...months.flatMap(m => [m.total,m.confirmed]));
  if (max === 0) return 10000;
  const step = 10 ** Math.floor(Math.log10(max / 4));
  return Math.ceil(max / (step*4)) * step*4;
}
export const sumMonthlyRevenue = months => months.reduce((acc,m) => ({count:acc.count+m.count,total:acc.total+m.total,confirmed:acc.confirmed+m.confirmed}),{count:0,total:0,confirmed:0});
const won = n => n.toLocaleString('ko-KR') + '원';
export function renderMonthlyRevenue(root, months) {
  if (!root) return;
  const sum = sumMonthlyRevenue(months);
  const axisMax = revenueAxisMax(months);
  root.querySelector('#revenue-total').textContent = won(sum.total);
  root.querySelector('#revenue-confirmed').textContent = won(sum.confirmed);
  root.querySelector('#revenue-count').textContent = sum.count.toLocaleString('ko-KR') + '건';
  const ticks = root.querySelector('#revenue-axis');
  ticks.replaceChildren(...[4,3,2,1,0].map(i => {
    const label = document.createElement('span');
    label.textContent = (axisMax*i/4/10000).toLocaleString('ko-KR',{maximumFractionDigits:4});
    return label;
  }));
  const bars = root.querySelector('#revenue-chart-bars');
  const info = root.querySelector('#revenue-month-detail');
  const activeKey = bars.querySelector('[aria-pressed="true"]')?.dataset.month;
  const select = (m) => {
    for (const btn of bars.children) btn.setAttribute('aria-pressed',String(btn.dataset.month === m.key));
    info.textContent = m.key + ' · ' + m.count.toLocaleString('ko-KR') + '건 | 접수 금액 ' + won(m.total) + ' | 확정 매출 ' + won(m.confirmed);
  };
  bars.replaceChildren(...months.map(m => {
    const btn = document.createElement('button');
    btn.type='button'; btn.className='revenue-month'; btn.dataset.month=m.key;
    btn.setAttribute('aria-label',m.key + ', 접수 ' + won(m.total) + ', 확정 ' + won(m.confirmed) + ', ' + m.count + '건');
    btn.title=btn.getAttribute('aria-label');
    const pair=document.createElement('span'); pair.className='revenue-bar-pair';
    for (const [name,value] of [['total',m.total],['confirmed',m.confirmed]]) {
      const bar=document.createElement('span'); bar.className='revenue-bar revenue-bar-'+name;
      bar.style.height=Math.min(100, Math.max(0, value/axisMax*100))+'%';
      pair.appendChild(bar);
    }
    const label=document.createElement('span'); label.className='revenue-month-label';
    label.textContent=m.key.slice(2).replace('-','.');
    const value = document.createElement('span');
    value.className='revenue-month-amount';
    value.textContent=won(m.confirmed);
    btn.append(pair,label,value);
    btn.addEventListener('click',()=>select(m));
    return btn;
  }));
  select(months.find(m=>m.key===activeKey)||months.at(-1));
  const makeRow = (m, label, totalRow = false) => {
    const tr=document.createElement('tr');
    for (const [index,value] of [label,m.count.toLocaleString('ko-KR')+'건',won(m.total),won(m.confirmed), (m.total>0?Math.round(m.confirmed/m.total*100):0)+'%'].entries()) {
      const cell=document.createElement(index===0?'th':'td');
      if (index===0) cell.scope='row';
      cell.textContent=value;
      cell.className='px-4 py-3 whitespace-nowrap' + (index===3?' revenue-confirmed-cell':'');
      tr.appendChild(cell);
    }
    if(totalRow) tr.className='revenue-total-row';
    return tr;
  };
  root.querySelector('#revenue-stats-body').replaceChildren(...months.map(m=>makeRow(m,m.key)));
  root.querySelector('#revenue-stats-total').replaceChildren(makeRow(sum,'12개월 합계',true));
}

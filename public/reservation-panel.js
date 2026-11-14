(() => {
  const isAdmin = location.pathname === '/admin';
  if(!isAdmin) return;
  const host = document.querySelector('.ledger-container');
  if (!host) return;
  const panel=document.createElement('section'); panel.className='reservation-tools admin-reservation-panel';
  const heading=document.createElement('h2'); heading.textContent='Reservations';
  const help=document.createElement('p'); help.textContent='Review pending requests, confirm availability and record guest arrivals.';
  const search=document.createElement('input'); search.placeholder='Phone, name or booking reference'; search.setAttribute('aria-label','Search reservations');
  const date=document.createElement('input'); date.type='date'; date.setAttribute('aria-label','Reservation date');
  const refresh=document.createElement('button'); refresh.type='button'; refresh.textContent='Check reservations';
  const status=document.createElement('p'); status.setAttribute('role','status');
  const list=document.createElement('div');
  panel.append(heading,help);
  panel.append(search,date,refresh,status,list);
  const customerReport=document.querySelector('#customer-report');
  if(customerReport) customerReport.insertAdjacentElement('afterend',panel);
  else host.append(panel);
  let records=[];
  async function load() {
    try {
      const response=await fetch('/api/admin/reservations'); const data=await response.json();
      if(!response.ok) throw new Error(data.error);
      records=data.reservations; status.textContent=`${records.filter(r=>r.status==='pending').length} pending requests. Updated ${new Date().toLocaleTimeString()}.`; render();return true;
    } catch(e) { records=[]; list.replaceChildren(); status.textContent=e.message;return false; }
  }
  function render() {
    list.replaceChildren();
    const outlet=document.querySelector(isAdmin?'#outlet-filter':'#outlet-select')?.value;
    const term=search.value.trim().toLowerCase();
    const rows=records.filter(r=>(!outlet||r.outlet===outlet)&&(!date.value||r.date===date.value)&&(!term||[r.name,r.mobile,r.id].some(v=>v.toLowerCase().includes(term)))).sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    if(!rows.length) { list.textContent='No matching reservations. Continue normal walk-in entry if appropriate.'; return; }
    for(const r of rows) {
      const card=document.createElement('article'); card.className='reservation-card';
      const title=document.createElement('h3'); title.textContent=`${r.name} · ${r.status.toUpperCase()}`;
      const info=document.createElement('p'); info.textContent=`${r.outlet} · ${r.date} ${r.time} · ${r.pax} booked guests${r.actual_pax?` · ${r.actual_pax} actual`:''}`;
      const details=document.createElement('p'); details.textContent=`${r.mobile} · ${r.id}${r.table_number?` · Table ${r.table_number}`:''}`;
      const notes=document.createElement('p'); notes.textContent=r.notes;
      const actions=document.createElement('div');
      const editor=document.createElement('div');
      const available={pending:[['confirmed','Confirm'],['arrived','Confirm and mark arrived'],['declined','Decline'],['cancelled','Cancel']],confirmed:[['arrived','Mark arrived'],['cancelled','Cancel'],['no-show','No-show']],arrived:[['seated','Assign table / seated']],seated:[['completed','Complete']]};
      for(const [next,label] of available[r.status]||[]) {
        const b=document.createElement('button'); b.type='button'; b.textContent=label;
        b.onclick=()=>{
          editor.replaceChildren();
          const field=(text,type,value)=>{const label=document.createElement('label'),input=document.createElement('input');input.type=type;input.value=value||'';label.append(text,input);editor.append(label);return input;};
          const capacity=['confirmed','arrived'].includes(next)?field('Seating availability checked','checkbox'):null;
          const pax=next==='arrived'?field('Actual arriving party size','number',r.pax):null;
          if(pax){pax.min='1';pax.max='50';}
          const table=next==='seated'?field('Table number','text'):null;
          const reason=['cancelled','declined'].includes(next)?field('Reason — communicate this to the guest','text'):null;
          const save=document.createElement('button');save.type='button';save.textContent=`Save: ${label}`;
          const message=document.createElement('p');message.setAttribute('role','status');editor.append(save,message);
          save.onclick=async()=>{
          const body={id:r.id,version:r.version,status:next,capacity_checked:capacity?.checked,actual_pax:pax?Number(pax.value):undefined,table_number:table?.value,reason:reason?.value};
          save.disabled=true;
          try {
            const response=await fetch('/api/admin/reservations/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();
            if(!response.ok) throw new Error(data.error);
            await load();
            if(next==='arrived') {const saved=document.createElement('p');saved.textContent='Arrival saved in the leads panel. This booking already has a visit; do not enter it again.';list.prepend(saved);}
            if(isAdmin) document.dispatchEvent(new Event('reservations-changed'));
          } catch(e) {message.textContent=e.message;}finally{save.disabled=false;}
          };
        }; actions.append(b);
      }
      const audit=document.createElement('details'), summary=document.createElement('summary');summary.textContent='Booking history';audit.append(summary);
      for(const event of r.history){const p=document.createElement('p');p.textContent=`${event.at} · ${event.actor}: ${event.from} → ${event.to} ${event.reason}`;audit.append(p);}
      card.append(title,info,details,notes,actions,editor,audit);list.append(card);
    }
  }
  refresh.onclick=load;search.oninput=render;date.onchange=render;
  document.querySelector('#outlet-filter')?.addEventListener('change',render);
  document.querySelector('#outlet-select')?.addEventListener('change',render);
  document.querySelectorAll('.filter-pill').forEach(b=>b.addEventListener('click',()=>setTimeout(render,0)));
  load();setInterval(()=>{if(!document.hidden&&!document.querySelector('#dashboard-view').hidden)load();},15000);document.querySelector('#login-form')?.addEventListener('submit',()=>setTimeout(load,1200));
})();

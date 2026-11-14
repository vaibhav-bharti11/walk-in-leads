import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLeadStore } from '../src/domain.mjs';
import { createReservationStore, validateBooking } from '../src/reservations.mjs';

test('gate confirmation is atomic, scoped and creates exactly one visit under concurrent check-in', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-15T06:00:00Z')});
  const directory=mkdtempSync(join(tmpdir(),'reservation-test-'));
  const databasePath=join(directory,'leads.db');
  const leads=createLeadStore(databasePath);
  const reservations=createReservationStore({databasePath});
  const booking={venue:'basque',name:'Test Guest',mobile:'9876543210',pax:4,date:'2026-11-15',time:'20:00',request_id:randomUUID()};
  try {
    const r=await reservations.create(booking);
    assert.equal(r.status,'pending');
    assert.equal((await reservations.create(booking)).id,r.id);
    assert.equal(leads.list().length,0);
    await assert.rejects(reservations.change(r.id,{version:1,status:'arrived',actual_pax:4},'hostess',['Basque']),/capacity/);
    await assert.rejects(reservations.change(r.id,{version:1,status:'arrived',actual_pax:4,capacity_checked:true},'hostess',['Kampai']),/Access denied/);
    assert.equal((await reservations.byToken(r.token)).status,'pending');
    const input={version:1,status:'arrived',actual_pax:5,capacity_checked:true};
    const results=await Promise.allSettled([
      reservations.change(r.id,input,'hostess A',['Basque']),
      reservations.change(r.id,input,'hostess B',['Basque']),
    ]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
    const arrived=await reservations.byToken(r.token);
    assert.equal(arrived.pax,4);
    assert.equal(arrived.actual_pax,5);
    assert.deepEqual(arrived.history.map(e=>[e.from,e.to]),[['pending','confirmed'],['confirmed','arrived']]);
    assert.equal(leads.list().length,1);
    assert.equal(leads.list()[0].id,arrived.lead_id);
    const seated=await reservations.change(r.id,{version:arrived.version,status:'seated',table_number:'B12'},'hostess',['Basque']);
    assert.equal(seated.status,'seated');
    assert.equal(leads.list()[0].table_number,'B12');
    const cancelled=await reservations.create({...booking,request_id:randomUUID()});
    await reservations.change(cancelled.id,{version:1,status:'cancelled',reason:'Plans changed'},'guest',[],cancelled.token);
    await assert.rejects(reservations.change(cancelled.id,{...input,version:2},'hostess',['Basque']),/not available/);
    const tomorrow=await reservations.create({...booking,date:'2026-11-16',request_id:randomUUID()});
    await assert.rejects(reservations.change(tomorrow.id,input,'hostess',['Basque']),/today/);
    assert.equal((await reservations.byToken(tomorrow.token)).history.length,0);
    assert.equal(leads.list().length,1);
    assert.throws(()=>validateBooking({...booking,venue:'embassy-cp'}),/available restaurant/);
  } finally {
    await reservations.close();leads.close();
    rmSync(directory,{recursive:true,force:true});
  }
});

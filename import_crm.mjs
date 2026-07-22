import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key, { auth:{ persistSession:false } });
const BRAND=1;
const normP = s => (s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const normPh = s => { let d=(s||'').replace(/[^0-9]/g,''); if(d.startsWith('0'))d='62'+d.slice(1); return d.length>=9?d:''; };
const okDate=(s,lo,hi)=>{ if(!s)return null; const y=+String(s).slice(0,4); return (y>=lo&&y<=hi)?s:null; };

const imported = JSON.parse(fs.readFileSync('/mnt/user-data/uploads/client data 2024/customers_crm.json','utf8'));
console.log('imported customers:', imported.length);

// fetch existing (paged)
let existing=[]; for(let from=0;;from+=1000){ const {data,error}=await db.from('customers').select('id,name,passport_no,passport_number,phone,whatsapp,tags,notes,first_trip_at,last_trip_at,passport_expiry,passport_issued_date,passport_issued_at,place_of_birth,dob,birthday,gender,referral_source').range(from,from+999); if(error){console.error(error);process.exit(1);} existing=existing.concat(data); if(data.length<1000)break; }
console.log('existing customers:', existing.length);
const byPass=new Map(); const byPhone=new Map();
for(const e of existing){ const p=normP(e.passport_no||e.passport_number); if(p) if(!byPass.has(p))byPass.set(p,e); const ph=normPh(e.phone||e.whatsapp); if(ph){ if(!byPhone.has(ph))byPhone.set(ph,[]); byPhone.get(ph).push(e);} }

const toInsert=[]; const toUpdate=[];
for(const c of imported){
  const p=normP(c.passport_no); const ph=normPh(c.phone);
  let match=null;
  if(p && byPass.has(p)) match=byPass.get(p);
  else if(!p && ph && byPhone.get(ph)?.length===1) match=byPhone.get(ph)[0];
  const dob=okDate(c.dob,1900,2035), exp=okDate(c.passport_expiry,2010,2045), iss=okDate(c.passport_issued_date,2000,2035);
  const ft=okDate(c.first_trip_at,2019,2027), lt=okDate(c.last_trip_at,2019,2027);
  if(match){
    const tags=[...new Set([...(match.tags||[]), ...(c.tags||[])])];
    const note=(match.notes && match.notes.includes('Import data lama TEONE')) ? match.notes : ((match.notes? match.notes+'\n\n':'')+c.notes);
    const u={ id:match.id, tags, notes:note };
    if(!match.passport_no && c.passport_no){u.passport_no=c.passport_no; u.passport_number=c.passport_no;}
    if(!match.passport_expiry && exp)u.passport_expiry=exp;
    if(!match.passport_issued_date && iss)u.passport_issued_date=iss;
    if(!match.passport_issued_at && c.passport_issued_at)u.passport_issued_at=c.passport_issued_at;
    if(!match.place_of_birth && c.place_of_birth)u.place_of_birth=c.place_of_birth;
    if(!match.dob && dob){u.dob=dob; if(!match.birthday)u.birthday=dob;}
    if(!match.gender && c.gender)u.gender=c.gender;
    if(!match.first_trip_at && ft)u.first_trip_at=ft;
    if(!match.last_trip_at && lt)u.last_trip_at=lt;
    if(!match.referral_source && c.referral_source)u.referral_source=c.referral_source;
    toUpdate.push(u);
  } else {
    toInsert.push({ brand_id:BRAND, name:c.name, first_name:c.first_name, surname:c.surname,
      phone:c.phone||null, whatsapp:c.phone||null, passport_no:c.passport_no, passport_number:c.passport_no,
      passport_expiry:exp, passport_issued_date:iss, passport_issued_at:c.passport_issued_at,
      place_of_birth:c.place_of_birth, dob:dob, birthday:dob, gender:c.gender,
      tags:c.tags, notes:c.notes, total_trips:c.total_trips, first_trip_at:ft, last_trip_at:lt,
      referral_source:c.referral_source, status:'past', created_by:'import-2020-2024' });
  }
}
console.log('plan -> insert new:', toInsert.length, ' | update existing:', toUpdate.length);

// INSERT in batches
let ins=0;
for(let i=0;i<toInsert.length;i+=500){ const b=toInsert.slice(i,i+500); const {error}=await db.from('customers').insert(b); if(error){console.error('insert err',error.message);process.exit(1);} ins+=b.length; process.stdout.write(`\rinserted ${ins}/${toInsert.length}`); }
console.log('\ninsert done:', ins);
// UPDATE (merge) — one by one, but only fields present
let upd=0;
for(const u of toUpdate){ const {id,...f}=u; const {error}=await db.from('customers').update(f).eq('id',id); if(error){console.error('update err',error.message);} else upd++; if(upd%200===0)process.stdout.write(`\rupdated ${upd}/${toUpdate.length}`); }
console.log('\nupdate done:', upd);
console.log('DONE');

const $=s=>document.querySelector(s), app=$('#app');let db,page='home',current=null,ops=[],photos=[];const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const uid=()=>crypto.randomUUID();const field=(label,key,value='',type='text')=>`<label>${label}</label><input name="${key}" type="${type==='number'?'text':type}" ${type==='number'?'inputmode="decimal" autocomplete="off"':''} value="${esc(value)}">`;const textfield=(label,key,value='')=>`<label>${label}</label><textarea name="${key}">${esc(value)}</textarea>`;const choice=(label,key,value='',options=[])=>`<label>${label}</label><select name="${key}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(value)===v?'selected':''}>${esc(t)}</option>`).join('')}</select>`;
const COOL=[['','Non specificato'],['Interna','Interna'],['Esterna','Esterna'],['Interna + esterna','Interna + esterna'],['A secco','A secco']];
const LIGHTS=[['','⚪ Non valutato'],['green','🟢 Riuscita'],['yellow','🟡 Da ottimizzare'],['red','🔴 Problematica']];
const lightIcon=v=>({green:'🟢',yellow:'🟡',red:'🔴'})[v]||'⚪';
const jobLight=v=>v==='Ottimo'?'green':v==='Accettabile'?'yellow':v==='Da migliorare'?'red':'';
const TOOL_COOL=[['','Non specificato'],['Interna','Interna'],['Esterna','Esterna'],['Interna + esterna','Interna + esterna'],['Non predisposto','Non predisposto']];
const opKind=t=>/filettatura/i.test(t)?'thread':/fresatura/i.test(t)?'mill':/foratura/i.test(t)?'drill':'turn';
const extraFields=(o={})=>`<div id="opMillFields" style="display:none">${field('Numero taglienti z','teeth',o.teeth,'number')}${field('Avanzamento per dente fz (mm/dente)','fz',o.fz,'number')}${field('Avanzamento tavola Vf (mm/min)','vf',o.vf,'number')}${field('Larghezza radiale ae (mm)','ae',o.ae,'number')}</div><div id="opDrillFields" style="display:none">${field('Profondità foro (mm)','holeDepth',o.holeDepth,'number')}</div><div id="opCalc" class="card"><strong>Calcolo teorico</strong><p class="hint">n = 1000 × Vc / (π × D). Verifica i limiti della macchina.</p><div id="opCalcText" class="stat">—</div><small id="opCalcFeed"></small></div>${choice('Refrigerazione utilizzata','coolant',o.coolant,COOL)}${field('Pressione refrigerante (bar, facoltativa)','coolantPressure',o.coolantPressure,'number')}`;
function updateOpCalc(e){const f=$('#opForm');if(!f)return;const read=k=>{const v=String(f.elements[k]?.value||'').trim().replace(',','.');return v===''?NaN:Number(v)};const d=read('diameter'),vc=read('vc'),n=d>0&&vc>0?1000*vc/(Math.PI*d):NaN;const kind=opKind(f.elements.type.value);const z=read('teeth'),fz=read('fz'),feed=read('feed');const vf=kind==='mill'?n*z*fz:n*feed;const text=$('#opCalcText'),out=$('#opCalcFeed');if(text)text.textContent=Number.isFinite(n)?`${Math.round(n)} giri/min (teorici)`:'Inserisci diametro e Vc';if(out)out.textContent=Number.isFinite(vf)&&vf>0?`Avanzamento teorico: ${vf.toFixed(1)} mm/min`:'Inserisci i parametri di avanzamento';if(e?.target?.name==='rpm')f.elements.rpm.dataset.manual='yes';if(Number.isFinite(n)&&f.elements.rpm.dataset.manual!=='yes')f.elements.rpm.value=String(Math.round(n));if(kind==='mill'&&Number.isFinite(vf)&&vf>0&&f.elements.vf.dataset.manual!=='yes')f.elements.vf.value=vf.toFixed(1);if(e?.target?.name==='vf')f.elements.vf.dataset.manual='yes'}
function openDB(){return new Promise((resolve,reject)=>{let r=indexedDB.open('cnc-worklog',2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('jobs'))r.result.createObjectStore('jobs',{keyPath:'id'});if(!r.result.objectStoreNames.contains('tools'))r.result.createObjectStore('tools',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}function store(mode='readonly'){return db.transaction('jobs',mode).objectStore('jobs')}function all(){return new Promise((ok,no)=>{let r=store().getAll();r.onsuccess=()=>ok(r.result.sort((a,b)=>b.updated.localeCompare(a.updated)));r.onerror=()=>no(r.error)})}function put(v){return new Promise((ok,no)=>{let r=store('readwrite').put(v);r.onsuccess=ok;r.onerror=()=>no(r.error)})}function del(id){return new Promise((ok,no)=>{let r=store('readwrite').delete(id);r.onsuccess=ok;r.onerror=()=>no(r.error)})}function toolStore(mode='readonly'){return db.transaction('tools',mode).objectStore('tools')}function allTools(){return new Promise((ok,no)=>{let r=toolStore().getAll();r.onsuccess=()=>ok(r.result.sort((a,b)=>a.name.localeCompare(b.name)));r.onerror=()=>no(r.error)})}function putTool(t){return new Promise((ok,no)=>{let r=toolStore('readwrite').put(t);r.onsuccess=ok;r.onerror=()=>no(r.error)})}function getTool(id){return new Promise(ok=>{let r=toolStore().get(id);r.onsuccess=()=>ok(r.result)})}function deleteTool(id){return new Promise((ok,no)=>{let r=toolStore('readwrite').delete(id);r.onsuccess=ok;r.onerror=()=>no(r.error)})}function go(p){page=p;render()}function photoView(list){return `<div class="photos">${(list||[]).map(p=>`<img class="photo" src="${p}" alt="Foto lavorazione">`).join('')}</div>`}async function render(){try{if(page==='home'){let jobs=await all();app.innerHTML=`<h1>Il tuo diario CNC</h1><p>Archivia attrezzaggi, parametri e soluzioni.</p><button class="primary wide" onclick="newJob()">＋ Nuova lavorazione</button><div class="grid" style="margin-top:14px"><button onclick="go('archive')">▤<br>Archivio</button><button onclick="go('calculator')">▦<br>Calcolatore</button><button onclick="go('smartSearch')">🔎<br>Ricerca intelligente</button><button onclick="go('tools')">⚒<br>Utensili</button></div><h2>Ultime lavorazioni (${jobs.length})</h2>${jobs.slice(0,5).map(jobCard).join('')||'<div class="card muted">Nessuna lavorazione salvata. Crea la prima scheda.</div>'}`}
if(page==='smartSearch')await renderSmartSearch();
if(page==='archive'){app.innerHTML=`<h1>Archivio lavorazioni</h1><button class="wide" onclick="go('smartSearch')">🔎 Ricerca intelligente e semaforo</button><input id="search" placeholder="Cerca pezzo, materiale, macchina, utensile..." oninput="filterJobs()"><div id="results"></div><button class="primary wide" onclick="newJob()">＋ Nuova lavorazione</button>`;filterJobs()}
if(page==='tools')await renderTools();if(page==='toolEdit')renderToolEdit();if(page==='toolUsage')renderUsage();if(page==='toolArchive')renderToolArchive();if(page==='compare')await renderCompare();if(page==='edit')renderEdit();if(page==='operation')renderOp();if(page==='calculator')renderCalc();if(page==='settings')renderSettings()}catch(e){app.innerHTML=`<div class="card error">Errore: ${esc(e.message)}</div>`}}
function jobCard(j){return `<button class="card item" onclick="editJob('${j.id}')">${j.photos?.length?`<img class="thumb" src="${j.photos[0]}" alt="">`:'<div class="thumb"></div>'}<div><strong>${lightIcon(jobLight(j.result))} ${esc(j.name)}</strong><br><small>${esc(j.material||'Materiale non indicato')} · ${esc(j.machine||'Macchina non indicata')}</small><br><small>${j.ops?.length||0} operazioni</small></div><span style="margin-left:auto">›</span></button>`}async function filterJobs(){let q=$('#search')?.value.toLowerCase()||'',jobs=await all();let found=jobs.filter(j=>JSON.stringify({...j,photos:[]}).toLowerCase().includes(q));$('#results').innerHTML=found.map(jobCard).join('')||'<p>Nessun risultato.</p>'}function newJob(){current={id:uid(),name:'',material:'',machine:'',date:new Date().toISOString().slice(0,10),notes:'',result:'',photos:[],ops:[],updated:''};ops=[];photos=[];go('edit')}async function editJob(id){current=await new Promise(ok=>{let r=store().get(id);r.onsuccess=()=>ok(r.result)});if(!current)return;ops=structuredClone(current.ops||[]);photos=[...(current.photos||[])];go('edit')}
function renderEdit(){app.innerHTML=`<div class="row"><h1>Scheda pezzo</h1><button onclick="go('archive')">Chiudi</button></div><form id="jobForm" onsubmit="saveJob(event)"><div class="card"><h2>Dati generali</h2>${field('Nome o codice pezzo *','name',current.name)}${field('Materiale','material',current.material)}${field('Macchina CNC','machine',current.machine)}${field('Data','date',current.date,'date')}${textfield('Note generali','notes',current.notes)}<label>Fotografie del pezzo</label><input type="file" accept="image/*" multiple onchange="addPhotos(event,'job')">${photoView(photos)}<button type="button" onclick="photos=[];renderEdit()">Rimuovi foto pezzo</button></div><h2>Operazioni (${ops.length})</h2>${ops.map((o,i)=>`<button type="button" class="card item operation" onclick="editOp(${i})"><div><strong>${i+1}. ${esc(o.type||'Operazione')}</strong><br><small>${esc(o.tool||'Utensile non indicato')} · Vc ${esc(o.vc||'—')} m/min · f ${esc(o.feed||'—')} mm/giro</small></div><span style="margin-left:auto">›</span></button>`).join('')}<button type="button" class="wide" onclick="addOp()">＋ Aggiungi operazione</button><div class="card"><h2>Risultato finale</h2><label>Esito</label><select name="result"><option value="">Non valutato</option>${['Ottimo','Accettabile','Da migliorare'].map(x=>`<option ${current.result===x?'selected':''}>${x}</option>`).join('')}</select></div><button class="primary wide" type="submit">Salva lavorazione</button></form>${current.updated?`<button class="danger wide" style="margin-top:14px" onclick="deleteJob()">Elimina scheda</button>`:''}`}
function readJobForm(){let f=new FormData($('#jobForm'));for(let k of ['name','material','machine','date','notes','result'])current[k]=String(f.get(k)||'');current.photos=photos;current.ops=ops}async function saveJob(e){e.preventDefault();readJobForm();if(!current.name.trim())return alert('Inserisci il nome del pezzo.');current.updated=new Date().toISOString();try{await put(current);go('archive')}catch(err){alert('Salvataggio non riuscito: '+err.message)}}async function deleteJob(){if(confirm('Eliminare definitivamente questa scheda?')){await del(current.id);go('archive')}}let opIndex=-1,opPhotos=[];function addOp(){readJobForm();opIndex=-1;opPhotos=[];go('operation')}function editOp(i){readJobForm();opIndex=i;opPhotos=[...(ops[i].photos||[])];go('operation')}
async function renderOp(){let tools=await allTools();let o=opIndex<0?{}:ops[opIndex];app.innerHTML=`<h1>${opIndex<0?'Nuova':'Modifica'} operazione</h1><form id="opForm" oninput="updateOpCalc(event)" onsubmit="saveOp(event)"><div class="card"><label>Tipo di operazione</label><select name="type" onchange="updateOpFields()">${['Sgrossatura esterna','Finitura esterna','Tornitura interna','Foratura','Fresatura','Filettatura interna','Filettatura esterna','Alesatura','Altro'].map(x=>`<option ${o.type===x?'selected':''}>${x}</option>`).join('')}</select><label>Seleziona dalla libreria utensili</label><select name="toolId" onchange="selectToolForOp(this)"><option value="">— Inserimento libero —</option>${tools.map(t=>`<option data-category="${esc(t.type||'Altro')}" value="${esc(t.id)}" ${o.toolId===t.id?'selected':''}>${esc(t.name)}${t.code?' · '+esc(t.code):''}</option>`).join('')}</select>${field('Utensile / inserto','tool',o.tool)}<div id="opUsagePicker" class="card" style="display:none"><label for="opUsageSelect">📂 Recupera parametri da una lavorazione precedente</label><select id="opUsageSelect" onchange="applyOpUsage(this.value)"><option value="">— Seleziona lavorazione —</option></select><small class="hint" id="opUsageHint">I parametri recuperati restano modificabili. Le lavorazioni originali non vengono modificate.</small></div><button type="button" onclick="saveOpDraftAndOpenTools()">⚒ Apri libreria utensili</button>${field('Diametro lavorazione (mm)','diameter',o.diameter,'number')}${field('Velocità di taglio Vc (m/min)','vc',o.vc,'number')}${field('Giri mandrino (rpm)','rpm',o.rpm,'number')}${field('Avanzamento f (mm/giro)','feed',o.feed,'number')}${field('Profondità di passata ap (mm)','ap',o.ap,'number')}<div id="opPitchWrap">${field('Passo filettatura (mm)','pitch',o.pitch,'number')}${field('Angolo sottoplacchetta utilizzato (°)','shimAngle',o.shimAngle,'number')}</div>${extraFields(o)}${textfield('Problemi riscontrati','problem',o.problem)}${textfield('Soluzioni adottate','solution',o.solution)}${textfield('Note tecniche','notes',o.notes)}<label>Fotografie operazione</label><input type="file" accept="image/*" multiple onchange="addPhotos(event,'op')">${photoView(opPhotos)}<button type="button" onclick="opPhotos=[];renderOp()">Rimuovi foto operazione</button></div><button class="primary wide">Conferma operazione</button></form><div class="section-actions"><button onclick="go('edit')">Annulla</button>${opIndex>=0?'<button class="danger" onclick="removeOp()">Elimina operazione</button>':''}</div>`;updateOpFields();updateOpCalc();if(o.toolId)loadOpUsageChoices(o.toolId,false)}function updateOpFields(){
 const f=document.getElementById('opForm');if(!f)return;
 const type=f.elements.type.value;
 const threading=/Filettatura/i.test(type);const kind=opKind(type);const mill=$('#opMillFields'),drill=$('#opDrillFields');if(mill)mill.style.display=kind==='mill'?'':'none';if(drill)drill.style.display=kind==='drill'?'':'none';const lab=f.querySelector('[name=feed]')?.previousElementSibling;if(lab)lab.textContent=kind==='mill'?'Avanzamento f (mm/giro, non usato nel calcolo fresatura)':'Avanzamento f (mm/giro)';const apLab=f.querySelector('[name=ap]')?.previousElementSibling;if(apLab)apLab.textContent=kind==='mill'?'Profondità assiale ap (mm)':'Profondità di passata ap (mm)';updateOpCalc();
 const pitch=document.getElementById('opPitchWrap');if(pitch){pitch.hidden=!threading;pitch.style.display=threading?'':'none';}
 const select=f.elements.toolId;
 const old=select.value;
 const allowed=(category)=>{
  category=String(category||'Altro').toLowerCase();
  if(type==='Fresatura')return ['fresa','inserto fresatura','portafresa','altro'].includes(category);
  if(type==='Foratura')return ['punta','maschio','altro'].includes(category);
  if(threading){
   if(category.includes('filettatura interna'))return type==='Filettatura interna';
   if(category.includes('filettatura esterna'))return type==='Filettatura esterna';
   return ['inserto','bareno','portautensile','maschio','altro'].includes(category);
  }
  if(category.includes('filettatura'))return false;
  return ['inserto','bareno','portautensile','altro'].includes(category);
 };
 let stillValid=false;
 for(const option of select.options){if(!option.value)continue;const ok=allowed(option.dataset.category);option.hidden=!ok;option.disabled=!ok;if(option.value===old&&ok)stillValid=true;}
 if(old&&!stillValid){select.value='';f.elements.tool.value='';}
}
function saveOp(e){e.preventDefault();let f=new FormData($('#opForm')),o={};for(let k of ['type','toolId','tool','diameter','vc','rpm','feed','ap','pitch','shimAngle','problem','solution','notes','teeth','fz','vf','ae','holeDepth','coolant','coolantPressure'])o[k]=String(f.get(k)||'');if(!/Filettatura/i.test(o.type)){o.pitch='';o.shimAngle='';}if(opKind(o.type)!=='mill')for(const k of ['teeth','fz','vf','ae'])o[k]='';if(opKind(o.type)!=='drill')o.holeDepth='';o.photos=opPhotos;if(opIndex<0)ops.push(o);else ops[opIndex]=o;go('edit')}let opUsageRecords=[];
async function loadOpUsageChoices(toolId,autoSingle=false){
 const picker=$('#opUsagePicker'),select=$('#opUsageSelect'),hint=$('#opUsageHint');
 if(!picker||!select)return;
 const t=toolId?await getTool(toolId):null;
 if($('#opForm')?.elements.toolId.value!==toolId)return;
 opUsageRecords=(t?.usages||[]).filter(u=>u&&Object.keys(u).some(k=>['vc','rpm','diameter','feed','ap','pitch','shimAngle','fz','vf','teeth','ae'].includes(k)&&String(u[k]??'').trim()));
 picker.style.display=opUsageRecords.length?'':'none';
 select.innerHTML='<option value="">— Seleziona lavorazione —</option>'+opUsageRecords.map((u,i)=>`<option value="${i}">${esc(u.title||'Lavorazione '+(i+1))} · ${esc(u.material||'Materiale non indicato')} ${lightIcon(u.outcome)}</option>`).join('');
 if(hint)hint.textContent=opUsageRecords.length===1?'Un precedente disponibile: i parametri possono essere modificati.':'Scegli la lavorazione di riferimento. I dati originali non vengono modificati.';
 if(autoSingle&&opUsageRecords.length===1){select.value='0';applyOpUsage('0');}
}
function applyOpUsage(value){
 const f=$('#opForm');if(!f||value==='')return;
 const u=opUsageRecords[Number(value)];if(!u)return;
 const fields=['diameter','vc','rpm','feed','ap','teeth','fz','vf','ae','coolant','coolantPressure'];
 for(const key of fields){if(f.elements[key]&&u[key]!==undefined&&u[key]!==null&&String(u[key]).trim()!=='')f.elements[key].value=String(u[key]);}
 // Il passo non coincide con l'avanzamento: copiarlo soltanto se esplicitamente salvato.
 if(/Filettatura/i.test(f.elements.type.value)&&f.elements.pitch&&u.pitch!==undefined&&String(u.pitch).trim())f.elements.pitch.value=String(u.pitch);
 if(/Filettatura/i.test(f.elements.type.value)&&f.elements.shimAngle&&u.shimAngle!==undefined&&String(u.shimAngle).trim())f.elements.shimAngle.value=String(u.shimAngle);
 // Se il precedente non ha passo, non dedurlo automaticamente da f.
 if(f.elements.rpm)f.elements.rpm.dataset.manual=f.elements.rpm.value?'yes':'no';
 if(f.elements.vf)f.elements.vf.dataset.manual=f.elements.vf.value?'yes':'no';
 updateOpCalc();
}
async function selectToolForOp(sel){
 const t=sel.value?await getTool(sel.value):null;
 const f=$('#opForm');if(!f)return;
 f.elements.tool.value=t?t.name+(t.code?' · '+t.code:''):'';
 await loadOpUsageChoices(sel.value,opIndex<0);
}
function saveOpDraftAndOpenTools(){alert('Prima conferma questa operazione, poi apri Utensili dalla barra inferiore.')}function removeOp(){if(confirm('Eliminare questa operazione?')){ops.splice(opIndex,1);go('edit')}}async function addPhotos(e,where){if(where==='job')readJobForm();else{let f=new FormData($('#opForm'));let o={};for(let k of ['type','toolId','tool','diameter','vc','rpm','feed','ap','pitch','shimAngle','problem','solution','notes','teeth','fz','vf','ae','holeDepth','coolant','coolantPressure'])o[k]=String(f.get(k)||'');o.photos=opPhotos;if(opIndex<0){ops.push(o);opIndex=ops.length-1}else ops[opIndex]=o}let files=[...e.target.files];for(let f of files){if(!f.type.startsWith('image/'))continue;let data=await compress(f);if(where==='job')photos.push(data);else opPhotos.push(data)}if(where==='job')renderEdit();else renderOp()}function compress(file){return new Promise((ok,no)=>{let img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{let scale=Math.min(1,1400/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);ok(c.toDataURL('image/jpeg',.75))};img.onerror=no;img.src=url})}

let activeTool=null,toolPhotos=[],usageIndex=-1,usagePhotos=[];
// Gruppi di lavorazione per la libreria. Un utensile può apparire in più gruppi.
const LIBRARY_GROUPS=['Sgrossatura esterna','Sgrossatura interna','Finitura esterna','Finitura interna','Fresatura','Foratura','Filettatura esterna','Filettatura interna','Alesatura interna','Altre lavorazioni'];
const LIBRARY_SIDES=[['','— Non specificata —'],['esterna','Esterna'],['interna','Interna']];
function libraryGroupsForTool(t){
 const groups=new Set();
 const toolCategory=String(t.type||'').toLocaleLowerCase('it');
 if(toolCategory.includes('filettatura interna'))groups.add('Filettatura interna');
 if(toolCategory.includes('filettatura esterna'))groups.add('Filettatura esterna');
 const detect=(value,sideValue)=>{
  const x=String(value||'').toLocaleLowerCase('it');
  const side=String(sideValue||'').toLocaleLowerCase('it');
  const inferred=/\bintern[ao]\b/.test(x)?'interna':/\bestern[ao]\b/.test(x)?'esterna':'';
  const position=(side==='interna'||side==='esterna')?side:inferred;
  const addSide=(prefix)=>{if(position)groups.add(prefix+' '+position);else groups.add('Altre lavorazioni')};
  if(/sgross/.test(x))addSide('Sgrossatura');
  if(/finit/.test(x))addSide('Finitura');
  if(/fres|cav[ae]|chiavett|spianat|contorn|scanalat|linguett/.test(x))groups.add('Fresatura');
  if(/forat|punta|foro/.test(x))groups.add('Foratura');
  if(/filett|maschi|trapez/.test(x))addSide('Filettatura');
  if(/alesat/.test(x))groups.add('Alesatura interna');
 };
 for(const u of t.usages||[])detect([u.usageCategory,u.title].join(' '),u.workSide||t.workSide);
 if(!groups.size||groups.size===1&&groups.has('Altre lavorazioni')){
  const type=String(t.type||'').toLowerCase();
  const side=t.workSide||'';
  if(type.includes('filettatura interna'))groups.add('Filettatura interna');
  else if(type.includes('filettatura esterna'))groups.add('Filettatura esterna');
  else if(type==='fresa')groups.add('Fresatura');
  else if(type==='punta')groups.add('Foratura');
  else if(type==='maschio')groups.add(side==='interna'?'Filettatura interna':side==='esterna'?'Filettatura esterna':'Altre lavorazioni');
  else if(type==='bareno')groups.add('Alesatura interna');
  else if(side==='interna'||side==='esterna'){
   const x=[t.name,t.notes].join(' ').toLowerCase();
   if(/sgross/.test(x))groups.add('Sgrossatura '+side);
   if(/finit/.test(x))groups.add('Finitura '+side);
   if(/filett/.test(x))groups.add('Filettatura '+side);
  }
 }
 if(groups.size>1)groups.delete('Altre lavorazioni');
 if(!groups.size)groups.add('Altre lavorazioni');
 return [...groups];
}
let libraryGroupFilter='';
async function renderTools(){
 const ts=await allTools();
 app.innerHTML=`<div class="row"><h1>Libreria utensili (${ts.length})</h1><button class="primary" onclick="newTool()">＋ Nuovo</button></div><p>Utensili suddivisi per tipo di lavorazione e, per tornitura e filettatura, per interna o esterna. Un utensile può comparire in più sezioni.</p><input id="toolSearch" placeholder="Cerca nome, codice, marca, tipo..." oninput="filterTools()"><label for="libraryGroup">Visualizza lavorazione</label><select id="libraryGroup" onchange="libraryGroupFilter=this.value;filterTools()"><option value="">Tutte le lavorazioni</option>${LIBRARY_GROUPS.map(g=>`<option value="${esc(g)}" ${libraryGroupFilter===g?'selected':''}>${esc(g)}</option>`).join('')}</select><div id="toolResults"></div>`;
 filterTools();
}
async function filterTools(){
 const q=($('#toolSearch')?.value||'').toLocaleLowerCase('it').trim(),ts=await allTools(),target=$('#toolResults');
 if(!target)return;
 const matched=ts.filter(t=>[t.name,t.brand,t.code,t.type,t.grade,t.notes,...(t.isoGroups||[]).map(g=>'ISO '+g),...(t.usages||[]).flatMap(u=>[u.title,u.usageCategory,u.material])].join(' ').toLocaleLowerCase('it').includes(q));
 const card=t=>`<button class="card item" onclick="editTool('${esc(t.id)}')">${t.photos?.[0]?`<img class="thumb" src="${t.photos[0]}" alt="Foto utensile">`:'<div class="thumb">⚒</div>'}<div><strong>${esc(t.name)}</strong><br><small>${esc(t.brand||'Marca non indicata')} · ${esc(t.code||'Codice non indicato')}</small><br><small>${esc(t.type||'')} · ${(t.isoGroups||[]).map(g=>'ISO '+g).join(' · ')} · ${(t.usages||[]).length} lavorazioni</small></div><span style="margin-left:auto">›</span></button>`;
 const groups=libraryGroupFilter?[libraryGroupFilter]:LIBRARY_GROUPS;
 target.innerHTML=groups.map(g=>{
  const items=matched.filter(t=>libraryGroupsForTool(t).includes(g));
  if(!items.length)return '';
  return `<section class="tool-group"><h2>${esc(g)} <small>(${items.length})</small></h2>${items.map(card).join('')}</section>`;
 }).join('')||'<div class="card muted">Nessun utensile trovato per questa lavorazione.</div>';
}
const ISO_GROUPS=[['P','🔵','Acciai'],['M','🟡','Acciai inossidabili'],['K','🔴','Ghise'],['N','🟢','Materiali non ferrosi'],['S','🟠','Superleghe e titanio'],['H','⚪','Materiali temprati']];
function isoGroupSelector(tool){const selected=Array.isArray(tool.isoGroups)?tool.isoGroups:[];return `<fieldset class="iso-materials"><legend>Materiali lavorabili — ISO 513</legend><p class="hint">Seleziona tutti i gruppi compatibili con questo utensile, secondo le indicazioni del produttore. La selezione non sostituisce la verifica di qualità e geometria.</p>${ISO_GROUPS.map(([code,icon,label])=>`<label class="iso-choice"><input type="checkbox" name="isoGroups" value="${code}" ${selected.includes(code)?'checked':''}><span>${icon} <strong>ISO ${code}</strong> — ${label}</span></label>`).join('')}<p class="hint">Il materiale specifico (es. C45 o AISI 316) si registra nelle singole lavorazioni.</p></fieldset>`}
function newTool(){toolDetailsEditing=true;inlineUsageEditorOpen=false;inlineUsageIndex=-1;activeTool={id:uid(),name:'',type:'Inserto',brand:'',code:'',grade:'',holder:'',coolantCapability:'',workSide:'',notes:'',photos:[],usages:[]};toolPhotos=[];go('toolEdit')}
async function editTool(id){toolDetailsEditing=false;inlineUsageEditorOpen=false;inlineUsageIndex=-1;activeTool=await getTool(id);if(!activeTool)return;toolPhotos=[...(activeTool.photos||[])];go('toolEdit')}
function preserveToolForm(){let f=$('#toolForm');if(!f)return;let d=new FormData(f);for(let k of ['name','type','brand','code','grade','holder','coolantCapability','workSide','threadFamily','pitch','notes'])activeTool[k]=String(d.get(k)||'');activeTool.isoGroups=d.getAll('isoGroups').map(String)}
let toolDetailsEditing=false;
function toolDetailsSummary(){
 const t=activeTool;
 const row=(label,value)=>value?`<div class="tool-detail-row"><span>${label}</span><strong>${esc(value)}</strong></div>`:'';
 const iso=(t.isoGroups||[]).map(code=>{const g=ISO_GROUPS.find(x=>x[0]===code);return `<span class="iso-pill">${g?g[1]:''} ISO ${esc(code)}</span>`}).join('');
 return `<div class="card tool-overview"><h2>🔧 ${esc(t.name||'Nuovo utensile')}</h2>${row('Categoria',t.type)}${row('Produttore',t.brand)}${row('Codice',t.code)}${row('Qualità / grado',t.grade)}${row('Portautensile',t.holder)}${row('Refrigerazione',t.coolantCapability)}${row('Impiego',t.workSide)}${row('Tipo filetto',t.threadFamily)}${row('Passo (mm)',t.pitch)}<div class="tool-detail-row"><span>Materiali ISO 513</span><div class="iso-pills">${iso||'<span class="muted">Non specificati</span>'}</div></div>${t.notes?`<p class="tool-summary-notes">${esc(t.notes)}</p>`:''}${photoView(toolPhotos)}<button type="button" class="primary wide" onclick="startToolDetailsEdit()">✏️ Modifica dati utensile</button></div>`;
}
function startToolDetailsEdit(){toolDetailsEditing=true;renderToolEdit();}
async function cancelToolDetailsEdit(){
 if(!activeTool.saved){toolDetailsEditing=true;renderToolEdit();return;}
 const original=await getTool(activeTool.id);
 if(!original){alert('Impossibile recuperare i dati salvati.');return;}
 activeTool={...original};toolPhotos=[...(original.photos||[])];toolDetailsEditing=false;renderToolEdit();
}
function renderToolEdit(){manufacturerEditorOpen=false;activeTool.usages ||= [];app.innerHTML=`<div class="row"><h1>Scheda utensile</h1><button onclick="go('tools')">Chiudi</button></div><form id="toolForm" onsubmit="saveTool(event)">${toolDetailsEditing?'':toolDetailsSummary()}<div class="card" id="toolDetailsFields" style="display:${toolDetailsEditing?'':'none'}">${field('Nome utensile *','name',activeTool.name)}<label>Categoria</label><select name="type" onchange="onToolCategoryChange()">${['Inserto','Alesatore','Filettatura interna','Filettatura esterna','Punta','Fresa','Maschio','Altro'].map(x=>`<option ${(activeTool.type===x || (x==='Filettatura interna' && ['Inserto per filettatura interna','Bareno per filettatura interna'].includes(activeTool.type)) || (x==='Filettatura esterna' && ['Inserto per filettatura esterna','Portautensile per filettatura esterna'].includes(activeTool.type)))?'selected':''}>${x}</option>`).join('')}</select><div id="toolThreadFields" style="display:${/filettatura/i.test(activeTool.type)?'':'none'}"><label>Tipo di filetto</label><select name="threadFamily"><option value="">— Seleziona tipo —</option>${[['metric','Metrica ISO (M)'],['tr','Trapezoidale ISO (Tr)'],['rd','Tonda (Rd)'],['bspp','Gas cilindrica (G/BSPP)'],['bspt','Gas conica (R/BSPT)'],['un','UN (UNC/UNF)'],['acme','ACME'],['other','Altro']].map(([v,l])=>`<option value="${v}" ${activeTool.threadFamily===v?'selected':''}>${l}</option>`).join('')}</select>${field('Passo filettatura (mm)','pitch',activeTool.pitch,'number')}<p class="hint">Questi dati identificano l'utensile e permettono di trovarlo nella ricerca per passo, anche senza lavorazioni registrate.</p></div>${field('Marca / produttore','brand',activeTool.brand)}${field('Codice sulla scatola','code',activeTool.code)}${field('Qualità / grado / rivestimento','grade',activeTool.grade)}${field('Portautensile associato','holder',activeTool.holder)}${choice('Adduzione refrigerante disponibile sull’utensile','coolantCapability',activeTool.coolantCapability,TOOL_COOL)}<label>Impiego utensile (classificazione predefinita)</label><select name="workSide">${LIBRARY_SIDES.map(([v,label])=>`<option value="${v}" ${activeTool.workSide===v?'selected':''}>${label}</option>`).join('')}</select><p class="hint">Le singole lavorazioni possono specificare interna o esterna. Gli utensili senza dati sufficienti restano in «Altre lavorazioni».</p>${isoGroupSelector(activeTool)}${textfield('Note e applicazioni','notes',activeTool.notes)}<label>Foto della scatola, etichetta e utensile</label><input type="file" accept="image/*" multiple onchange="addToolPhotos(event)">${photoView(toolPhotos)}<button type="button" onclick="preserveToolForm();toolPhotos=[];renderToolEdit()">Rimuovi tutte le foto</button>${toolDetailsEditing?`<div class="section-actions"><button class="primary" type="submit">💾 Salva modifiche utensile</button>${activeTool.saved?'<button type="button" onclick="cancelToolDetailsEdit()">Annulla</button>':''}</div>`:''}</div>${toolDetailsEditing?'':`<div class="card"><h2>🔵 Parametri del produttore</h2><p class="hint">Sezione indipendente: registra i valori indicati dal produttore per ciascun materiale, anche senza creare una lavorazione. I dati sono separati dalle prove eseguite in officina.</p><div id="manufacturerEditor"></div></div><div class="card"><h2>🟢 Lavorazioni collaudate</h2><p class="hint">Consulta subito le lavorazioni salvate oppure apri il modulo per registrarne una nuova. Ogni lavorazione conserva parametri e fotografie.</p><div id="inlineUsageEditor"></div></div><div class="card"><h2>📋 Lavorazioni salvate (${activeTool.usages.length})</h2><button type="button" class="primary wide" onclick="openToolArchive()">📂 Apri archivio per categorie e ricerca</button><p class="hint">Registra come hai utilizzato questo utensile, i parametri effettivi e una foto del risultato.</p>${activeTool.usages.map((u,i)=>`<button type="button" class="card item operation" onclick="editUsageInline(${i})">${u.photos?.[0]?`<img class="thumb" src="${u.photos[0]}" alt="Lavorazione riuscita">`:''}<div><strong>${lightIcon(u.outcome)} ${esc(u.title||'Lavorazione')}</strong><br><small>${esc(u.material||'')} · Vc ${esc(u.vc||'—')} m/min · ${activeTool.type==='Fresa'?'fz '+esc(u.fz||'—')+' mm/dente'+(u.sizeDeviation!==undefined&&u.sizeDeviation!==''?' · Δ '+esc(u.sizeDeviation)+' mm':''):'f '+esc(u.feed||'—')+' mm/giro'}</small></div><span style="margin-left:auto">›</span></button>`).join('')||'<p class="muted">Nessuna lavorazione registrata.</p>'}<button type="button" class="wide" onclick="openInlineUsageEditor()">＋ Aggiungi lavorazione riuscita</button><button type="button" class="wide" onclick="openCompare(activeTool.id)">📊 Confronta parametri (anche altri utensili)</button></div>`}</form>${toolDetailsEditing?'':`<button class="wide" onclick="go('tools')">Torna alla libreria</button>${activeTool.saved?'<button class="danger wide" onclick="removeTool()">Elimina utensile</button>':''}`}`;if(!toolDetailsEditing){renderManufacturerEditor();renderInlineUsageEditor()}}

let inlineUsageIndex=-1;
let inlineUsageEditorOpen=false;
function openInlineUsageEditor(index=-1){
 preserveToolForm();inlineUsageIndex=index;inlineUsageDraft=null;inlineUsageEditorOpen=true;
 renderInlineUsageEditor();
 document.getElementById('inlineUsageEditor')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function closeInlineUsageEditor(){inlineUsageEditorOpen=false;inlineUsageIndex=-1;inlineUsageDraft=null;renderInlineUsageEditor();}

function onToolCategoryChange(){
 // La categoria selezionata nel modulo deve guidare subito il filtro e i campi,
 // anche prima di premere «Salva utensile».
 const box=$('#inlineUsageEditor');
 const draft={};
 if(box)box.querySelectorAll('[name^="iu_"]').forEach(el=>{draft[el.name.slice(3)]=el.value});
 preserveToolForm();
 inlineUsageDraft=inlineUsageEditorOpen&&Object.keys(draft).length?draft:null;
 toggleToolThreadFields();
 renderInlineUsageEditor();
}
let inlineUsageDraft=null;
function renderInlineUsageEditor(){
 // Evita di utilizzare la vecchia categoria in memoria.
 const category=$('#toolForm [name=type]')?.value;
 if(category)activeTool.type=category;
 const el=$('#inlineUsageEditor');if(!el)return;
 if(!inlineUsageEditorOpen){el.innerHTML=`<button type="button" class="primary wide" onclick="openInlineUsageEditor()">＋ Aggiungi nuova lavorazione</button>`;return;}
 const u={...(inlineUsageIndex>=0?(activeTool.usages||[])[inlineUsageIndex]||{}:{}),...(inlineUsageDraft||{})};
 inlineUsageDraft=null;
 const isMill=usageKind()==='mill';const isDrill=usageKind()==='drill';const isThread=usageKind()==='thread';
 el.innerHTML=`<div class="card" oninput="updateInlineUsageCalc(event);if(event.target.name==='iu_material')updateSmartToolHints()"><h3>${inlineUsageIndex>=0?'Modifica lavorazione':'Nuova lavorazione'}</h3>
 ${field('Nome lavorazione *','iu_title',u.title||'')}
 <label>Categoria lavorazione</label><select name="iu_usageCategory">${compatibleCategoryOptions(u.usageCategory)}</select>
 <label>Posizione lavorazione</label><select name="iu_workSide">${LIBRARY_SIDES.map(([v,l])=>`<option value="${v}" ${(u.workSide||activeTool.workSide)===v?'selected':''}>${l}</option>`).join('')}</select>
 ${isThread?`<label>Tipo di filetto</label><select name="iu_threadFamily"><option value="">Come utensile</option>${[['metric','Metrica ISO'],['tr','Trapezoidale ISO'],['rd','Tonda'],['bspp','GAS cilindrica'],['bspt','GAS conica'],['un','UN'],['acme','ACME'],['other','Altro']].map(([v,l])=>`<option value="${v}" ${u.threadFamily===v?'selected':''}>${l}</option>`).join('')}</select>${field('Passo filettatura (mm)','iu_pitch',u.pitch||activeTool.pitch,'number')}`:''}
 ${field('Materiale','iu_material',u.material)}<div id="smartToolHints" class="card"></div>${field('Macchina CNC','iu_machine',u.machine)}
 ${field(usageDiameterLabel(),'iu_diameter',u.diameter,'number')}
 ${field('Velocità di taglio Vc (m/min)','iu_vc',u.vc,'number')}${field('Giri mandrino (rpm)','iu_rpm',u.rpm,'number')}
 ${isMill?`${field('Numero taglienti z','iu_teeth',u.teeth,'number')}${field('Avanzamento per dente fz (mm/dente)','iu_fz',u.fz,'number')}${field('Avanzamento Vf (mm/min)','iu_vf',u.vf,'number')}${field('Larghezza radiale ae (mm)','iu_ae',u.ae,'number')}`:field('Avanzamento f (mm/giro)','iu_feed',u.feed,'number')}
 ${field(usageApLabel(),'iu_ap',u.ap,'number')}${isDrill?'':field('Lunghezza lavorata (mm)','iu_length',u.length,'number')}
 ${isThread?field('Angolo sottoplacchetta (°)','iu_shimAngle',u.shimAngle,'number'):''}
 ${choice('Refrigerazione utilizzata','iu_coolant',u.coolant,COOL)}${field('Pressione refrigerante (bar)','iu_coolantPressure',u.coolantPressure,'number')}
 ${choice('Esito (semaforo)','iu_outcome',u.outcome,LIGHTS)}
 ${field('Quota nominale (mm)','iu_nominalSize',u.nominalSize,'number')}${field('Quota misurata (mm)','iu_measuredSize',u.measuredSize,'number')}${field('Scostamento dimensionale (mm)','iu_sizeDeviation',u.sizeDeviation,'number')}<small id="inlineDeviationHint" class="hint">Scostamento = quota misurata − quota nominale</small>${textfield('Note sulla misura','iu_sizeNotes',u.sizeNotes)}
 ${textfield('Descrizione e risultato ottenuto','iu_description',u.description)}${textfield('Accorgimenti e parametri riusciti','iu_tips',u.tips)}
 <label>Foto lavorazione</label><input type="file" accept="image/*" multiple onchange="inlineUsagePhotos(event)">${photoView(u.photos||[])}
 <button type="button" class="primary wide" onclick="saveInlineUsage()">✓ Memorizza lavorazione nella scheda</button>
 <button type="button" class="wide" onclick="closeInlineUsageEditor()">Annulla / Chiudi</button>
 </div>`;
 updateInlineUsageCalc();
 updateSmartToolHints();
}
// v0.8.6: riferimenti del produttore separati dalle prove reali, per utensile e materiale.
function materialKey(value){return String(value||'').trim().toLocaleLowerCase('it').replace(/\s+/g,' ')}
function currentMaterial(){return inlineValue('material').trim()}
function referenceForMaterial(){const k=materialKey(currentMaterial());return (activeTool.manufacturerRefs||[]).find(r=>materialKey(r.material)===k)}
let manufacturerEditorOpen=false;
function openManufacturerEditor(material=''){
 manufacturerEditorOpen=true;
 renderManufacturerEditor(material);
 document.getElementById('manufacturerFormPanel')?.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function closeManufacturerEditor(){manufacturerEditorOpen=false;renderManufacturerEditor();}
function renderManufacturerEditor(selectedMaterial){
 const box=$('#manufacturerEditor');if(!box)return;
 const refs=activeTool.manufacturerRefs||[];
 const material=selectedMaterial===undefined?(box.querySelector('[name="manufacturer_material"]')?.value||''):selectedMaterial;
 const ref=refs.find(r=>materialKey(r.material)===materialKey(material));
 const isMill=activeTool.type==='Fresa';
 box.innerHTML=`<button type="button" class="primary wide" onclick="openManufacturerEditor()" ${manufacturerEditorOpen?'style="display:none"':''}>＋ Aggiungi nuovi parametri del produttore</button>
 <div id="manufacturerFormPanel" ${manufacturerEditorOpen?'':'hidden'}>
 <label>Materiale di riferimento (es. C45, AISI 316)</label><input name="manufacturer_material" value="${esc(material)}" placeholder="Inserisci il materiale" oninput="manufacturerMaterialChanged()">
 <div id="manufacturerFields">
 ${field('Vc produttore (m/min)','manufacturer_vc',ref?.vc||'','number')}
 ${field(isMill?'fz produttore (mm/dente)':'f produttore (mm/giro)','manufacturer_feed',isMill?ref?.fz||'':ref?.feed||'','number')}
 ${field('ap produttore (mm)','manufacturer_ap',ref?.ap||'','number')}
 ${isMill?field('ae produttore (mm)','manufacturer_ae',ref?.ae||'','number'):''}
 ${field('Fonte / catalogo produttore','manufacturer_source',ref?.source||'')}
 <button type="button" class="primary wide" onclick="saveManufacturerReference()">💾 Salva parametri produttore</button>
 <button type="button" class="wide" onclick="closeManufacturerEditor()">Annulla / Chiudi</button>
 </div></div>
 <h3>Riferimenti salvati (${refs.length})</h3>
 ${refs.map((r,i)=>`<div class="card"><strong>${esc(r.material)}</strong><br><small>Vc ${esc(r.vc||'—')} · ${isMill?'fz '+esc(r.fz||'—'):'f '+esc(r.feed||'—')} · ap ${esc(r.ap||'—')}${isMill?' · ae '+esc(r.ae||'—'):''}</small><br><small>Fonte: ${esc(r.source||'non indicata')}</small><br><button type="button" onclick="openManufacturerEditor(activeTool.manufacturerRefs[${i}].material)">Modifica</button> <button type="button" onclick="deleteManufacturerReference(${i})">Elimina</button></div>`).join('')||'<p class="hint">Nessun riferimento registrato.</p>'}`;
}
function manufacturerMaterialChanged(){
 const box=$('#manufacturerEditor');const material=box?.querySelector('[name="manufacturer_material"]')?.value||'';
 const ref=(activeTool.manufacturerRefs||[]).find(r=>materialKey(r.material)===materialKey(material));
 const value=(key,v)=>{const e=box.querySelector('[name="manufacturer_'+key+'"]');if(e)e.value=v||''};
 value('vc',ref?.vc);value('feed',activeTool.type==='Fresa'?ref?.fz:ref?.feed);value('ap',ref?.ap);value('ae',ref?.ae);value('source',ref?.source);
}
function updateSmartToolHints(){
 const target=$('#smartToolHints');if(!target)return;
 const material=currentMaterial(),key=materialKey(material);
 if(!key){target.innerHTML='<strong>🟢 Lavorazioni collaudate</strong><p class="hint">Inserisci il materiale per cercare prove riuscite. I parametri del produttore si registrano nella sezione dedicata, più in alto.</p>';return}
 const ref=referenceForMaterial();
 const success=(activeTool.usages||[]).map((u,i)=>({u,i})).filter(({u,i})=>materialKey(u.material)===key&&u.outcome==='green'&&i!==inlineUsageIndex).reverse();
 const isMill=activeTool.type==='Fresa';
 const params=v=>['Vc '+(v.vc||'—')+' m/min',isMill?'fz '+(v.fz||'—')+' mm/dente':'f '+(v.feed||'—')+' mm/giro','ap '+(v.ap||'—')+' mm',isMill?'ae '+(v.ae||'—')+' mm':''].filter(Boolean).join(' · ');
 target.innerHTML=`<strong>📚 Parametri per ${esc(material)}</strong><p class="hint">I riferimenti del produttore sono separati dalle prove reali.</p>
 ${ref?`<div class="card"><strong>🔵 Produttore</strong><p>${esc(params(ref))}</p><small>Fonte: ${esc(ref.source||'non indicata')}</small><br><button type="button" onclick="applySmartParams('manufacturer')">Usa valori produttore</button></div>`:''}
 <div class="card"><strong>🟢 Lavorazioni collaudate (${success.length})</strong>${success.slice(0,5).map(({u,i})=>`<p><strong>${esc(u.title||'Lavorazione')}</strong><br><small>${esc(params(u))}</small><br><button type="button" onclick="applySmartParams('usage',${i})">Usa questi parametri</button></p>`).join('')||'<p class="hint">Nessuna prova con esito verde per questo utensile e materiale.</p>'}</div>`;
}
async function saveManufacturerReference(){
 const box=$('#manufacturerEditor');const material=box?.querySelector('[name="manufacturer_material"]')?.value.trim()||'';
 if(!material)return alert('Inserisci il materiale di riferimento.');
 const val=k=>box.querySelector('[name="manufacturer_'+k+'"]')?.value.trim()||'';
 const source=val('source');if(!source)return alert('Indica la fonte del produttore.');
 const data={material,vc:val('vc'),feed:activeTool.type==='Fresa'?'':val('feed'),fz:activeTool.type==='Fresa'?val('feed'):'',ap:val('ap'),ae:val('ae'),source};
 if(!data.vc&&!data.feed&&!data.fz&&!data.ap&&!data.ae)return alert('Inserisci almeno un parametro.');
 preserveToolForm();activeTool.manufacturerRefs||=[];
 activeTool.manufacturerRefs=activeTool.manufacturerRefs.filter(r=>materialKey(r.material)!==materialKey(material));activeTool.manufacturerRefs.push(data);
 try{await putTool({...activeTool,photos:toolPhotos,saved:true});activeTool.saved=true;manufacturerEditorOpen=false;renderManufacturerEditor();updateSmartToolHints();alert('Parametri del produttore salvati.')}catch(e){alert('Salvataggio non riuscito: '+e.message)}
}
async function deleteManufacturerReference(i){
 if(!confirm('Eliminare questo riferimento del produttore?'))return;
 preserveToolForm();activeTool.manufacturerRefs.splice(i,1);
 try{await putTool({...activeTool,photos:toolPhotos,saved:true});manufacturerEditorOpen=false;renderManufacturerEditor();updateSmartToolHints()}catch(e){alert('Eliminazione non riuscita: '+e.message)}
}
function applySmartParams(kind,index){
 const data=kind==='manufacturer'?referenceForMaterial():activeTool.usages?.[index];if(!data)return;
 if(!confirm('Copiare i parametri selezionati nella lavorazione corrente? I dati già inseriti nei campi corrispondenti saranno sostituiti.'))return;
 const keys=['vc','feed','fz','ap','ae'];for(const k of keys){const el=$('#inlineUsageEditor [name="iu_'+k+'"]');if(el&&data[k]!==undefined&&data[k]!==null&&data[k]!=='')el.value=data[k]}
 const rpm=$('#inlineUsageEditor [name="iu_rpm"]'),vf=$('#inlineUsageEditor [name="iu_vf"]');if(rpm){rpm.value='';rpm.dataset.manual='no'}if(vf){vf.value='';vf.dataset.manual='no'}
 updateInlineUsageCalc();
}
function updateInlineUsageCalc(e){
 const box=$('#inlineUsageEditor');if(!box)return;
 const input=k=>box.querySelector('[name="iu_'+k+'"]');
 const num=k=>{const v=(input(k)?.value||'').trim().replace(',','.').replace('−','-');return v===''?NaN:Number(v)};
 const d=num('diameter'),vc=num('vc'),n=d>0&&vc>0?1000*vc/(Math.PI*d):NaN;
 const rpm=input('rpm'),vf=input('vf'),dev=input('sizeDeviation');
 const changed=e?.target?.name||'';
 if(changed==='iu_rpm'&&rpm)rpm.dataset.manual=rpm.value.trim()?'yes':'no';
 if(changed==='iu_vf'&&vf)vf.dataset.manual=vf.value.trim()?'yes':'no';
 if(changed==='iu_sizeDeviation'&&dev)dev.dataset.manual=dev.value.trim()?'yes':'no';
 if(rpm&&Number.isFinite(n)&&rpm.dataset.manual!=='yes'&&(changed!=='init'||!rpm.value.trim()))rpm.value=String(Math.round(n));
 const z=num('teeth'),fz=num('fz');const calculatedVf=Number.isFinite(n)&&z>0&&fz>0?n*z*fz:NaN;
 if(vf&&Number.isFinite(calculatedVf)&&vf.dataset.manual!=='yes'&&(changed!=='init'||!vf.value.trim()))vf.value=calculatedVf.toFixed(1);
 const a=num('nominalSize'),b=num('measuredSize');const delta=Number.isFinite(a)&&Number.isFinite(b)?b-a:NaN;
 if(dev&&Number.isFinite(delta)&&dev.dataset.manual!=='yes'&&(changed!=='init'||!dev.value.trim()))dev.value=String(Number(delta.toFixed(4)));
 const hint=$('#inlineDeviationHint');if(hint)hint.textContent=Number.isFinite(delta)?'Scostamento calcolato: '+(delta>=0?'+':'')+delta.toFixed(3).replace('.',',')+' mm (misurata − nominale)':'Scostamento = quota misurata − quota nominale';
}
function inlineValue(k){return $('#inlineUsageEditor [name=iu_'+k+']')?.value||''}
function saveInlineUsage(){
 const title=inlineValue('title').trim();if(!title)return alert('Inserisci il nome della lavorazione.');
 preserveToolForm();
 const category=inlineValue('usageCategory');if(inlineUsageIndex<0&&category&&!allowedUsageCategories().includes(category))return alert('Lavorazione non compatibile con questo utensile.');
 preserveToolForm();const previous=inlineUsageIndex>=0?activeTool.usages[inlineUsageIndex]:{};
 const u={...previous};for(const k of ['title','usageCategory','workSide','threadFamily','pitch','material','machine','diameter','vc','rpm','teeth','fz','vf','ae','feed','ap','length','shimAngle','coolant','coolantPressure','outcome','nominalSize','measuredSize','sizeDeviation','sizeNotes','description','tips']){
 const el=$('#inlineUsageEditor [name=iu_'+k+']');if(el)u[k]=el.value;
 }
 if(inlineUsageIndex<0){activeTool.usages.push(u);inlineUsageIndex=activeTool.usages.length-1}else activeTool.usages[inlineUsageIndex]=u;
 activeTool.photos=toolPhotos;
 putTool({...activeTool,saved:true}).then(()=>{activeTool.saved=true;inlineUsageEditorOpen=false;inlineUsageIndex=-1;inlineUsageDraft=null;renderToolEdit();alert('Lavorazione e utensile salvati.')}).catch(e=>alert('Errore: '+e.message));
}
async function inlineUsagePhotos(event){
 const files=[...event.target.files];if(!files.length)return;
 // Save entered fields first to avoid losing unsaved changes during image processing.
 const title=inlineValue('title').trim();if(!title)return alert('Inserisci prima il nome della lavorazione.');
 const f=$('#inlineUsageEditor');const values={};f.querySelectorAll('[name^="iu_"]').forEach(e=>values[e.name.slice(3)]=e.value);
 const u=inlineUsageIndex>=0?activeTool.usages[inlineUsageIndex]:{};
 Object.assign(u,values);u.photos||=[];
 try{for(const file of files)if(file.type.startsWith('image/'))u.photos.push(await compress(file));
 if(inlineUsageIndex<0){activeTool.usages.push(u);inlineUsageIndex=activeTool.usages.length-1}
 renderInlineUsageEditor();}catch(e){alert('Foto non caricata: '+e.message)}
}
function editUsageInline(i){openInlineUsageEditor(i)}
function toggleToolThreadFields(){const f=$('#toolForm'),el=$('#toolThreadFields');if(f&&el)el.style.display=/filettatura/i.test(f.elements.type.value)?'':'none'}
// v0.8.4: categorie consentite per tipo utensile; categorie storiche conservate solo in modifica.
const WORK_CATEGORIES={
 'Punta':['Forature','Foratura profonda'],
 'Fresa':['Fresature laterali','Spianature','Contornature','Cave per chiavetta','Scanalature','Sgrossatura','Finitura'],
 'Filettatura interna':['Filettature'], 'Filettatura esterna':['Filettature'],
 'Maschio':['Maschiatura'], 'Alesatore':['Alesature'],
 'Inserto':['Sgrossatura','Finitura','Scanalature','Alesature','Altre lavorazioni'],
 'Altro':['Forature','Alesature','Fresature laterali','Spianature','Contornature','Cave per chiavetta','Scanalature','Filettature','Sgrossatura','Finitura','Altre lavorazioni']
};
function allowedUsageCategories(){const category=$('#toolForm [name=type]')?.value||activeTool?.type;return WORK_CATEGORIES[category]||WORK_CATEGORIES.Altro}
function compatibleCategoryOptions(selected){
 const options=allowedUsageCategories().slice();
 if(inlineUsageIndex>=0&&selected&&!options.includes(selected))options.unshift(selected); // storico modificabile
 return '<option value="">— Seleziona lavorazione —</option>'+options.map(c=>`<option value="${esc(c)}" ${selected===c?'selected':''}>${esc(c)}</option>`).join('');
}
function usageKind(){const t=$('#toolForm [name=type]')?.value||activeTool?.type||'';return t==='Fresa'?'mill':t==='Punta'?'drill':/filettatura/i.test(t)?'thread':t==='Maschio'?'tap':'turn'}
function usageDiameterLabel(){return usageKind()==='mill'?'Diametro fresa D (mm)':usageKind()==='drill'?'Diametro punta D (mm)':activeTool?.type==='Alesatore'?'Diametro finale alesatura (mm)':'Diametro lavorato (mm)'}
function usageApLabel(){return usageKind()==='mill'?'Profondità assiale ap (mm)':usageKind()==='drill'?'Profondità foro (mm)':'Profondità di passata ap (mm)'}
const DEFAULT_USAGE_CATEGORIES=['Cave per chiavetta','Spianature','Contornature','Scanalature','Fresature laterali','Forature','Alesature','Filettature','Sgrossatura','Finitura','Altre lavorazioni'];
function toolCategories(){return [...new Set([...DEFAULT_USAGE_CATEGORIES,...(activeTool.customUsageCategories||[]),...(activeTool.usages||[]).map(u=>u.usageCategory).filter(Boolean)])]}
function categoryOptions(selected){return '<option value="">— Senza categoria —</option>'+toolCategories().map(c=>`<option value="${esc(c)}" ${selected===c?'selected':''}>${esc(c)}</option>`).join('')}
function createUsageCategory(){const f=$('#usageForm');const name=prompt('Nome della nuova categoria:');if(name===null)return;const c=name.trim();if(!c)return;if(c.length>65)return alert('Massimo 65 caratteri.');activeTool.customUsageCategories||=[];if(!toolCategories().some(x=>x.toLowerCase()===c.toLowerCase()))activeTool.customUsageCategories.push(c);const select=f.elements.usageCategory;const option=document.createElement('option');option.value=c;option.textContent=c;select.add(option);select.value=c}
function openToolArchive(){preserveToolForm();go('toolArchive')}
function renderToolArchive(){const categories=toolCategories(),usages=activeTool.usages||[];app.innerHTML=`<div class="row"><h1>📂 Archivio utensile</h1><button onclick="go('toolEdit')">Indietro</button></div><p><strong>${esc(activeTool.name)}</strong> · ${usages.length} lavorazioni</p><div class="card"><label>Cerca per nome, materiale o macchina</label><input id="usageSearch" placeholder="Es. C45, cava, Mazak..." oninput="filterToolArchive()"><label>Categoria</label><select id="usageCategoryFilter" onchange="filterToolArchive()"><option value="">Tutte le categorie</option><option value="__uncategorized__">Senza categoria</option>${categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select><label>Esito</label><select id="usageOutcomeFilter" onchange="filterToolArchive()"><option value="">Tutti</option><option value="green">🟢 Riuscita</option><option value="yellow">🟡 Da ottimizzare</option><option value="red">🔴 Problematica</option><option value="none">⚪ Non valutata</option></select></div><div id="usageArchiveResults"></div><button class="primary wide" onclick="newUsage()">＋ Nuova lavorazione</button><p class="hint">Le lavorazioni precedenti senza categoria rimangono consultabili. Dopo le modifiche premi «Salva utensile» nella scheda utensile.</p>`;filterToolArchive()}
function filterToolArchive(){const q=($('#usageSearch')?.value||'').trim().toLocaleLowerCase('it'),cat=$('#usageCategoryFilter')?.value||'',out=$('#usageOutcomeFilter')?.value||'';const matches=(activeTool.usages||[]).map((u,i)=>({u,i})).filter(({u})=>{const category=u.usageCategory||'';return (!q||[u.title,u.material,u.machine,u.description,u.tips,category].join(' ').toLocaleLowerCase('it').includes(q))&&(!cat||(cat==='__uncategorized__'?!category:category===cat))&&(!out||(out==='none'?!u.outcome:u.outcome===out))});$('#usageArchiveResults').innerHTML=`<h2>Risultati (${matches.length})</h2>`+(matches.map(({u,i})=>`<button type="button" class="card item" onclick="editUsage(${i})">${u.photos?.[0]?`<img class="thumb" src="${u.photos[0]}" alt="Foto lavorazione">`:'<div class="thumb">⚙</div>'}<div><strong>${lightIcon(u.outcome)} ${esc(u.title||'Lavorazione')}</strong><br><small>${esc(u.usageCategory||'Senza categoria')} · ${esc(u.material||'Materiale n.d.')}</small><br><small>Vc ${esc(u.vc||'—')} · ${activeTool.type==='Fresa'?'fz '+esc(u.fz||'—'):'f '+esc(u.feed||'—')} · ap ${esc(u.ap||'—')}</small></div><span>›</span></button>`).join('')||'<div class="card muted">Nessuna lavorazione corrispondente.</div>')}
function newUsage(){preserveToolForm();usageIndex=-1;usagePhotos=[];go('toolUsage')}
function editUsage(i){preserveToolForm();usageIndex=i;usagePhotos=[...(activeTool.usages[i].photos||[])];go('toolUsage')}
function renderUsage(){const u=usageIndex<0?{}:activeTool.usages[usageIndex];app.innerHTML=`<div class="row"><h1>Lavorazione riuscita</h1><button onclick="go('toolEdit')">Indietro</button></div><p>Utensile: <strong>${esc(activeTool.name||'Nuovo utensile')}</strong></p><form id="usageForm" oninput="updateUsageCalc(event);updateDeviation(event)" onchange="updateUsageShimVisibility()" onsubmit="saveUsage(event)"><div class="card">${field('Nome lavorazione *','title',u.title)}<label>Categoria lavorazione</label><select name="usageCategory" id="usageCategory">${compatibleCategoryOptions(u.usageCategory)}</select><label>Posizione lavorazione</label><select name="workSide">${LIBRARY_SIDES.map(([v,label])=>`<option value="${v}" ${(u.workSide||activeTool.workSide||'')===v?'selected':''}>${label}</option>`).join('')}</select><button type="button" onclick="createUsageCategory()">＋ Crea categoria personalizzata</button><div id="usageThreadFields" style="display:${/filettatura/i.test([activeTool.type,u.usageCategory,u.title].join(' '))?'':'none'}"><label>Tipo di filetto della lavorazione</label><select name="threadFamily"><option value="">Usa quello dell'utensile</option>${[['metric','Metrica ISO'],['tr','Trapezoidale ISO'],['rd','Tonda'],['bspp','Gas cilindrica'],['bspt','Gas conica'],['un','UN'],['acme','ACME'],['other','Altro']].map(([v,l])=>`<option value="${v}" ${u.threadFamily===v?'selected':''}>${l}</option>`).join('')}</select>${field('Passo filettatura (mm)','pitch',u.pitch||activeTool.pitch,'number')}</div>${field('Materiale','material',u.material)}${field('Macchina','machine',u.machine)}${activeTool.type==='Fresa'?`<div class="card"><strong>Parametri fresatura</strong>${field('Diametro fresa D (mm)','diameter',u.diameter,'number')}${field('Velocità di taglio Vc (m/min)','vc',u.vc,'number')}${field('Giri mandrino (rpm)','rpm',u.rpm,'number')}${field('Numero di taglienti z','teeth',u.teeth,'number')}${field('Avanzamento per dente fz (mm/dente)','fz',u.fz,'number')}${field('Avanzamento tavola Vf (mm/min)','vf',u.vf,'number')}${field('Profondità assiale ap (mm)','ap',u.ap,'number')}${field('Larghezza radiale ae (mm)','ae',u.ae,'number')}<div class="card"><strong>📏 Risultato dimensionale ottenuto</strong><p class="hint">Registra lo scostamento misurato rispetto alla quota nominale. Esempio: −0,05 mm significa 5 centesimi sotto la quota nominale.</p>${field('Quota nominale (mm, facoltativa)','nominalSize',u.nominalSize,'number')}${field('Quota misurata (mm, facoltativa)','measuredSize',u.measuredSize,'number')}${field('Scostamento ottenuto (mm, con segno + o −)','sizeDeviation',u.sizeDeviation,'number')}<small id="deviationHint" class="hint">Puoi inserire direttamente −0,05 oppure calcolarlo dalle due quote.</small>${textfield('Note sulla precisione / misura','sizeNotes',u.sizeNotes)}</div></div>`:`${field(usageDiameterLabel(),'diameter',u.diameter,'number')}${field('Velocità di taglio Vc (m/min)','vc',u.vc,'number')}${field('Giri mandrino (rpm)','rpm',u.rpm,'number')}${field('Avanzamento f (mm/giro)','feed',u.feed,'number')}`}<div class="card"><strong>Calcolo automatico giri</strong><p class="hint">Inserisci diametro e Vc: n = 1000 × Vc / (π × D). Per le frese Vf = n × z × fz; per tornitura Vf = n × f.</p><div id="usageCalc" class="stat">—</div><small id="usageFeed"></small></div>${activeTool.type==='Fresa'?'':field(usageApLabel(),'ap',u.ap,'number')}<div id="usageShimWrap" style="display:${/filettatura/i.test([activeTool.type,u.usageCategory,u.title].join(' '))?'':'none'}">${field('Angolo sottoplacchetta utilizzato (°)','shimAngle',u.shimAngle,'number')}</div>${field('Lunghezza lavorata (mm)','length',u.length,'number')}${choice('Refrigerazione utilizzata','coolant',u.coolant,COOL)}${field('Pressione refrigerante (bar)','coolantPressure',u.coolantPressure,'number')}${choice('Esito lavorazione (semaforo)','outcome',u.outcome,LIGHTS)}${textfield('Descrizione lavorazione e risultato ottenuto','description',u.description)}${textfield('Accorgimenti e parametri che hanno funzionato','tips',u.tips)}<label>Foto della lavorazione / pezzo finito</label><input type="file" accept="image/*" multiple onchange="addUsagePhotos(event)">${photoView(usagePhotos)}<button type="button" onclick="preserveUsageForm();usagePhotos=[];renderUsage()">Rimuovi tutte le foto</button></div><button class="primary wide" type="submit">Conferma lavorazione</button></form>${usageIndex>=0?'<button class="danger wide" onclick="removeUsage()">Elimina questa lavorazione</button>':''}<p class="hint">Dopo aver confermato, premi «Salva utensile» nella scheda utensile per memorizzare le modifiche.</p>`;updateUsageCalc();updateDeviation()}
function updateDeviation(e){
 const form=$('#usageForm');if(!form||activeTool.type!=='Fresa')return;
 const nominal=form.elements.nominalSize,measured=form.elements.measuredSize,deviation=form.elements.sizeDeviation,hint=$('#deviationHint');
 if(!nominal||!measured||!deviation)return;
 const parse=v=>{const t=String(v||'').trim().replace(',','.').replace('−','-');return t===''?NaN:Number(t)};
 const a=parse(nominal.value),b=parse(measured.value);
 if(e?.target?.name==='sizeDeviation')deviation.dataset.manual='yes';
 if(Number.isFinite(a)&&Number.isFinite(b)&&a>0&&b>=0){
   const delta=b-a;
   if(deviation.dataset.manual!=='yes'){deviation.value=(Math.round(delta*10000)/10000).toFixed(4).replace(/0+$/,'').replace(/\.$/,'');deviation.dataset.auto='yes'}
   if(hint)hint.textContent='Scostamento calcolato: '+(delta>=0?'+':'')+delta.toFixed(3).replace('.',',')+' mm (misurata − nominale).';
 }else if(hint)hint.textContent='Inserisci lo scostamento direttamente (es. -0,05) oppure le due quote per calcolarlo.';
}
function updateUsageCalc(e){
 const form=$('#usageForm');if(!form)return;
 const read=k=>Number(String(form.elements[k]?.value||'').replace(',','.'));
 const d=read('diameter'),vc=read('vc'),f=read('feed'),z=read('teeth'),fz=read('fz');
 const n=d>0&&vc>0?1000*vc/(Math.PI*d):null;
 const result=$('#usageCalc'),feed=$('#usageFeed');
 if(result)result.textContent=n?`${n.toFixed(0)} giri/min (teorici)`:'Inserisci D e Vc';
 const isMill=activeTool.type==='Fresa';const vf=n?(isMill?(z>0&&fz>0?n*z*fz:null):(f>0?n*f:null)):null;
 if(feed)feed.textContent=vf?`Avanzamento teorico: ${vf.toFixed(1)} mm/min`:(isMill?'Inserisci numero di taglienti e fz.':'Il valore f non modifica i giri/min.');
 if(isMill&&vf&&form.elements.vf&&(!form.elements.vf.value||form.elements.vf.dataset.auto==='yes')){form.elements.vf.value=vf.toFixed(1);form.elements.vf.dataset.auto='yes'}
 if(e?.target?.name==='vf'&&form.elements.vf)form.elements.vf.dataset.auto='no';
 // Non sovrascrivere un numero di giri inserito manualmente.
 if(n&&form.elements.rpm&&(!form.elements.rpm.value||form.elements.rpm.dataset.auto==='yes')){
   form.elements.rpm.value=String(Math.round(n));form.elements.rpm.dataset.auto='yes';
 }
 if(e?.target?.name==='rpm')form.elements.rpm.dataset.auto='no';
}
function preserveUsageForm(){const form=$('#usageForm');if(!form)return;let f=new FormData(form),u={};for(let k of ['title','pitch','threadFamily','material','machine','diameter','vc','rpm','feed','teeth','fz','vf','ae','ap','length','coolant','coolantPressure','description','tips','outcome','nominalSize','measuredSize','sizeDeviation','sizeNotes','usageCategory','workSide','shimAngle'])u[k]=String(f.get(k)||'');u.photos=usagePhotos;if(usageIndex<0){activeTool.usages.push(u);usageIndex=activeTool.usages.length-1}else activeTool.usages[usageIndex]=u}
function saveUsage(e){e.preventDefault();if(!$('#usageForm [name=title]').value.trim())return alert('Inserisci il nome della lavorazione.');preserveUsageForm();go('toolEdit')}
async function addUsagePhotos(e){preserveUsageForm();try{for(let f of [...e.target.files])if(f.type.startsWith('image/'))usagePhotos.push(await compress(f));renderUsage()}catch(err){alert('Foto non caricata: '+err.message)}}
function removeUsage(){if(confirm('Eliminare questa lavorazione dalla scheda utensile?')){activeTool.usages.splice(usageIndex,1);go('toolEdit')}}
async function addToolPhotos(e){preserveToolForm();try{for(let f of [...e.target.files]){if(!f.type.startsWith('image/'))continue;toolPhotos.push(await compress(f))}renderToolEdit()}catch(err){alert('Impossibile caricare la foto: '+err.message)}}
async function saveTool(e){e.preventDefault();if(!toolDetailsEditing)return;preserveToolForm();if(!activeTool.name.trim())return alert('Inserisci il nome dell’utensile.');activeTool.photos=toolPhotos;activeTool.saved=true;try{await putTool(activeTool);toolDetailsEditing=false;renderToolEdit()}catch(err){alert('Salvataggio non riuscito: '+err.message)}}
async function removeTool(){if(confirm('Eliminare questo utensile dalla libreria? Le vecchie schede di lavorazione non saranno eliminate.')){await deleteTool(activeTool.id);go('tools')}}
let compareDefaultTool='';
function openCompare(id){if(page==='toolEdit')preserveToolForm();compareDefaultTool=id||'';go('compare')}
async function renderCompare(){
 const tools=await allTools();
 const entries=tools.flatMap(t=>(t.usages||[]).map((u,i)=>({tool:t,usage:u,key:t.id+':'+i})));
 app.innerHTML=`<div class="row"><h1>📊 Confronto parametri</h1><button onclick="go('tools')">Chiudi</button></div>
 <p>Confronta due lavorazioni dello stesso utensile o di utensili differenti. I valori sono quelli registrati da te.</p>
 <div class="card"><label>Prima lavorazione</label><select id="compareA" onchange="drawComparison()">${entries.map(e=>`<option value="${esc(e.key)}" ${e.tool.id===compareDefaultTool?'selected':''}>${esc(e.tool.name)} — ${esc(e.usage.title||'Lavorazione')} (${esc(e.usage.material||'materiale n.d.')})</option>`).join('')}</select>
 <label>Seconda lavorazione</label><select id="compareB" onchange="drawComparison()">${entries.map((e,i)=>`<option value="${esc(e.key)}" ${i===1?'selected':''}>${esc(e.tool.name)} — ${esc(e.usage.title||'Lavorazione')} (${esc(e.usage.material||'materiale n.d.')})</option>`).join('')}</select></div>
 <div id="compareResult"></div>`;
 window.compareEntries=entries;
 if(entries.length>1&&$('#compareA').value===$('#compareB').value){const other=entries.find(e=>e.key!==$('#compareA').value);$('#compareB').value=other.key}
 drawComparison();
}
function drawComparison(){
 const target=$('#compareResult');if(!target)return;
 const entries=window.compareEntries||[];
 if(entries.length<2){target.innerHTML='<div class="card">Registra almeno due lavorazioni riuscite nella libreria utensili per confrontarle.</div>';return}
 const a=entries.find(e=>e.key===$('#compareA').value),b=entries.find(e=>e.key===$('#compareB').value);
 if(!a||!b||a.key===b.key){target.innerHTML='<p>Seleziona due lavorazioni differenti.</p>';return}
 const rows=[['Utensile','name'],['Materiale','material'],['Macchina','machine'],['Diametro (mm)','diameter'],['Vc (m/min)','vc'],['Giri (rpm)','rpm'],['f (mm/giro)','feed'],['ap (mm)','ap'],['Sottoplacchetta (°)','shimAngle'],['Lunghezza (mm)','length'],['Refrigerazione utensile','coolantCapability'],['Refrigerazione usata','coolant'],['Pressione (bar)','coolantPressure']];
 const num=new Set(['diameter','vc','rpm','feed','ap','length','coolantPressure']);
 const cell=(e,k)=>k==='name'?e.tool.name:k==='coolantCapability'?e.tool.coolantCapability:e.usage[k];
 const rowsHTML=rows.map(([label,k])=>{const x=cell(a,k),y=cell(b,k);let diff='';if(num.has(k)&&x!==''&&y!==''&&x!=null&&y!=null){const n1=Number(String(x).replace(',','.')),n2=Number(String(y).replace(',','.'));if(Number.isFinite(n1)&&Number.isFinite(n2)&&n1!==0)diff=`<small class="muted"> (${((n2-n1)/Math.abs(n1)*100)>=0?'+':''}${((n2-n1)/Math.abs(n1)*100).toFixed(1)}%)</small>`}return `<tr><th>${label}</th><td>${esc(x||'—')}</td><td>${esc(y||'—')}${diff}</td></tr>`}).join('');
 const photos=e=>e.usage.photos?.length?photoView(e.usage.photos):'<p>Nessuna fotografia</p>';
 target.innerHTML=`<div class="card"><div class="tablewrap"><table class="comparison"><thead><tr><th>Parametro</th><th>Lavorazione 1</th><th>Lavorazione 2</th></tr></thead><tbody>${rowsHTML}</tbody></table></div></div><div class="grid"><div class="card"><strong>${esc(a.usage.title)}</strong>${photos(a)}<p>${esc(a.usage.description||'')}</p><p>${esc(a.usage.tips||'')}</p></div><div class="card"><strong>${esc(b.usage.title)}</strong>${photos(b)}<p>${esc(b.usage.description||'')}</p><p>${esc(b.usage.tips||'')}</p></div></div><p class="hint">Le percentuali descrivono differenze, non dimostrano quale parametro sia migliore. Confronta preferibilmente stesso materiale, geometria e condizioni di lavoro.</p>`;
}

function normSearch(v){return String(v||'').trim().toLocaleLowerCase('it').replace(/\s+/g,' ')}
function numberSearch(v){const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)&&n>0?n:null}
function searchKind(v){const x=normSearch(v);if(/filett|maschi|trapezoid|\btr\s*\d|\brd\s*\d|\bacme\b/.test(x))return 'thread';if(/fres|cav[ae]|spianatur|contornatur/.test(x))return 'mill';if(/forat|punta/.test(x))return 'drill';if(/torn|sgross|finit|baren|insert/.test(x))return 'turn';return 'other'}
function threadFamily(raw){const x=normSearch(raw);if(/trapezoid|\btr\s*\d/.test(x))return 'tr';if(/\bacme\b/.test(x))return 'acme';if(/\brd\s*\d|tond[ao]/.test(x))return 'rd';if(/\bbsp[t]|gas.conic|\br\s*\d+\/\d+/.test(x))return 'bspt';if(/\bbsp[p]|gas.cilind|\bg\s*\d+\/\d+/.test(x))return 'bspp';if(/\bunc\b|\bunf\b|\bun\b/.test(x))return 'un';if(/metric|metric[ao]|\bm\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+)?/.test(x))return 'metric';return ''}
function threadStep(raw){const x=normSearch(raw).replace(/,/g,'.');const m=x.match(/\b(?:tr|m|rd)\s*\d+(?:\.\d+)?\s*[x×]\s*(\d+(?:\.\d+)?)/);return m?Number(m[1]):null}
function threadSide(raw){const x=normSearch(raw);if(/intern|\bint\b|baren/.test(x))return 'internal';if(/estern|\best\b/.test(x))return 'external';return ''}
function inferThread(e){const raw=[e.title,e.type,e.tool,e.notes,e.category].filter(Boolean).join(' ');return {family:threadFamily(e.threadFamily)||e.threadFamily||threadFamily(raw),step:numberSearch(e.pitch)||threadStep(raw),side:e.side||threadSide(raw)}}
function smartThreadFields(){const el=$('#smartThreadFilters');if(el)el.style.display=$('#smartKind')?.value==='thread'?'':'none'}
async function renderSmartSearch(){
 app.innerHTML=`<div class="row"><h1>🔎 Ricerca intelligente</h1><button onclick="go('archive')">Indietro</button></div><p>Trova lavorazioni simili nell'archivio e nelle schede utensili. Ricerca locale, senza internet o AI esterna.</p><div class="card">${field('Materiale (es. C45)','smartMaterial')}<label>Tipo lavorazione</label><select id="smartKind" onchange="smartThreadFields()"><option value="">Tutte</option><option value="turn">Tornitura</option><option value="mill">Fresatura</option><option value="drill">Foratura</option><option value="thread">Filettatura</option></select><div id="smartThreadFilters" style="display:none"><label>Tipo di filetto</label><select id="smartThreadFamily"><option value="">Tutti i tipi</option><option value="metric">Metrica ISO (M)</option><option value="tr">Trapezoidale ISO (Tr)</option><option value="rd">Tonda (Rd)</option><option value="bspp">Gas cilindrica (G/BSPP)</option><option value="bspt">Gas conica (R/BSPT)</option><option value="un">UN (UNC/UNF)</option><option value="acme">ACME</option></select>${field('Passo filettatura (mm)','smartPitch','','number')}<label>Posizione filettatura</label><select id="smartSide"><option value="">Interna ed esterna</option><option value="internal">Interna</option><option value="external">Esterna</option></select><p class="hint">Il passo deve corrispondere a quello registrato. Per le vecchie schede l’app prova a riconoscere sigle come TR95x16 e M30x2. Per filetti in TPI inserisci il passo equivalente in mm.</p></div>${field('Diametro indicativo (mm)','smartDiameter','','number')}<label>Tolleranza diametro</label><select id="smartTolerance"><option value="10">± 10%</option><option value="20" selected>± 20%</option><option value="50">± 50%</option><option value="0">Diametro esatto</option></select><label>Origine del risultato</label><select id="smartSource" onchange="runSmartSearch()"><option value="">Tutti</option><option value="job">📋 Archivio lavorazioni</option><option value="tool">🔧 Libreria utensili</option></select><label>Semaforo</label><select id="smartLight"><option value="">Tutti gli esiti</option><option value="green">🟢 Riuscita</option><option value="yellow">🟡 Da ottimizzare</option><option value="red">🔴 Problematica</option><option value="none">⚪ Non valutata</option></select><button class="primary wide" type="button" onclick="runSmartSearch()">Cerca lavorazioni simili</button></div><div id="smartResults" aria-live="polite"></div>`;
 await runSmartSearch();
}
async function runSmartSearch(){
 const target=$('#smartResults');if(!target)return;
 const material=normSearch($('[name=smartMaterial]').value),kind=$('#smartKind').value,diam=numberSearch($('[name=smartDiameter]').value),tol=Number($('#smartTolerance').value)/100,light=$('#smartLight').value,sourceFilter=$('#smartSource').value;
 const family=$('#smartThreadFamily').value,step=numberSearch($('[name=smartPitch]').value),side=$('#smartSide').value;
 const jobs=await all(),tools=await allTools(),entries=[];
 for(const j of jobs){for(let i=0;i<(j.ops||[]).length;i++){const o=j.ops[i];entries.push({source:'job',id:j.id,index:i,title:j.name+' · '+(o.type||'Operazione'),type:o.type,material:j.material,kind:searchKind(o.type),diam:o.diameter,outcome:jobLight(j.result),vc:o.vc,feed:o.feed,fz:o.fz,ap:o.ap,pitch:o.pitch,threadFamily:o.threadFamily,side:threadSide(o.type),tool:o.tool,photos:o.photos?.length?o.photos:j.photos||[],notes:[o.notes,o.problem,o.solution].filter(Boolean).join(' · ')})}if(!(j.ops||[]).length)entries.push({source:'job',id:j.id,title:j.name,material:j.material,kind:searchKind(j.name),diam:'',outcome:jobLight(j.result),photos:j.photos||[],notes:j.notes})}
 for(const t of tools){const usages=t.usages||[];for(let i=0;i<usages.length;i++){const u=usages[i];const words=[u.title,u.usageCategory,t.type,t.name].join(' ');const k=searchKind(words);entries.push({source:'tool',id:t.id,index:i,title:u.title||'Lavorazione',type:u.usageCategory,category:u.usageCategory,material:u.material,kind:k,diam:u.diameter,outcome:u.outcome||'',vc:u.vc,feed:u.feed,fz:u.fz,ap:u.ap,pitch:u.pitch||t.pitch,threadFamily:u.threadFamily||t.threadFamily,side:u.workSide==='internal'?'internal':u.workSide==='external'?'external':threadSide([u.title,u.usageCategory,t.type].join(' ')),tool:t.name,photos:u.photos||[],notes:[u.description,u.tips].filter(Boolean).join(' · ')})}
 // Anche gli utensili senza lavorazioni registrate devono essere trovabili.
 if(!usages.length || (t.threadFamily||t.pitch))entries.push({source:'tool',id:t.id,index:-1,title:t.name,tool:t.name,material:'',kind:searchKind([t.type,t.name].join(' ')),type:t.type,category:t.type,diam:'',pitch:t.pitch,threadFamily:t.threadFamily,outcome:'',photos:t.photos||[],notes:t.code||'',side:threadSide(t.type)})
 }
 const matches=entries.map(e=>{let score=0;const mat=normSearch(e.material);if(sourceFilter&&e.source!==sourceFilter)return null;if(material){if(!mat||(!mat.includes(material)&&!material.includes(mat)))return null;score+=mat===material?50:30}if(kind){if(e.kind!==kind)return null;score+=30}if(kind==='thread'){const th=inferThread(e);if(family&&th.family!==family)return null;if(step!==null&&(th.step===null||Math.abs(th.step-step)>0.0001))return null;if(side&&th.side!==side)return null;if(family)score+=20;if(step!==null)score+=25;if(side)score+=10}if(diam!==null){const d=numberSearch(e.diam);if(d===null||Math.abs(d-diam)>diam*tol+0.000001)return null;score+=25*(1-Math.min(1,Math.abs(d-diam)/Math.max(diam,0.001)))}if(light){if(light==='none'?!!e.outcome:e.outcome!==light)return null}if(e.outcome==='green')score+=5;return {...e,score}}).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,100);
 target.innerHTML=`<h2>Risultati (${matches.length})</h2>${matches.map(e=>`<button type="button" class="card item" onclick="openSmartResult('${e.source}','${esc(e.id)}',${e.index??-1})">${e.photos?.[0]?`<img class="thumb" src="${e.photos[0]}" alt="">`:'<div class="thumb">⚙</div>'}<div><span class="source-badge ${e.source==='job'?'source-job':'source-tool'}">${e.source==='job'?'📋 LAVORAZIONE — ARCHIVIO':e.index===-1?'🔧 UTENSILE — LIBRERIA':'🔧 LAVORAZIONE SALVATA NELL’UTENSILE'}</span><br><strong>${lightIcon(e.outcome)} ${esc(e.title)}</strong><br><small>${esc(e.material||'Materiale n.d.')} · ${esc(e.tool||'Utensile n.d.')} · Ø ${esc(e.diam||'—')} mm</small><br><small>Vc ${esc(e.vc||'—')} · ${e.fz?'fz '+esc(e.fz):'f '+esc(e.feed||'—')} · ap ${esc(e.ap||'—')}${e.kind==='thread'&&inferThread(e).step?' · passo '+esc(inferThread(e).step)+' mm':''}</small></div><span>›</span></button>`).join('')||'<div class="card">Nessun risultato corrispondente. Controlla origine, materiale e filtri. Le schede senza passo o tipo filetto riconoscibile non compaiono nelle ricerche specifiche.</div>'}<p class="hint">🟢 Riuscita · 🟡 Da ottimizzare · 🔴 Problematica · ⚪ Non valutata. Il semaforo è assegnato da te, non dedotto automaticamente dai parametri.</p>`;
}
async function openSmartResult(source,id,index){if(source==='job'){await editJob(id);return}await editTool(id);if(index>=0)editUsage(index)}

function renderCalc(){app.innerHTML=`<h1>Calcolatore CNC</h1><p>Calcoli teorici: verifica sempre i limiti di macchina e utensile.</p><div class="card">${field('Diametro D (mm)','d',95,'number')}${field('Velocità di taglio Vc (m/min)','vc',100,'number')}${field('Avanzamento f (mm/giro)','f',0.2,'number')}${field('Lunghezza lavorazione L (mm)','l',200,'number')}<button class="primary wide" onclick="calculate()">Calcola</button><div id="calcResult"></div></div>`;calculate()}function calculate(){let v=k=>Number($(`[name=${k}]`).value.trim().replace(',','.')),d=v('d'),vc=v('vc'),f=v('f'),l=v('l');if([d,vc,f,l].some(x=>!Number.isFinite(x)||x<=0)){$('#calcResult').innerHTML='<p class="error">Inserisci valori positivi.</p>';return}let n=1000*vc/(Math.PI*d),vf=n*f,t=l/vf;$('#calcResult').innerHTML=`<h2>Risultati</h2><div class="stat">${n.toFixed(0)} rpm</div><p>Avanzamento: <strong>${vf.toFixed(1)} mm/min</strong><br>Tempo teorico: <strong>${t.toFixed(2)} min</strong></p><small>Tempo senza avvicinamenti, cambi utensile o accelerazioni.</small>`}
function renderSettings(){app.innerHTML=`<h1>Impostazioni</h1><div class="card"><h2>Aspetto</h2><button class="wide" onclick="toggleTheme()">Cambia tema chiaro / scuro</button></div><div class="card"><h2>Dati e backup</h2><p>Le schede e le foto rimangono in questo browser sul dispositivo. Esporta regolarmente una copia.</p><button class="primary wide" onclick="exportBackup()">Esporta backup JSON (lavorazioni + utensili + foto)</button><label>Importa backup (sostituisce le schede con gli stessi ID)</label><input type="file" accept="application/json,.json" onchange="importBackup(event)"></div><div class="card"><h2>🔄 Aggiornamenti</h2><p>Versione installata: <strong>0.9.3</strong></p><p id="update-status" class="hint">Controlla se è disponibile una nuova versione.</p><button class="wide" onclick="checkAppUpdate()">Verifica aggiornamenti</button><button class="primary wide" onclick="refreshAppVersion()">Aggiorna applicazione</button><p class="hint">Aggiorna solo i file dell'app, senza eliminare utensili, foto o lavorazioni. Esporta comunque un backup periodico.</p></div><p class="hint">Versione 0.9.3 · Nessun account · Nessun invio di dati al cloud</p>`}async function exportBackup(){let jobs=await all(),tools=await allTools(),blob=new Blob([JSON.stringify({app:'CNC WorkLog',version:2,jobs,tools})],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cnc-worklog-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}async function importBackup(e){let f=e.target.files[0];if(!f)return;try{let data=JSON.parse(await f.text());if(data.app!=='CNC WorkLog'||!Array.isArray(data.jobs)||data.jobs.some(j=>!j.id||typeof j.name!=='string'||!Array.isArray(j.ops||[])))throw Error('Formato backup non valido');if(!confirm(`Importare ${data.jobs.length} schede? Le schede con lo stesso ID saranno sovrascritte.`))return;for(let j of data.jobs)await put(j);if(Array.isArray(data.tools)){for(let t of data.tools){if(t.id&&typeof t.name==='string')await putTool(t)}}alert('Backup importato.');go('archive')}catch(err){alert('Importazione fallita: '+err.message)}}function toggleTheme(){document.body.classList.toggle('light');localStorage.setItem('cnc-theme',document.body.classList.contains('light')?'light':'dark')}$('#theme').onclick=toggleTheme;document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));if(localStorage.getItem('cnc-theme')==='light')document.body.classList.add('light');(async()=>{try{db=await openDB();render();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{})}catch(e){app.innerHTML='<p class="error">Impossibile avviare il database locale: '+esc(e.message)+'</p>'}})();

// Aggiornamento sicuro: non modifica IndexedDB o localStorage.
const CNC_APP_VERSION='0.9.3';
async function fetchPublishedVersion(){
 const r=await fetch('./version.json?t='+Date.now(),{cache:'no-store'});
 if(!r.ok)throw Error('Impossibile leggere la versione pubblicata');
 const data=await r.json();
 if(!/^\d+\.\d+\.\d+$/.test(data.version||''))throw Error('Versione non valida');
 return data.version;
}
async function checkAppUpdate(){
 const el=document.getElementById('update-status');
 if(el)el.textContent='Controllo in corso…';
 try{const remote=await fetchPublishedVersion();
 if(el)el.textContent=remote===CNC_APP_VERSION?'Hai già la versione più recente ('+CNC_APP_VERSION+').':'Disponibile versione '+remote+'. Premi Aggiorna applicazione.';
 }catch(e){if(el)el.textContent='Controllo non riuscito: '+e.message;}
}
async function refreshAppVersion(){
 if(!confirm('Ricaricare i file dell’app? Salva prima eventuali modifiche non ancora registrate. I dati salvati rimarranno sul dispositivo.'))return;
 const el=document.getElementById('update-status');if(el)el.textContent='Aggiornamento in corso…';
 try{
  if('serviceWorker' in navigator){
   const regs=await navigator.serviceWorker.getRegistrations();
   await Promise.all(regs.filter(r=>r.scope.startsWith(new URL('./',location.href).href)).map(r=>r.update().catch(()=>{})));
  }
  if('caches' in window){
   const names=await caches.keys();
   await Promise.all(names.filter(n=>n.startsWith('cnc-worklog-')).map(n=>caches.delete(n)));
  }
  const url=new URL(location.href);url.searchParams.set('v',String(Date.now()));
  location.replace(url.href);
 }catch(e){if(el)el.textContent='Aggiornamento non riuscito: '+e.message;}
}

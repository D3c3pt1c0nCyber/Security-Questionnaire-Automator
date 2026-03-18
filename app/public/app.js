
// Authentication gate
let _sessionToken = localStorage.getItem('sq_session_token') || null;
let _currentUser = null; // { username, role, canAccessAdmin }

function userKey(key) {
  const u = _currentUser && _currentUser.username;
  return u ? key + '_' + u : key;
}

function authHeaders(headers = {}) {
  if (_sessionToken) headers['X-Session-Token'] = _sessionToken;
  return headers;
}

// Wrap fetch to auto-inject session token and handle 401s
const _origFetch = window.fetch;
window.fetch = function(url, opts = {}) {
  if (typeof url === 'string' && url.startsWith('/api/') && !url.includes('/auth-status') && !url.includes('/login')) {
    opts.headers = opts.headers || {};
    if (_sessionToken) opts.headers['X-Session-Token'] = _sessionToken;
  }
  return _origFetch.call(this, url, opts).then(res => {
    if (res.status === 401 && typeof url === 'string' && url.startsWith('/api/') && !url.includes('/login')) {
      localStorage.removeItem('sq_session_token');
      _sessionToken = null;
      const _ol = document.getElementById('loginOverlay');
      if (!_ol || _ol.style.display !== 'flex') showLogin();
    }
    return res;
  });
};

function showLogin() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.querySelector('.sb').style.visibility = 'hidden';
  document.querySelector('.mn').style.visibility = 'hidden';
  setTimeout(() => document.getElementById('loginUsername').focus(), 100);
}

function hideLogin() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.querySelector('.sb').style.visibility = '';
  document.querySelector('.mn').style.visibility = '';
}

function applyUserPermissions(user) {
  _currentUser = user;
  // Reload per-user state from namespaced keys
  if (user) {
    convs = JSON.parse(localStorage.getItem(userKey('sq_convs')) || '[]');
    renderHist();
    const savedModel = localStorage.getItem(userKey('sq_model'));
    if (savedModel) chModel(savedModel);
    // Restore active tab
    const savedTab = localStorage.getItem(userKey('sq_active_tab'));
    if (savedTab && savedTab !== 'chat') {
      const tabMap = {chat:0,upload:1,import:2,migrate:3,calendar:4,admin:5};
      const idx = tabMap[savedTab];
      if (idx !== undefined) { const navItems = document.querySelectorAll('.sb-nav-item'); if (navItems[idx]) sw(savedTab, navItems[idx]); }
    }
  }
  // Admin nav tab — hide if user cannot access it
  const adminNavItem = document.querySelectorAll('.sb-nav-item')[5];
  if (adminNavItem) adminNavItem.style.display = user && user.canAccessAdmin === false ? 'none' : '';
  // Users sub-tab — only visible to admins
  const usersTab = document.querySelector('.admin-tab-users');
  if (usersTab) usersTab.style.display = user && user.role === 'admin' ? '' : 'none';
  // Jira Settings bar — hide for admins (they use Admin → Authentication)
  const jiraSettingsBar = document.getElementById('jiraSettingsBar');
  if (jiraSettingsBar) jiraSettingsBar.style.display = user && user.role === 'admin' ? 'none' : '';
  // Sidebar user bar
  const bar = document.getElementById('sbUserBar');
  if (!bar) return;
  if (user) {
    document.getElementById('sbUsername').textContent = user.username || '';
    const roleEl = document.getElementById('sbUserRole');
    roleEl.textContent = user.role === 'admin' ? 'Admin' : 'User';
    roleEl.style.color = user.role === 'admin' ? 'var(--ac)' : 'var(--tx3)';
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
  }
}

let _loginCountdown = null;
function _startLockoutCountdown(minsLeft, errEl, btn) {
  if (_loginCountdown) clearInterval(_loginCountdown);
  let secsLeft = minsLeft * 60;
  btn.disabled = true;
  function tick() {
    const m = Math.floor(secsLeft / 60), s = secsLeft % 60;
    errEl.textContent = `Account locked. Try again in ${m}:${String(s).padStart(2,'0')}`;
    errEl.style.display = 'block';
    if (secsLeft <= 0) {
      clearInterval(_loginCountdown);
      _loginCountdown = null;
      btn.disabled = false;
      btn.textContent = 'Sign In';
      errEl.textContent = 'You can try again now.';
    }
    secsLeft--;
  }
  tick();
  _loginCountdown = setInterval(tick, 1000);
}
async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const pw = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    const r = await _origFetch('/api/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username, password:pw})});
    const d = await r.json();
    if (d.success) {
      if (_loginCountdown) { clearInterval(_loginCountdown); _loginCountdown = null; }
      _sessionToken = d.token;
      if (d.token) localStorage.setItem('sq_session_token', d.token);
      applyUserPermissions({ username: d.username, role: d.role, canAccessAdmin: d.canAccessAdmin });
      hideLogin();
      swTo('chat');
      _resetIdle();
    } else if (d.locked || r.status === 429) {
      _startLockoutCountdown(d.retryAfter || 15, errEl, btn);
      return;
    } else {
      let msg = d.error || 'Invalid username or password';
      if (d.attemptsLeft !== undefined && d.attemptsLeft > 0) msg += ` (${d.attemptsLeft} attempt${d.attemptsLeft !== 1 ? 's' : ''} left)`;
      else if (d.attemptsLeft === 0) msg += ' — next failure will lock your account';
      errEl.textContent = msg;
      errEl.style.display = 'block';
      document.getElementById('loginPassword').select();
    }
  } catch(e) {
    errEl.textContent = 'Connection error — check your network';
    errEl.style.display = 'block';
  }
  btn.disabled = false;
  btn.textContent = 'Sign In';
}

// --- Idle timeout (5 minutes) ---
const IDLE_LIMIT = 5 * 60 * 1000;
const IDLE_WARN  = 4 * 60 * 1000; // warn at 4 min (1 min before logout)
let _idleTimer = null, _idleWarnTimer = null;

function _doLogout() {
  clearTimeout(_idleTimer); clearTimeout(_idleWarnTimer);
  if (_sessionToken) _origFetch('/api/logout', {method:'POST',headers:{'X-Session-Token':_sessionToken}}).catch(()=>{});
  _sessionToken = null;
  _currentUser = null;
  localStorage.removeItem('sq_session_token');
  const w = document.getElementById('idleWarn');
  if (w) w.style.display = 'none';
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  applyUserPermissions(null);
  showLogin();
}

function _resetIdle() {
  clearTimeout(_idleTimer); clearTimeout(_idleWarnTimer);
  const w = document.getElementById('idleWarn');
  if (w) w.style.display = 'none';
  if (!_sessionToken) return; // not logged in
  _idleWarnTimer = setTimeout(() => {
    const w = document.getElementById('idleWarn');
    if (w) { w.style.display = 'flex'; let s = 60; const iv = setInterval(() => { s--; const c = document.getElementById('idleCountdown'); if (c) c.textContent = s; if (s <= 0) { clearInterval(iv); _doLogout(); } }, 1000); w._iv = iv; }
  }, IDLE_WARN);
  _idleTimer = setTimeout(_doLogout, IDLE_LIMIT);
}

['mousemove','mousedown','keydown','touchstart','scroll','click'].forEach(ev =>
  document.addEventListener(ev, () => { if (_sessionToken) _resetIdle(); }, { passive: true })
);

// Check if auth is required on load
window._hasServerApiKey = false;
(async () => {
  try {
    const r = await _origFetch('/api/auth-status');
    const d = await r.json();
    window._hasServerApiKey = !!d.hasApiKey;
    if (d.required) {
      if (_sessionToken) {
        const t = await _origFetch('/api/me', {headers:{'X-Session-Token':_sessionToken}});
        if (t.status === 401) {
          localStorage.removeItem('sq_session_token');
          _sessionToken = null;
          showLogin();
        } else {
          const u = await t.json();
          applyUserPermissions(u);
          _resetIdle();
        }
      } else {
        showLogin();
      }
    } else {
      applyUserPermissions({ username: 'guest', role: 'admin', canAccessAdmin: true });
      _resetIdle();
    }
  } catch(e) { /* no auth check possible, continue */ }

  // --- histBody: hitem click (loadConv) and hitem-del click (delConv) ---
  var histBody = document.getElementById('histBody');
  if (histBody) {
    histBody.addEventListener('click', function(e) {
      var delBtn = e.target.closest('[data-del-conv]');
      if (delBtn) { e.stopPropagation(); delConv(delBtn.dataset.delConv, e); return; }
      var item = e.target.closest('[data-load-conv]');
      if (item) loadConv(item.dataset.loadConv);
    });
  }

  // --- chMsg: handle data-action="cpMsg" / data-action="openSave" ---
  // (supplement the existing delegation already on chMsg above)

  // --- calTkDetail: close button delegation ---
  var calTkDetail = document.getElementById('calTkDetail');
  if (calTkDetail) {
    calTkDetail.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="closeTkDetail"]');
      if (btn) closeTkDetail();
    });
  }

  // --- resultsBody: saveRowToBank delegation (supplement existing handler) ---
  // Already handled via data-action="saveRowToBank" in resultsBody delegation above
  // but the original used btn directly; now btn has data-rowid so we need to update
  if (resultsBody) {
    resultsBody.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="saveRowToBank"]');
      if (btn) saveRowToBank(btn);
    });
  }

  // --- chMsg: data-action buttons delegation ---
  if (chMsg) {
    chMsg.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="cpMsg"]');
      if (btn) { cpMsg(btn); return; }
      var svBtn = e.target.closest('[data-action="openSave"]');
      if (svBtn) { openSave(svBtn); return; }
    });
  }

})();

let upFile=null,outFN='',allRes=[],chHist=[],chAtt=[],isStr=false,convs=[],curCID=null;
const MN={'claude-opus-4-20250514':'Claude Opus 4','claude-sonnet-4-20250514':'Claude Sonnet 4','claude-haiku-4-5-20251001':'Claude Haiku 4.5'};
setTimeout(()=>{const apiInp=document.getElementById('apiKey');if(apiInp){if(window._hasServerApiKey){apiInp.placeholder='API key configured — enter to update';}}},500)
const _modelNames={'claude-opus-4-6':'Claude Opus 4.6','claude-sonnet-4-6':'Claude Sonnet 4.6','claude-haiku-4-5-20251001':'Claude Haiku 4.5','claude-opus-4-20250514':'Claude Opus 4','claude-sonnet-4-20250514':'Claude Sonnet 4'};
const sm=localStorage.getItem('sq_model')||'claude-sonnet-4-6';
document.getElementById('modelSelect').value=sm;
setTimeout(()=>{const ft=document.getElementById('inFt');if(ft)ft.textContent=`Using ${_modelNames[sm]||sm} \u00b7 Searches Confluence, Jira & local bank`},100);
function chModel(m){localStorage.setItem(userKey('sq_model'),m);const ft=document.getElementById('inFt');if(ft)ft.textContent=`Using ${_modelNames[m]||m} \u00b7 Searches Confluence, Jira & local bank`;const sb=document.getElementById('modelSelect');if(sb&&sb.value!==m)sb.value=m;const ad=document.getElementById('cfgAIModel');if(ad&&ad.value!==m)ad.value=m}
function gMod(){return document.getElementById('modelSelect').value}
function showResult(el,cls,msg){el.style.display='flex';el.className='admin-result '+cls;el.textContent=msg}
async function saveApiKey(){const k=document.getElementById('apiKey').value.trim();const res=document.getElementById('cfgApiResult');
if(!k){showResult(res,'err','Please enter an API key');return}
showResult(res,'warn','Saving...');
try{const r=await fetch('/api/admin/api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:k})});const d=await r.json();
if(d.success){window._hasServerApiKey=true;showResult(res,'ok','Claude API key saved — applies to all users');document.getElementById('apiKey').value='';document.getElementById('apiKey').placeholder='API key configured — enter to update';checkSystemStatus()}
else{showResult(res,'err',d.error||'Failed to save')}}catch(e){showResult(res,'err',e.message)}}
async function testApiKey(){const res=document.getElementById('cfgApiResult');
if(!window._hasServerApiKey){showResult(res,'err','No API key configured. Enter and save one first.');return}
showResult(res,'warn','Testing connection to Anthropic...');
try{const r=await fetch('/api/test-api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});const d=await r.json();
if(d.success){showResult(res,'ok','Connected to Anthropic API — '+d.model)}
else{showResult(res,'err',d.error||'Connection failed')}}catch(e){showResult(res,'err',e.message)}}
const PRODUCT_LABELS={'EV+PD':'EV+/PD'};
function pLabel(p){return PRODUCT_LABELS[p]||p}
function loadProducts(){fetch('/api/products').then(r=>r.json()).then(ps=>{if(!Array.isArray(ps))return;['productSelect','docProductSelect','chatProduct','migProductSelect'].forEach(id=>{const s=document.getElementById(id);if(!s)return;const cur=s.value;s.innerHTML='<option value="">All Products</option>';ps.forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=pLabel(p);if(p===cur)o.selected=true;s.appendChild(o)})});const ip=document.getElementById('iProd');if(ip){const cur=ip.value;ip.innerHTML='<option value="" disabled selected>— Select product —</option>';ps.forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=pLabel(p);if(p===cur)o.selected=true;ip.appendChild(o)})}})}
loadProducts();
setInterval(loadProducts,30000);
// Auto-refresh active tab data every 30s
setInterval(function(){
  if(!_sessionToken)return;
  const tab=localStorage.getItem(userKey('sq_active_tab'))||'chat';
  if(tab==='upload')ldBatchFw();
  else if(tab==='import')ldImpOpts();
  else if(tab==='migrate')ldMigFw();
  else if(tab==='calendar'){ldCal();ldTickets();}
  else if(tab==='admin'){const activeAdmin=document.querySelector('.admin-tab.on');if(activeAdmin){const t=activeAdmin.dataset.tab;if(t==='status')checkSystemStatus();else if(t==='bank')refreshBankStats();else if(t==='logs')loadLogs();else if(t==='users')loadUsers();}}
},30000);
function renderProductList(){fetch('/api/products').then(r=>r.json()).then(ps=>{if(!Array.isArray(ps))return;const el=document.getElementById('adminProductList');if(!el)return;if(!ps.length){el.innerHTML='<div style="color:var(--tx3);font-size:12px;padding:8px">No products configured</div>';return}el.innerHTML=ps.map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--sf);border:1px solid var(--bd);border-radius:6px"><span style="font-size:13px;color:var(--tx)">${esc(pLabel(p))}</span><button data-del-product="${esc(p)}" class="prod-del-btn" style="background:none;border:none;color:var(--tx3);cursor:pointer;font-size:16px;padding:2px 6px;border-radius:4px;transition:color .12s" title="Remove">&times;</button></div>`).join('')})}
async function addProduct(){const inp=document.getElementById('newProductName');const name=inp.value.trim();const res=document.getElementById('adminProductResult');if(!name){showResult(res,'err','Enter a product name');return}try{const r=await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});const d=await r.json();if(d.success){inp.value='';showResult(res,'ok',`Product "${pLabel(name)}" added`);setTimeout(()=>res.style.display='none',2000);loadProducts();renderProductList()}else{showResult(res,'err',d.error||'Failed to add product')}}catch(e){showResult(res,'err',e.message)}}
async function delProduct(name){if(!confirm(`Remove product "${pLabel(name)}"? This won't delete any files.`))return;const res=document.getElementById('adminProductResult');try{const r=await fetch('/api/products/'+encodeURIComponent(name),{method:'DELETE'});const d=await r.json();if(d.success){showResult(res,'ok',`Product "${pLabel(name)}" removed`);setTimeout(()=>res.style.display='none',2000);loadProducts();renderProductList()}else{showResult(res,'err',d.error||'Failed')}}catch(e){showResult(res,'err',e.message)}}

/* Framework Management */
async function renderFWList(){try{const r=await fetch('/api/bank/frameworks');const fws=await r.json();const el=document.getElementById('adminFWList');if(!el)return;if(!fws.length){el.innerHTML='<div style="color:var(--tx3);font-size:12px;padding:8px">No frameworks configured. Add HECVAT, SIG, or other frameworks above.</div>';return}
el.innerHTML=fws.map(fw=>`<div style="border:1px solid var(--bd);border-radius:8px;padding:10px 12px;background:var(--sf)">
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
<span style="font-size:14px;font-weight:600;color:var(--tx)">${esc(fw.name)}</span>
<button data-del-fw="${esc(fw.name)}" class="fw-del-btn" style="background:none;border:none;color:var(--tx3);cursor:pointer;font-size:16px;padding:2px 6px;border-radius:4px" title="Remove framework">&times;</button>
</div>
<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px" id="fwVers_${esc(fw.name).replace(/\s/g,'_')}">${fw.versions.length?fw.versions.map(v=>`<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--sf2);border:1px solid var(--bd);border-radius:4px;font-size:11px;color:var(--tx2)">${esc(v)}<button data-del-fw-name="${esc(fw.name)}" data-del-fw-ver="${esc(v)}" class="fw-ver-del-btn" style="background:none;border:none;color:var(--tx3);cursor:pointer;font-size:13px;line-height:1;padding:0 2px">&times;</button></span>`).join(''):'<span style="font-size:11px;color:var(--tx3)">No versions yet</span>'}
</div>
<div style="display:flex;gap:6px">
<input type="text" class="admin-input" placeholder="Add version (e.g. v3.1, Full, Lite)" style="flex:1;font-size:12px;padding:4px 8px" id="fwVerInput_${esc(fw.name).replace(/\s/g,'_')}" data-fw-ver-input="${esc(fw.name)}">
<button class="bb sec" data-add-fw-ver="${esc(fw.name)}" style="font-size:11px;padding:4px 10px">Add Version</button>
</div></div>`).join('')}catch{}}

async function addFramework(){const inp=document.getElementById('newFWName');const name=inp.value.trim();const res=document.getElementById('adminFWResult');if(!name){showResult(res,'err','Enter a framework name');return}
try{const r=await fetch('/api/frameworks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});const d=await r.json();if(d.success){inp.value='';showResult(res,'ok',`Framework "${name}" added`);setTimeout(()=>res.style.display='none',2000);renderFWList()}else{showResult(res,'err',d.error||'Failed')}}catch(e){showResult(res,'err',e.message)}}

async function delFramework(name){if(!confirm(`Remove framework "${name}"? This won't delete any stored files.`))return;const res=document.getElementById('adminFWResult');try{const r=await fetch('/api/frameworks/'+encodeURIComponent(name),{method:'DELETE'});const d=await r.json();if(d.success){showResult(res,'ok',`Framework "${name}" removed`);setTimeout(()=>res.style.display='none',2000);renderFWList()}else{showResult(res,'err',d.error||'Failed')}}catch(e){showResult(res,'err',e.message)}}

async function addFWVersion(fwName){const inp=document.getElementById('fwVerInput_'+fwName.replace(/\s/g,'_'));const ver=inp.value.trim();const res=document.getElementById('adminFWResult');if(!ver){showResult(res,'err','Enter a version name');return}
try{const r=await fetch('/api/frameworks/'+encodeURIComponent(fwName)+'/versions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:ver})});const d=await r.json();if(d.success){inp.value='';showResult(res,'ok',`Version "${ver}" added to ${fwName}`);setTimeout(()=>res.style.display='none',2000);renderFWList()}else{showResult(res,'err',d.error||'Failed')}}catch(e){showResult(res,'err',e.message)}}

async function delFWVersion(fwName,ver){if(!confirm(`Remove version "${ver}" from ${fwName}?`))return;const res=document.getElementById('adminFWResult');try{const r=await fetch('/api/frameworks/'+encodeURIComponent(fwName)+'/versions/'+encodeURIComponent(ver),{method:'DELETE'});const d=await r.json();if(d.success){showResult(res,'ok',`Version "${ver}" removed`);setTimeout(()=>res.style.display='none',2000);renderFWList()}else{showResult(res,'err',d.error||'Failed')}}catch(e){showResult(res,'err',e.message)}}

async function updateJobsBadge(){try{const r=await fetch('/api/jobs');const js=await r.json();const running=js.filter(j=>j.status==='running');const badge=document.getElementById('jobsBadge');if(running.length>0){badge.style.display='block';document.getElementById('jobsBadgeTxt').textContent=running.length+' job'+(running.length>1?'s':'')+' running'}else{badge.style.display='none'}}catch{}}
setInterval(updateJobsBadge,2000);
// On load: cancel any stale localStorage job references that are no longer running
(async()=>{for(const key of['sq_active_batch_job','sq_active_mig_job']){const id=localStorage.getItem(userKey(key));if(id){try{const r=await fetch('/api/jobs/'+id);const j=await r.json();if(!j||j.status!=='running')localStorage.removeItem(userKey(key))}catch{localStorage.removeItem(userKey(key))}}}updateJobsBadge()
  // --- histBody: hitem click (loadConv) and hitem-del click (delConv) ---
  var histBody = document.getElementById('histBody');
  if (histBody) {
    histBody.addEventListener('click', function(e) {
      var delBtn = e.target.closest('[data-del-conv]');
      if (delBtn) { e.stopPropagation(); delConv(delBtn.dataset.delConv, e); return; }
      var item = e.target.closest('[data-load-conv]');
      if (item) loadConv(item.dataset.loadConv);
    });
  }

  // --- chMsg: handle data-action="cpMsg" / data-action="openSave" ---
  // (supplement the existing delegation already on chMsg above)

  // --- calTkDetail: close button delegation ---
  var calTkDetail = document.getElementById('calTkDetail');
  if (calTkDetail) {
    calTkDetail.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="closeTkDetail"]');
      if (btn) closeTkDetail();
    });
  }

  // --- resultsBody: saveRowToBank delegation (supplement existing handler) ---
  // Already handled via data-action="saveRowToBank" in resultsBody delegation above
  // but the original used btn directly; now btn has data-rowid so we need to update
  if (resultsBody) {
    resultsBody.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="saveRowToBank"]');
      if (btn) saveRowToBank(btn);
    });
  }

  // --- chMsg: data-action buttons delegation ---
  if (chMsg) {
    chMsg.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="cpMsg"]');
      if (btn) { cpMsg(btn); return; }
      var svBtn = e.target.closest('[data-action="openSave"]');
      if (svBtn) { openSave(svBtn); return; }
    });
  }

})();
renderHist();
(function(){/* active tab restore moved to applyUserPermissions so it runs after user is known */
  // --- histBody: hitem click (loadConv) and hitem-del click (delConv) ---
  var histBody = document.getElementById('histBody');
  if (histBody) {
    histBody.addEventListener('click', function(e) {
      var delBtn = e.target.closest('[data-del-conv]');
      if (delBtn) { e.stopPropagation(); delConv(delBtn.dataset.delConv, e); return; }
      var item = e.target.closest('[data-load-conv]');
      if (item) loadConv(item.dataset.loadConv);
    });
  }

  // --- chMsg: handle data-action="cpMsg" / data-action="openSave" ---
  // (supplement the existing delegation already on chMsg above)

  // --- calTkDetail: close button delegation ---
  var calTkDetail = document.getElementById('calTkDetail');
  if (calTkDetail) {
    calTkDetail.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="closeTkDetail"]');
      if (btn) closeTkDetail();
    });
  }

  // --- resultsBody: saveRowToBank delegation (supplement existing handler) ---
  // Already handled via data-action="saveRowToBank" in resultsBody delegation above
  // but the original used btn directly; now btn has data-rowid so we need to update
  if (resultsBody) {
    resultsBody.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="saveRowToBank"]');
      if (btn) saveRowToBank(btn);
    });
  }

  // --- chMsg: data-action buttons delegation ---
  if (chMsg) {
    chMsg.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="cpMsg"]');
      if (btn) { cpMsg(btn); return; }
      var svBtn = e.target.closest('[data-action="openSave"]');
      if (svBtn) { openSave(svBtn); return; }
    });
  }

})();
function sw(mode,btn){localStorage.setItem(userKey('sq_active_tab'),mode);document.querySelectorAll('.sb-nav-item').forEach(b=>b.classList.remove('on'));btn.classList.add('on');document.querySelectorAll('.pn').forEach(p=>p.classList.remove('on'));document.getElementById({chat:'chatPanel',upload:'uploadPanel',calendar:'calendarPanel',import:'importPanel',migrate:'migratePanel',admin:'adminPanel'}[mode]).classList.add('on');const mnEl=document.querySelector('.mn');mnEl.classList.toggle('no-top',mode!=='chat');mnEl.style.display=mode==='admin'?'none':'flex';const ht=document.getElementById('histToggle');const hb=document.getElementById('histBody');if(ht)ht.classList.toggle('open',mode==='chat');if(hb)hb.style.display=mode==='chat'?'':'none';if(mode==='calendar'){ldCal();ldAssignees();ldTickets();ldIssueTypes();ldStatuses();const hasAtl=localStorage.getItem(userKey('sq_atl_url'))&&localStorage.getItem(userKey('sq_atl_email'));updateJiraConnBadge(!!hasAtl,hasAtl?'Connected':'Not configured')}if(mode==='import')ldImpOpts();if(mode==='upload')ldBatchFw();if(mode==='migrate')ldMigFw();if(mode==='admin')loadAdminSettings()}
function toggleHist(){const ht=document.getElementById('histToggle');const hb=document.getElementById('histBody');if(ht&&hb){const open=ht.classList.toggle('open');hb.style.display=open?'':'none'}}
function saveConv(){if(!chHist.length)return;const t=chHist[0]?.content?.substring(0,40)||'New chat';const id=curCID||Date.now().toString();const idx=convs.findIndex(c=>c.id===id);const cv={id,title:t,messages:chHist,date:new Date().toISOString()};if(idx>=0)convs[idx]=cv;else convs.unshift(cv);if(convs.length>20)convs.pop();localStorage.setItem(userKey('sq_convs'),JSON.stringify(convs));curCID=id;renderHist()}
function loadConv(id){const c=convs.find(x=>x.id===id);if(!c)return;curCID=id;chHist=[...c.messages];const el=document.getElementById('chMsg');el.innerHTML='';c.messages.forEach(m=>appMsg(m.role,m.content,false));renderHist();document.getElementById('chScr').scrollTop=document.getElementById('chScr').scrollHeight}
function delConv(id,e){e.stopPropagation();convs=convs.filter(c=>c.id!==id);localStorage.setItem(userKey('sq_convs'),JSON.stringify(convs));if(curCID===id)newChat();else renderHist()}
function renderHist(){const el=document.getElementById('histBody');if(!el)return;if(!convs.length){el.innerHTML='<div style="padding:16px 12px;font-size:11px;color:var(--tx3);text-align:center">No conversations yet</div>';return}const now=new Date();const sod=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};const todayMs=sod(now).getTime();const grp=c=>{const d=sod(new Date(c.date)).getTime();const diff=(todayMs-d)/86400000;if(diff<1)return'Today';if(diff<2)return'Yesterday';if(diff<7)return'This past week';if(diff<30)return'This past month';return'Older'};const order=['Today','Yesterday','This past week','This past month','Older'];const groups={};convs.forEach(c=>{const g=grp(c);if(!groups[g])groups[g]=[];groups[g].push(c)});const itemHtml=c=>`<div class="hitem ${c.id===curCID?'on':''}" data-load-conv="${c.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span class="hitem-text">${esc(c.title)}</span><button class="hitem-del" data-del-conv="${c.id}">&times;</button></div>`;el.innerHTML=order.filter(g=>groups[g]).map(g=>`<div class="hitem-group">${g}</div>${groups[g].map(itemHtml).join('')}`).join('')}
function newChat(){if(chHist.length)saveConv();chHist=[];curCID=null;document.getElementById('chMsg').innerHTML=`<div class="welcome" id="wel"><img class="w-logo" src="logo.png" alt="Logo"><h2>Security Questionnaire Assistant</h2><p>Connected to Confluence, Jira, and your local answer bank.</p><div class="sugs"><div class="sug">What encryption do we use for data at rest and in transit?</div><div class="sug">Show me open security questionnaire tickets in Jira</div><div class="sug">Find our incident response policy on Confluence</div><div class="sug">Draft a HECVAT answer about multi-factor authentication</div></div></div>`;renderHist();swTo('chat')}
function uSug(el){document.getElementById('chIn').value=el.textContent;sendMsg()}
function chKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg()}}
function aRsz(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,180)+'px'}
const _mactHTML=`<div class="mact"><button class="ma-btn" data-action="cpMsg" title="Copy response"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</button><button class="ma-btn sv" data-action="openSave" title="Save to answer bank"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save to Bank</button></div>`;
function addMsgActions(msgEl){if(!msgEl.querySelector('.mact'))msgEl.querySelector('.mc').insertAdjacentHTML('beforeend',_mactHTML)}
function appMsg(role,content,anim=true){const el=document.getElementById('chMsg');const isU=role==='user';const d=document.createElement('div');d.className='msg';d.dataset.role=role;d.dataset.raw=content;if(!anim)d.style.animation='none';d.innerHTML=`<div class="mc"><div class="mr">${isU?'You':'Security Assistant'}</div><div class="mb">${isU?esc(content):fmtMd(content)}</div></div>`;el.appendChild(d);if(!isU)addMsgActions(d);return d}
function cpMsg(b){const t=b.closest('.mc').querySelector('.mb').innerText;navigator.clipboard.writeText(t);b.classList.add('ok');b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';setTimeout(()=>{b.classList.remove('ok');b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>'},2000)}
async function hCF(fl){const atBtn=document.querySelector('.ib.at');if(atBtn){atBtn.style.opacity='.4';atBtn.style.pointerEvents='none'}for(const f of fl){const fd=new FormData();fd.append('file',f);try{const r=await fetch('/api/upload',{method:'POST',body:fd});const d=await r.json();if(!d.error){chAtt.push(d);rCAtt()}}catch(e){}}document.getElementById('chFI').value='';if(atBtn){atBtn.style.opacity='';atBtn.style.pointerEvents=''}}
function rCAtt(){document.getElementById('chAtt').innerHTML=chAtt.map((f,i)=>`<div class="att-chip"><span class="att-ext">${(f.fileType||'').replace('.','')}</span><span>${esc(f.fileName)}</span><button class="att-x" data-att-idx="${i}">&times;</button></div>`).join('')}
async function sendMsg(){const inp=document.getElementById('chIn');const msg=inp.value.trim();if(!msg||isStr)return;if(!window._hasServerApiKey){alert('Set the Claude API key in Admin → Authentication');return}const w=document.getElementById('wel');if(w)w.remove();appMsg('user',msg);chHist.push({role:'user',content:msg});inp.value='';inp.style.height='auto';const mel=document.getElementById('chMsg');const ar=document.createElement('div');ar.className='msg';ar.dataset.role='assistant';ar.innerHTML=`<div class="mc"><div class="mr">Security Assistant</div><div class="mb"><div class="typing"><span></span><span></span><span></span></div></div></div>`;mel.appendChild(ar);const bd=ar.querySelector('.mb');const scr=document.getElementById('chScr');scr.scrollTop=scr.scrollHeight;isStr=true;document.getElementById('chSnd').disabled=true;shSts('Searching Confluence & Jira...');
try{const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:chHist,model:gMod(),product:document.getElementById('chatProduct').value,attachedFiles:chAtt,searchConfluence:document.getElementById('cfgSearchConf').checked,searchJira:document.getElementById('cfgSearchJira').checked})});const rd=res.body.getReader();const dec=new TextDecoder();let buf='',full='';while(true){const{value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});const lns=buf.split('\n');buf=lns.pop();for(const ln of lns){if(ln.startsWith('data: ')){try{const ev=JSON.parse(ln.slice(6));if(ev.type==='text'){hdSts();full+=ev.text;bd.innerHTML=fmtMd(full);scr.scrollTop=scr.scrollHeight}else if(ev.type==='status'){shSts(ev.message)}else if(ev.type==='done'){hdSts();bd.innerHTML=fmtMd(full);addMsgActions(ar);ar.dataset.raw=full;ar.dataset.role='assistant'}else if(ev.type==='error'){hdSts();bd.innerHTML=`<span style="color:var(--rd)">Error: ${esc(ev.message)}</span>`}}catch{}}}}chHist.push({role:'assistant',content:full});saveConv()}catch(e){bd.innerHTML=`<span style="color:var(--rd)">${esc(e.message)}</span>`}
isStr=false;document.getElementById('chSnd').disabled=false;chAtt=[];rCAtt();scr.scrollTop=scr.scrollHeight}
function shSts(m){document.getElementById('chStsTx').textContent=m;document.getElementById('chSts').classList.add('on')}
function hdSts(){document.getElementById('chSts').classList.remove('on')}
function mkSrcLink(cls,text){
const e=esc(text);
if(cls==='src-confluence'){const m=text.match(/(.+?)\s*\((\w+)\s*space\)/i);if(m)return`<a href="https://lmsportal.atlassian.net/wiki/search?text=${encodeURIComponent(m[1])}" target="_blank">${e}</a>`;return`<a href="https://lmsportal.atlassian.net/wiki/search?text=${encodeURIComponent(text)}" target="_blank">${e}</a>`}
if(cls==='src-jira'){const m=text.match(/(ISC-\d+)/);if(m)return`<a href="https://lmsportal.atlassian.net/browse/${m[1]}" target="_blank">${e}</a>`;return e}
if(cls==='src-local'){const fm=text.match(/(categories|products|policies|frameworks|clients)\/[^\s,)]+/);if(fm)return`<span title="Local file: data/answer-bank/${fm[0]}" style="cursor:help;border-bottom:1px dotted var(--gn)">${e}</span>`;return`<span title="Local security answer bank" style="cursor:help">${e}</span>`}
if(cls==='src-policy'){return`<span title="Policy document" style="cursor:help;border-bottom:1px dotted var(--yl)">${e}</span>`}
return e}
function fmtMd(t){
// Split out sources section if present
const showSources=localStorage.getItem(userKey('sq_cfgAutoSources'))!=='false';
let main=t,srcHtml='';
const srcIdx=t.indexOf('---\n**Sources:');
if(srcIdx===-1){const srcIdx2=t.indexOf('**Sources:');if(srcIdx2>-1){main=t.substring(0,srcIdx2);const srcText=t.substring(srcIdx2)
const items=srcText.split('\n').filter(l=>l.startsWith('- ')).map(l=>{const txt=l.substring(2).trim();let cls='src-general';if(/\[Confluence\]/i.test(txt))cls='src-confluence';else if(/\[Local KB\]/i.test(txt))cls='src-local';else if(/\[Jira\]/i.test(txt))cls='src-jira';else if(/\[Policy\]/i.test(txt))cls='src-policy';const clean=txt.replace(/\[.*?\]\s*/,'');const linked=mkSrcLink(cls,clean);return`<li class="${cls}">${linked}</li>`});if(items.length)srcHtml=`<div class="sources-section"><strong>Sources</strong><ul>${items.join('')}</ul></div>`}}else{main=t.substring(0,srcIdx);const srcText=t.substring(srcIdx)
const items=srcText.split('\n').filter(l=>l.startsWith('- ')).map(l=>{const txt=l.substring(2).trim();let cls='src-general';if(/\[Confluence\]/i.test(txt))cls='src-confluence';else if(/\[Local KB\]/i.test(txt))cls='src-local';else if(/\[Jira\]/i.test(txt))cls='src-jira';else if(/\[Policy\]/i.test(txt))cls='src-policy';const clean=txt.replace(/\[.*?\]\s*/,'');const linked=mkSrcLink(cls,clean);return`<li class="${cls}">${linked}</li>`});if(items.length)srcHtml=`<div class="sources-section"><strong>Sources</strong><ul>${items.join('')}</ul></div>`}
return main.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code>$2</code></pre>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/^\|(.+)\|$/gm,m=>{const c=m.split('|').filter(x=>x.trim()!=='');if(c.every(x=>/^[\s-:]+$/.test(x)))return'';return'<tr>'+c.map(x=>`<td>${x.trim()}</td>`).join('')+'</tr>'}).replace(/(<tr>.*<\/tr>\n?)+/g,'<table>$&</table>').replace(/^- (.+)$/gm,'<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g,'<ul>$&</ul>').replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>').replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>').replace(/^/,'<p>').replace(/$/,'</p>').replace(/<p><(h[123]|pre|ul|ol|table|blockquote)/g,'<$1').replace(/<\/(h[123]|pre|ul|ol|table|blockquote)><\/p>/g,'</$1>').replace(/<p><\/p>/g,'')+(showSources?srcHtml:'')}
const dz=document.getElementById('dropZone'),fi=document.getElementById('fileInput');dz.addEventListener('click',()=>fi.click());dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over')});dz.addEventListener('dragleave',()=>dz.classList.remove('over'));dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');if(e.dataTransfer.files.length)hFile(e.dataTransfer.files[0])});fi.addEventListener('change',()=>{if(fi.files.length)hFile(fi.files[0])});
// Global: prevent browser from opening/downloading files dropped outside explicit zones
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
// Migration file box drag-and-drop
const mSBox=document.getElementById('mSB'),mTBox=document.getElementById('mTB');
if(mSBox){mSBox.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();mSBox.classList.add('over')});mSBox.addEventListener('dragleave',()=>mSBox.classList.remove('over'));mSBox.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();mSBox.classList.remove('over');if(e.dataTransfer.files.length)hMF('source',e.dataTransfer.files[0]);});}
if(mTBox){mTBox.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();mTBox.classList.add('over')});mTBox.addEventListener('dragleave',()=>mTBox.classList.remove('over'));mTBox.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();mTBox.classList.remove('over');if(e.dataTransfer.files.length)hMF('target',e.dataTransfer.files[0]);});}
async function hFile(f){const dz=document.getElementById('dropZone');dz.classList.add('uploading');document.getElementById('fileName').textContent='';const fd=new FormData();fd.append('file',f);try{const r=await fetch('/api/upload',{method:'POST',body:fd});const d=await r.json();if(d.error){alert(d.error);return}upFile=d;document.getElementById('fileName').textContent=f.name;shCfg(d)}catch(e){alert(e.message)}finally{dz.classList.remove('uploading')}}
function shCfg(d){document.getElementById('configCard').style.display='block';document.getElementById('fileTypeBadge').innerHTML=`<span class="ftb">${(d.fileType||'').replace('.','').toUpperCase()}</span> ${esc(d.fileName)}`;if(d.type==='spreadsheet'){document.getElementById('spreadsheetConfig').style.display='block';document.getElementById('documentConfig').style.display='none';const s=document.getElementById('sheetSelect');s.innerHTML='';d.sheets.forEach(sh=>{const o=document.createElement('option');o.value=sh.name;o.textContent=`${sh.name} (${sh.rowCount} rows)`;s.appendChild(o)});s.onchange=()=>updCols();updCols()}else{document.getElementById('spreadsheetConfig').style.display='none';document.getElementById('documentConfig').style.display='block';document.getElementById('docPreview').textContent=d.preview||'No preview';if(d.pageCount){document.getElementById('pageCountGroup').style.display='block';document.getElementById('pageCount').value=`${d.pageCount} pages`}}}
function updCols(){const sn=document.getElementById('sheetSelect').value;const sh=upFile.sheets.find(s=>s.name===sn);if(!sh)return;const q=document.getElementById('questionCol'),i=document.getElementById('idCol'),rcInput=document.getElementById('responseCol'),ynInput=document.getElementById('ynCol'),rcList=document.getElementById('responseColList'),ynList=document.getElementById('ynColList');q.innerHTML='';i.innerHTML='';rcList.innerHTML='';ynList.innerHTML='';rcInput.value='';ynInput.value='';const ansColPat=/^(answer|response|reply|vendor.?response|assessment.?response|vendor.?answer|institution.?response)/i;const ynNamePat=/yes.?no|y\/n\b|comply|applicable|certif/i;const ynValPat=/^(yes|no|y|n|na|n\/a)$/i;sh.columns.forEach(c=>{const o1=document.createElement('option');o1.value=c;o1.textContent=c;if(/question|query|requirement|control|description/i.test(c))o1.selected=true;q.appendChild(o1);const o2=document.createElement('option');o2.value=c;o2.textContent=c;if(/id|number|#|ref|index/i.test(c))o2.selected=true;i.appendChild(o2);const o3=document.createElement('option');o3.value=c;rcList.appendChild(o3);if(ansColPat.test(c)&&!rcInput.value)rcInput.value=c;const previewVals=(sh.preview||[]).map(r=>String(r[c]||'').trim()).filter(v=>v.length>0);const isYnByName=ynNamePat.test(c);const isYnByVal=previewVals.length>0&&previewVals.every(v=>ynValPat.test(v));const o4=document.createElement('option');o4.value=c;ynList.appendChild(o4);if((isYnByName||isYnByVal)&&!ynInput.value)ynInput.value=c});const tb=document.getElementById('previewTable');if(!sh.preview.length){tb.innerHTML='<tr><td>No data</td></tr>';return}tb.innerHTML='<thead><tr>'+sh.columns.map(c=>`<th>${esc(c)}</th>`).join('')+'</tr></thead><tbody>'+sh.preview.map(r=>'<tr>'+sh.columns.map(c=>`<td>${esc(String(r[c]||''))}</td>`).join('')+'</tr>').join('')+'</tbody>'}
async function startProc(){if(!window._hasServerApiKey){alert('Set the Claude API key in Admin → Authentication');return}const b=document.getElementById('processBtn');b.disabled=true;b.textContent='Processing...';document.getElementById('configCard').style.display='none';document.getElementById('progressSection').classList.add('vis');document.getElementById('progressLog').innerHTML='';gtAdd('batch','Batch Processing','upload');const bd={filePath:upFile.filePath,fileType:upFile.fileType||'.xlsx',sheetName:document.getElementById('sheetSelect')?.value,questionColumn:document.getElementById('questionCol')?.value,idColumn:document.getElementById('idCol')?.value,responseColumn:document.getElementById('responseCol')?.value||'',yesNoColumn:document.getElementById('ynCol')?.value||'',product:document.getElementById('productSelect')?.value||document.getElementById('docProductSelect')?.value};try{const r=await fetch('/api/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bd)});const d=await r.json();if(d.error){lg('Error: '+d.error);gtError('batch',d.error);b.disabled=false;b.textContent='Process Questionnaire';batchErrReset(d.error);return}const jobId=d.jobId;localStorage.setItem(userKey('sq_active_batch_job'),jobId);pollJob(jobId,'batch',(ev)=>{hPE(ev);if(ev.type==='progress')gtUpdate('batch',ev.percent,ev.step);if(ev.type==='complete'){gtDone('batch');localStorage.removeItem(userKey('sq_active_batch_job'));b.disabled=false;b.textContent='Process Questionnaire'}if(ev.type==='error'){gtError('batch',ev.message);localStorage.removeItem(userKey('sq_active_batch_job'));b.disabled=false;b.textContent='Process Questionnaire';batchErrReset(ev.message)}})}catch(e){lg('Error: '+e.message);gtError('batch',e.message);b.disabled=false;b.textContent='Process Questionnaire';batchErrReset(e.message)}}
function batchErrReset(msg){const log=document.getElementById('progressLog');log.innerHTML+=`<div style="color:var(--rd);font-weight:600;margin-top:6px">&#9888; ${esc(msg||'Unknown error')} — returning to configuration in 4s...</div>`;log.scrollTop=log.scrollHeight;setTimeout(()=>_batchResetUI(),4000)}
function _batchResetUI(){document.getElementById('progressSection').classList.remove('vis');document.getElementById('progressBar').style.width='0%';document.getElementById('progressLog').innerHTML='';document.getElementById('progressLog').dataset.logCount=0;document.getElementById('progressText').textContent='Starting...';document.getElementById('configCard').style.display='block';const b=document.getElementById('processBtn');b.disabled=false;b.textContent='Process Questionnaire'}
function cancelBatch(){const jobId=localStorage.getItem(userKey('sq_active_batch_job'));if(jobId){fetch('/api/jobs/'+jobId,{method:'DELETE'}).catch(()=>{});localStorage.removeItem(userKey('sq_active_batch_job'))}gtError('batch','Cancelled');_batchResetUI()}
async function pollJob(jobId,taskKey,onEvent){const pId=setInterval(async()=>{try{const r=await fetch('/api/jobs/'+jobId);if(!r.ok&&r.status!==404)return;// skip transient errors (429, 5xx), keep polling
const j=await r.json();if(r.status===404){clearInterval(pId);onEvent({type:'error',message:'Job not found'});return}document.getElementById('progressBar').style.width=j.progress+'%';document.getElementById('progressText').textContent=j.step;if(j.logs?.length){const el=document.getElementById('progressLog');const lastShown=parseInt(el.dataset.logCount||0);j.logs.slice(lastShown).forEach(l=>lg(l.msg));el.dataset.logCount=j.logs.length}updateJobsBadge();if(j.status==='complete'){clearInterval(pId);onEvent({type:'complete',...j.result})}else if(j.status==='error'){clearInterval(pId);lg('ERROR: '+j.error);onEvent({type:'error',message:j.error})}}catch{}},3000)}
function hPE(ev){switch(ev.type){case'progress':document.getElementById('progressBar').style.width=ev.percent+'%';document.getElementById('progressText').textContent=ev.step;lg(ev.step);break;case'batch_complete':lg(`Batch ${ev.batchNum}/${ev.totalBatches} done`);break;case'complete':outFN=ev.outputFile;allRes=ev.answers;shRes(ev);lg('Done!');if(document.getElementById('autoSaveBank')?.checked)saveProcToBank();break;case'error':lg('ERROR: '+ev.message);break}}
function lg(m){const el=document.getElementById('progressLog');el.innerHTML+=`<div>[${new Date().toLocaleTimeString()}] ${esc(m)}</div>`;el.scrollTop=el.scrollHeight}
function shRes(d){document.getElementById('resultsSection').classList.add('vis');document.getElementById('statTotal').textContent=d.totalQuestions;document.getElementById('statHigh').textContent=d.highConfidence;document.getElementById('statMedium').textContent=d.mediumConfidence;document.getElementById('statLow').textContent=d.lowConfidence;
/* Show flag summary if any */
const fSum=document.getElementById('flagSummary');if(fSum){const parts=[];if(d.conflicts)parts.push(`<span style="color:var(--rd)">${d.conflicts} conflicting</span>`);if(d.noProductData)parts.push(`<span style="color:#e6a817">${d.noProductData} missing data</span>`);if(d.needsReview)parts.push(`<span style="color:#e6a817">${d.needsReview} needs review</span>`);if(d.crossProduct)parts.push(`<span style="color:#5ba8e6">${d.crossProduct} cross-product</span>`);fSum.innerHTML=parts.length?'Flags: '+parts.join(' · '):'';fSum.style.display=parts.length?'block':'none'}
rRT(d.answers)}
function rRT(a){document.getElementById('resultsBody').innerHTML=a.map((x,i)=>{const fl=(x.flags||[]);const fBadges=fl.map(f=>f==='conflict'?'<span class="badge" style="background:#8b2020;font-size:9px;margin-left:3px">conflict</span>':f==='no-product-data'?'<span class="badge" style="background:#8b6914;font-size:9px;margin-left:3px">no data</span>':f==='needs-review'?'<span class="badge" style="background:#8b6914;font-size:9px;margin-left:3px">review</span>':f==='cross-product'?'<span class="badge" style="background:#2a5e8b;font-size:9px;margin-left:3px">cross-product</span>':'').join('');const rid=String(x.id||'');return`<tr${fl.includes('conflict')?' style="background:rgba(139,32,32,.08)"':fl.includes('no-product-data')?' style="background:rgba(139,105,20,.06)"':''}><td title="${esc(rid)}">${esc(rid)}</td><td title="${esc(x.question||'')}">${esc(x.question||'')}</td><td><textarea class="res-answer" data-id="${esc(rid)}">${esc(x.answer||'')}</textarea></td><td>${esc(x.source||'')}${fBadges}</td><td><span class="badge ${x.confidence}">${x.confidence}</span></td><td><button class="ma-btn sv" data-rowid="${esc(rid)}" data-action="saveRowToBank">Save</button></td></tr>`}).join('')}
async function saveRowToBank(btn){const id=btn.dataset.rowid;const item=allRes.find(a=>String(a.id||'')===id);if(!item)return;const prod=document.getElementById('productSelect')?.value||document.getElementById('docProductSelect')?.value||'';btn.disabled=true;btn.textContent='...';try{const r=await fetch('/api/bank/save-answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:item.question,answer:item.answer,product:prod,source:'Batch result saved from dashboard'})});const d=await r.json();if(d.success){btn.textContent='Saved!';btn.style.color='var(--gn)';setTimeout(()=>{btn.textContent='Save';btn.style.color='';btn.disabled=false},2500)}else{btn.disabled=false;btn.textContent='Save';alert(d.error||'Save failed')}}catch(e){btn.disabled=false;btn.textContent='Save';alert(e.message)}}
function updAnswer(el){const id=el.dataset.id;const item=allRes.find(a=>String(a.id||'')===id);if(item)item.answer=el.value}
function autoGrow(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,160)+'px'}
function fRes(l,b){document.querySelectorAll('#resultsSection .fbtn').forEach(x=>x.classList.remove('on'));b.classList.add('on');rRT(l==='all'?allRes:l==='flagged'?allRes.filter(a=>a.flags&&a.flags.length>0):allRes.filter(a=>a.confidence===l))}
function dlFile(){if(outFN)window.location.href=`/api/download/${outFN}`}
function resetUp(){const jobId=localStorage.getItem(userKey('sq_active_batch_job'));if(jobId){fetch('/api/jobs/'+jobId,{method:'DELETE'}).catch(()=>{});localStorage.removeItem(userKey('sq_active_batch_job'))}upFile=null;outFN='';allRes=[];document.getElementById('fileName').textContent='';document.getElementById('configCard').style.display='none';document.getElementById('progressSection').classList.remove('vis');document.getElementById('resultsSection').classList.remove('vis');document.getElementById('progressBar').style.width='0%';document.getElementById('progressLog').innerHTML='';document.getElementById('fileInput').value='';updateJobsBadge()}
async function ldBatchFw(){try{const r=await fetch('/api/bank/frameworks');const fs=await r.json();const sel=document.getElementById('batchFramework');sel.innerHTML='<option value="">None (Custom)</option>'+fs.map(f=>`<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('');sel._fwData=fs}catch{}}
async function ldMigFw(){try{const r=await fetch('/api/bank/frameworks');const fs=await r.json();const sel=document.getElementById('migFramework');if(!sel)return;sel.innerHTML='<option value="">Any Framework</option>'+fs.map(f=>f.versions.map(v=>`<option value="${esc(f.name+'|'+v)}">${esc(f.name)} — ${esc(v)}</option>`)).flat().join('');sel._fwData=fs}catch{}}
function updBatchVer(){const sel=document.getElementById('batchFramework');const fs=sel._fwData||[];const fw=fs.find(f=>f.name===sel.value);const ver=document.getElementById('batchVersion');ver.innerHTML=fw?(fw.versions||[]).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join(''):'<option value="">—</option>'}
async function saveProcToBank(){if(!allRes||!allRes.length){alert('No results to save');return}const fw=document.getElementById('batchFramework')?.value||'';const ver=document.getElementById('batchVersion')?.value||'';const prod=document.getElementById('productSelect')?.value||document.getElementById('docProductSelect')?.value||'general';const btn=document.getElementById('saveBankBtn');btn.disabled=true;btn.textContent='Saving...';try{const r=await fetch('/api/process/save-to-bank',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers:allRes,framework:fw,version:ver,product:prod,fileName:upFile?.fileName||'batch-process'})});const d=await r.json();if(d.success){btn.textContent='Saved!';btn.style.background='var(--gn)';lg('Saved to bank: '+d.path);setTimeout(()=>{btn.textContent='Save to Bank';btn.disabled=false},3000)}else{alert(d.error||'Save failed');btn.disabled=false;btn.textContent='Save to Bank'}}catch(e){alert(e.message);btn.disabled=false;btn.textContent='Save to Bank'}}
// Ticket list
let allTickets=[],calRefreshTimer=null;
async function ldAssignees(){
try{const r=await fetch('/api/jira/assignees');const names=await r.json();const sel=document.getElementById('calTkAssignee');const cur=sel.value;sel.innerHTML='<option value="">All People</option>'+names.map(n=>`<option value="${esc(n)}"${n===cur?' selected':''}>${esc(n)}</option>`).join('')}catch{}}
async function ldTickets(){
const filter=document.getElementById('calTkFilter').value;
const assignee=document.getElementById('calTkAssignee')?.value||'';
const issueType=document.getElementById('calTkType')?.value||'';
// Filters are read directly from ticket list by calendar (rCal) and board (ldBoard)
document.getElementById('calTkList').innerHTML='<div class="tk-loading"><div class="spin" style="margin:0 auto 8px"></div>Loading tickets...</div>';
try{const r=await fetch(`/api/jira/tickets?status=${filter}&assignee=${encodeURIComponent(assignee)}&issueType=${encodeURIComponent(issueType)}&limit=30`);allTickets=await r.json();rTkList();startCalRefresh();rCal();if(document.getElementById('boardView').style.display!=='none')ldBoard()}catch{document.getElementById('calTkList').innerHTML='<div class="tk-loading">Failed to load</div>'}}
function syncFilter(id,val){const el=document.getElementById(id);if(el&&el.value!==val){el.value=val}}
function startCalRefresh(){if(calRefreshTimer)clearInterval(calRefreshTimer);calRefreshTimer=setInterval(()=>{if(document.getElementById('calendarPanel').classList.contains('on'))silentRefreshTickets()},60000)}
async function silentRefreshTickets(){const filter=document.getElementById('calTkFilter').value;const assignee=document.getElementById('calTkAssignee')?.value||'';const issueType=document.getElementById('calTkType')?.value||'';try{const r=await fetch(`/api/jira/tickets?status=${filter}&assignee=${encodeURIComponent(assignee)}&issueType=${encodeURIComponent(issueType)}&limit=30`);allTickets=await r.json();rTkList();rCal()}catch{}}
let selTk=null;
function rTkList(){
const cntEl=document.getElementById('tkCount');if(cntEl)cntEl.textContent=allTickets.length?`(${allTickets.length})`:'';
document.getElementById('calTkList').innerHTML=allTickets.length?allTickets.map(t=>{
const sc=t.statusCategory==='done'?'done':t.statusCategory==='indeterminate'?'prog':'todo';
return`<div class="tk-item ${selTk===t.key?'active':''}" data-tk-key="${t.key}"><div class="tk-dot ${sc}"></div><div style="min-width:0"><div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:2px"><span class="tk-key">${esc(t.key)}</span><span class="tk-status ${sc}">${esc(t.status)}</span>${t.issueType?`<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:var(--ac3);color:var(--ac);font-weight:600;text-transform:uppercase">${esc(t.issueType)}</span>`:''}</div><div class="tk-sum">${esc(t.summary)}</div><div class="tk-meta"><span>${esc(t.assignee)}</span>${t.duedate?`<span style="color:${t.duedate<new Date().toISOString().slice(0,10)?'var(--rd)':'var(--tx3)'}">${t.duedate}</span>`:`<span>${t.updated?.slice(0,10)||''}</span>`}</div></div></div>`}).join(''):'<div class="tk-loading">No tickets found</div>'}

async function showTkDetail(key){
selTk=key;rTkList();
const dp=document.getElementById('calTkDetail');
dp.style.display='flex';
dp.innerHTML='<div style="padding:40px;text-align:center"><div class="spin" style="margin:0 auto 10px"></div><div style="font-size:11px;color:var(--tx3)">Loading '+esc(key)+'...</div></div>';
try{
const r=await fetch('/api/jira/ticket/'+key);const t=await r.json();
if(t.error){dp.innerHTML='<div style="padding:20px;color:var(--rd);font-size:12px">'+esc(t.error)+'</div>';return}
const sc=t.statusCategory==='done'?'st-done':t.statusCategory==='indeterminate'?'st-prog':'st-todo';
dp.innerHTML=`<div style="position:relative">
<div class="tkd-head">
<button class="tkd-close" data-action="closeTkDetail">&times;</button>
<div class="tkd-key">${esc(t.key)}</div>
<div class="tkd-title">${esc(t.summary)}</div>
<div class="tkd-badges">
<span class="tkd-badge ${sc}">${esc(t.status)}</span>
<span class="tkd-badge pri">${esc(t.priority)}</span>
</div>
</div>
<div class="tkd-body">
<div class="tkd-section">
<div class="tkd-row"><span class="l">Assignee</span><span class="v">${esc(t.assignee)}</span></div>
<div class="tkd-row"><span class="l">Reporter</span><span class="v">${esc(t.reporter)}</span></div>
<div class="tkd-row"><span class="l">Due Date</span><span class="v">${t.duedate||'Not set'}</span></div>
<div class="tkd-row"><span class="l">Created</span><span class="v">${t.created?.slice(0,10)||''}</span></div>
<div class="tkd-row"><span class="l">Updated</span><span class="v">${t.updated?.slice(0,10)||''}</span></div>
</div>
${t.description?`<div class="tkd-section"><div class="tkd-label">Description</div><div class="tkd-desc">${esc(t.description)}</div></div>`:''}
${t.comments?.length?`<div class="tkd-section"><div class="tkd-label">Recent Comments (${t.comments.length})</div>${t.comments.map(c=>`<div class="tkd-comment"><div class="tkd-c-head"><span>${esc(c.author)}</span><span>${c.date}</span></div><div class="tkd-c-body">${esc(c.body)}</div></div>`).join('')}</div>`:''}
</div>
<div class="tkd-foot">
<a class="tkd-btn primary" href="${t.url}" target="_blank">Open in Jira</a>
<button class="tkd-btn sec" data-action="closeTkDetail">Close</button>
</div>
</div>`;
} catch(e) { dp.innerHTML='<div style="padding:20px;color:var(--rd);font-size:12px">'+esc(e.message)+'</div>'; }
}

function closeTkDetail(){selTk=null;rTkList();document.getElementById('calTkDetail').style.display='none'}
function toggleCalMax(){document.body.classList.toggle('cal-max')}

let cY=2026,cM=2,cTk=[];const MNS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function cNav(d){cM+=d;if(cM>12){cM=1;cY++}if(cM<1){cM=12;cY--}ldCal()}
async function ldCal(){const ms=`${cY}-${String(cM).padStart(2,'0')}`;document.getElementById('cML').textContent=`${MNS[cM-1]} ${cY}`;try{const r=await fetch(`/api/jira/calendar?month=${ms}&field=${document.getElementById('calField').value}`);const d=await r.json();cTk=d.tickets||[];rCal()}catch{cTk=[];rCal()}}
function rCal(){const g=document.getElementById('calGrid');const sf=document.getElementById('calTkFilter')?.value||'all';const calAsgn=document.getElementById('calTkAssignee')?.value||'';const calType=document.getElementById('calTkType')?.value||'';const fd=new Date(cY,cM-1,1).getDay();const dm=new Date(cY,cM,0).getDate();const tod=new Date().toISOString().slice(0,10);let h=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=>`<div class="cdh${i===0||i===6?' cdh-we':''}">${d}</div>`).join('');const pd=new Date(cY,cM-1,0).getDate();for(let i=fd-1;i>=0;i--)h+=`<div class="cd om"><div class="cdn">${pd-i}</div></div>`;for(let d=1;d<=dm;d++){const ds=`${cY}-${String(cM).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const dow=new Date(cY,cM-1,d).getDay();let dt=cTk.filter(t=>t.date===ds);if(sf==='open')dt=dt.filter(t=>t.statusCategory!=='done');else if(sf!=='all')dt=dt.filter(t=>t.status===sf);if(calAsgn)dt=dt.filter(t=>t.assignee===calAsgn);if(calType)dt=dt.filter(t=>t.issueType===calType);const isWe=dow===0||dow===6;h+=`<div class="cd ${ds===tod?'tod':''}${isWe?' cd-we':''}"><div class="cdn">${d}</div>`;dt.forEach(t=>{const sc=t.statusCategory==='done'?'sd':t.statusCategory==='indeterminate'?'sp':'st';h+=`<div class="ct ${sc}" data-ticket='${JSON.stringify(t).replace(/'/g,"&apos;")}' title="${esc(t.key+': '+t.summary)}">${esc(t.key)}</div>`});h+='</div>'}const tc=fd+dm;const rm=tc%7===0?0:7-(tc%7);for(let i=1;i<=rm;i++)h+=`<div class="cd om"><div class="cdn">${i}</div></div>`;g.innerHTML=h}
function shTD(t){document.getElementById('cDet').innerHTML=`<h3>${esc(t.key)}: ${esc(t.summary)}</h3><div class="cdr"><span class="ll">Status</span><span>${esc(t.status)}</span></div><div class="cdr"><span class="ll">Assignee</span><span>${esc(t.assignee)}</span></div><div class="cdr"><span class="ll">Priority</span><span>${esc(t.priority)}</span></div><div class="cdr"><span class="ll">Due Date</span><span>${t.duedate||'Not set'}</span></div><div class="cdr"><span class="ll">Created</span><span>${t.created?.slice(0,10)||''}</span></div><a href="https://lmsportal.atlassian.net/browse/${t.key}" target="_blank" style="display:block;text-align:center;margin-top:10px;color:var(--ac);font-size:12px">Open in Jira &rarr;</a><button class="ccl" data-action="closeCalModal">Close</button>`;document.getElementById('cMod').classList.add('vis')}
let iFile=null,iType='',iEnt=[],iCats=[],iFWs=[];const idz=document.getElementById('iDZ'),ifi=document.getElementById('iFI');idz.addEventListener('click',()=>ifi.click());idz.addEventListener('dragover',e=>{e.preventDefault();idz.classList.add('over')});idz.addEventListener('dragleave',()=>idz.classList.remove('over'));idz.addEventListener('drop',e=>{e.preventDefault();idz.classList.remove('over');if(e.dataTransfer.files.length)hIF(e.dataTransfer.files[0])});ifi.addEventListener('change',()=>{if(ifi.files.length)hIF(ifi.files[0])});
async function hIF(f){const dz=document.getElementById('iDZ');dz.classList.add('uploading');const ldtxt=dz.querySelector('.dz-ldtxt');if(ldtxt)ldtxt.textContent=`Uploading ${f.name} (${(f.size/1024).toFixed(0)} KB)...`;document.getElementById('iFN').textContent='';const fd=new FormData();fd.append('file',f);try{const r=await fetch('/api/upload',{method:'POST',body:fd});iFile=await r.json();if(iFile.error){alert(iFile.error);return}document.getElementById('iFN').textContent=f.name;
/* Show file info summary */
const info=document.getElementById('iFileInfo');info.style.display='block';
if(iFile.type==='spreadsheet'&&iFile.sheets?.length>0){const totalRows=iFile.sheets.reduce((s,sh)=>s+sh.rowCount,0);info.innerHTML=`<div style="font-size:11px;color:var(--gn);padding:4px 0">&#x2705; <b>${iFile.sheets.length}</b> sheet(s) detected: ${iFile.sheets.map(s=>'<b>'+esc(s.name)+'</b> ('+s.rowCount+' rows)').join(', ')} &mdash; <b>${totalRows}</b> total rows</div>`}
else if(iFile.text){info.innerHTML=`<div style="font-size:11px;color:var(--gn);padding:4px 0">&#x2705; Document parsed &mdash; ${iFile.text.length.toLocaleString()} characters</div>`}
else{info.innerHTML=`<div style="font-size:11px;color:var(--gn);padding:4px 0">&#x2705; File ready to import</div>`}
document.getElementById('iS2').style.display='block';document.getElementById('iSuc').style.display='none'}catch(e){alert(e.message)}finally{document.getElementById('iDZ').classList.remove('uploading')}}
async function ldImpOpts(){const[ps,fs]=await Promise.all([fetch('/api/products').then(r=>r.json()),fetch('/api/bank/frameworks').then(r=>r.json())]);iFWs=fs;document.getElementById('iProd').innerHTML=ps.map(p=>`<option value="${p}">${p}</option>`).join('');const fw=document.getElementById('iFW');fw.innerHTML=fs.map(f=>`<option value="${f.name}">${f.name}</option>`).join('');fw.onchange=()=>{const f=fs.find(x=>x.name===fw.value);document.getElementById('iVer').innerHTML=(f?.versions||[]).map(v=>`<option value="${v}">${v}</option>`).join('')};if(fs.length)fw.dispatchEvent(new Event('change'))}
function sIT(t,b){iType=t;document.querySelectorAll('.itb').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');document.getElementById('iSS').style.display='block';document.getElementById('iPG').style.display=['product-override','framework','category'].includes(t)?'block':'none';const iPGLabel=document.querySelector('#iPG label');if(iPGLabel)iPGLabel.textContent=t==='category'?'Product (optional)':'Product';document.getElementById('iFG').style.display=t==='framework'?'block':'none';document.getElementById('iVG').style.display=t==='framework'?'block':'none'}
function resetImp(){iFile=null;iType='';document.getElementById('iFN').textContent='';document.getElementById('iFileInfo').style.display='none';document.getElementById('iS2').style.display='none';document.getElementById('iSS').style.display='none';document.getElementById('iProgress').style.display='none';document.getElementById('iSuc').style.display='none';document.querySelectorAll('.itb').forEach(x=>x.classList.remove('sel'));document.getElementById('iFI').value=''}
async function subImpFile(){if(!iType){alert('Select a destination type');return}if(!iFile?.filePath){alert('Upload a file first');return}
const selProd=document.getElementById('iProd')?.value||'';
const selFW=document.getElementById('iFW')?.value||'';
const selVer=document.getElementById('iVer')?.value||'';
if(iType==='product-override'&&!selProd){alert('Please select a product');return}
/* Show import progress overlay */
const impLabel=iType==='product-override'?'Import → '+selProd:iType==='framework'?'Import → '+selFW:'Import → Answer Bank';
gtAdd('import',impLabel,'import');
const iS2=document.getElementById('iS2');const iProg=document.getElementById('iProgress');
document.getElementById('iSS').style.display='none';
iProg.style.display='block';iProg.innerHTML='<div class="imp-loading"><div class="imp-spin"></div><div class="imp-lt">Importing file to answer bank...</div><div class="imp-pb"><div class="imp-pf" id="impBar"></div></div><div class="imp-ps" id="impStatus">Preparing upload...</div></div>';
/* Animate progress bar */
const bar=document.getElementById('impBar');const status=document.getElementById('impStatus');
let pct=0;const pInt=setInterval(()=>{if(pct<90){pct+=Math.random()*15;if(pct>90)pct=90;bar.style.width=pct+'%';gtUpdate('import',pct);if(pct>20)status.textContent='Copying file to destination...';if(pct>50)status.textContent='Saving to answer bank...';if(pct>75)status.textContent='Finalizing...'}},300);
try{const r=await fetch('/api/bank/import-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:iType,product:selProd,framework:selFW,version:selVer,filePath:iFile.filePath,fileName:iFile.fileName||'unknown'})});const d=await r.json();clearInterval(pInt);
if(d.success){bar.style.width='100%';status.textContent='Complete!';gtDone('import');
setTimeout(()=>{iProg.style.display='none';document.getElementById('iSuc').style.display='block';document.getElementById('iSuc').innerHTML=`<div class="isuc"><div style="font-size:32px;margin-bottom:10px">&#x2705;</div><div style="font-weight:600;font-size:15px;margin-bottom:6px">File imported successfully</div><div style="font-size:12px;color:var(--tx2);margin-bottom:4px">Saved to: <span style="color:var(--ac)">${esc(d.path)}</span></div><div style="font-size:11px;color:var(--tx3);margin-bottom:14px">${iFile.fileName||'File'} &rarr; Answer Bank</div><button class="bb sec" style="margin-top:4px" data-action="resetImp">Import Another</button></div>`;document.getElementById('iFileInfo').style.display='none';iS2.style.display='none'},600)}
else{clearInterval(pInt);gtError('import',d.error||'Unknown error');iProg.innerHTML=`<div class="imp-loading" style="border-color:var(--rd)"><div style="font-size:24px;margin-bottom:8px">&#x274C;</div><div style="color:var(--rd);font-weight:600;margin-bottom:4px">Import failed</div><div style="font-size:12px;color:var(--tx2)">${esc(d.error||'Unknown error')}</div><button class="bb sec" style="margin-top:12px" data-action="resetImp">Try Again</button></div>`}}
catch(e){clearInterval(pInt);gtError('import',e.message);iProg.innerHTML=`<div class="imp-loading" style="border-color:var(--rd)"><div style="font-size:24px;margin-bottom:8px">&#x274C;</div><div style="color:var(--rd);font-weight:600;margin-bottom:4px">Import failed</div><div style="font-size:12px;color:var(--tx2)">${esc(e.message)}</div><button class="bb sec" style="margin-top:12px" data-action="resetImp">Try Again</button></div>`}}
let mSF=null,mTF=null,mMaps=[],mSessionId=null;
async function hMF(t,f){if(!f)return;const box=document.getElementById(t==='source'?'mSB':'mTB');box.classList.add('uploading');document.getElementById(t==='source'?'mSN':'mTN').textContent='Uploading...';document.getElementById(t==='source'?'mSC':'mTC').textContent='';const fd=new FormData();fd.append('file',f);try{const r=await fetch('/api/upload',{method:'POST',body:fd});const d=await r.json();if(d.error){alert(d.error);document.getElementById(t==='source'?'mSN':'mTN').textContent='Select '+(t==='source'?'source':'target')+' file';return}box.classList.remove('uploading');box.classList.add('ld');document.getElementById(t==='source'?'mSN':'mTN').textContent=f.name;const tr=d.sheets?.reduce((s,x)=>s+x.rowCount,0)||0;document.getElementById(t==='source'?'mSC':'mTC').textContent=`${tr} rows`;if(t==='source')mSF=f;else mTF=f;document.getElementById('migBtn').disabled=!(mSF&&mTF)}catch(e){alert(e.message);document.getElementById(t==='source'?'mSN':'mTN').textContent='Select '+(t==='source'?'source':'target')+' file'}finally{box.classList.remove('uploading')}}
async function startMig(){if(!window._hasServerApiKey){alert('Set the Claude API key in Admin → Authentication');return}if(!mSF||!mTF){alert('Please select both source and target files.');return}const b=document.getElementById('migBtn');b.disabled=true;b.classList.add('running');b.textContent='Migrating...';document.getElementById('migForm').style.display='none';const prg=document.getElementById('migPrg');prg.classList.add('vis');document.getElementById('migRes').style.display='none';setTimeout(()=>prg.scrollIntoView({behavior:'smooth',block:'nearest'}),100);gtAdd('migrate','HECVAT Migration','migrate');const fd=new FormData();fd.append('sourceFile',mSF);fd.append('targetFile',mTF);try{const r=await fetch('/api/migrate',{method:'POST',body:fd});const d=await r.json();if(d.error){alert(d.error);gtError('migrate',d.error);b.disabled=false;b.classList.remove('running');b.textContent='Start Migration';return}const jobId=d.jobId;localStorage.setItem(userKey('sq_active_mig_job'),jobId);const pInt=setInterval(async()=>{try{const jr=await fetch('/api/jobs/'+jobId);const j=await jr.json();if(j.error){clearInterval(pInt);alert(j.error);gtError('migrate',j.error);b.disabled=false;b.classList.remove('running');b.textContent='Start Migration';localStorage.removeItem(userKey('sq_active_mig_job'));return}document.getElementById('migBar').style.width=j.progress+'%';document.getElementById('migPT').textContent=j.step;updateJobsBadge();if(j.status==='complete'){clearInterval(pInt);mMaps=j.result.mappings;mSessionId=j.result.sessionId||null;shMR(j.result);gtDone('migrate');b.disabled=false;b.classList.remove('running');b.textContent='Start Migration';localStorage.removeItem(userKey('sq_active_mig_job'))}else if(j.status==='error'){clearInterval(pInt);alert(j.error);gtError('migrate',j.error);b.disabled=false;b.classList.remove('running');b.textContent='Start Migration';localStorage.removeItem(userKey('sq_active_mig_job'))}}catch{}},2000)}catch(e){alert(e.message);gtError('migrate',e.message);b.disabled=false;b.classList.remove('running');b.textContent='Start Migration'}}
function shMR(d){document.getElementById('migForm').style.display='none';document.getElementById('migPrg').classList.remove('vis');const _mr=document.getElementById('migRes');_mr.style.display='block';_mr.classList.remove('anim');void _mr.offsetWidth;_mr.classList.add('anim');document.getElementById('migT').textContent=d.targetCount;document.getElementById('migH').textContent=d.mappings.filter(m=>m.matchConfidence==='high').length;document.getElementById('migM').textContent=d.mappings.filter(m=>m.matchConfidence==='medium').length;document.getElementById('migL').textContent=d.mappings.filter(m=>m.matchConfidence==='low'||m.matchConfidence==='none').length;rMM(d.mappings)}
function rMM(ms){document.getElementById('mMap').innerHTML=`<div class="mmr hd"><div>ID</div><div>Target Question</div><div>Match</div><div>Answer</div></div>`+ms.map(m=>`<div class="mmr"><div style="font-weight:600;font-size:10px">${esc(m.targetId||'')}</div><div><div class="mq">${esc(m.targetQuestion||'')}</div>${m.sourceId?`<div style="font-size:9px;color:var(--tx3);margin-top:2px">From: [${esc(m.sourceId)}]</div>`:''}</div><div><span class="badge ${m.matchConfidence}">${m.matchConfidence}</span></div><div>${m.migratedAnswer?`<div class="maa">${esc(m.migratedAnswer.substring(0,180))}${m.migratedAnswer.length>180?'...':''}</div>`:'<span style="color:var(--tx3);font-size:10px">No answer</span>'}${m.notes?`<div style="font-size:9px;color:var(--tx3);margin-top:1px">${esc(m.notes)}</div>`:''}</div></div>`).join('')}
function fMig(l,b){document.querySelectorAll('#migRes .fbtn').forEach(x=>x.classList.remove('on'));b.classList.add('on');rMM(l==='all'?mMaps:mMaps.filter(m=>m.matchConfidence===l))}
function resetMig(){const jobId=localStorage.getItem(userKey('sq_active_mig_job'));if(jobId){fetch('/api/jobs/'+jobId,{method:'DELETE'}).catch(()=>{});localStorage.removeItem(userKey('sq_active_mig_job'))}mSF=null;mTF=null;mMaps=[];mSessionId=null;const sb=document.getElementById('mSB'),tb=document.getElementById('mTB');sb.classList.remove('ld','over');tb.classList.remove('ld','over');document.getElementById('mSN').textContent='Select source file';document.getElementById('mSC').textContent='';document.getElementById('mTN').textContent='Select target file';document.getElementById('mTC').textContent='';document.getElementById('mSI').value='';document.getElementById('mTI').value='';const btn=document.getElementById('migBtn');btn.disabled=true;btn.textContent='Start Migration';btn.classList.remove('running');document.getElementById('migPrg').classList.remove('vis');const mr=document.getElementById('migRes');mr.style.display='none';mr.classList.remove('anim');document.getElementById('migBar').style.width='0%';document.getElementById('migPT').textContent='Starting...';document.getElementById('migForm').style.display='';}
async function expMig(){try{const r=await fetch('/api/migrate/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mappings:mMaps,sessionId:mSessionId})});const d=await r.json();if(d.success){window.location.href=`/api/download/${d.file}`;setTimeout(resetMig,1500);}else alert(d.error||'')}catch(e){alert(e.message)}}
// Calendar/Board view toggle
function swCalView(view,btn){
document.querySelectorAll('#calendarPanel .tabs button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');
if(view==='calendar'){document.getElementById('calendarView').style.display='block';document.getElementById('boardView').style.display='none';document.getElementById('calNavArea').style.display='flex'}
else{document.getElementById('calendarView').style.display='none';document.getElementById('boardView').style.display='block';document.getElementById('calNavArea').style.display='none';ldBoard()}}

// Kanban board
async function ldBoard(){
const assignee=document.getElementById('calTkAssignee')?.value||'';
const issueType=document.getElementById('calTkType')?.value||'';
const status=document.getElementById('calTkFilter')?.value||'all';
const colIds=['kbBacklog','kbAssigned','kbInprogress','kbDone'];
colIds.forEach(id=>{document.getElementById(id).innerHTML='<div style="padding:12px;text-align:center;color:var(--tx3);font-size:10px"><div class="spin" style="margin:0 auto 6px"></div>Loading...</div>'});
try{const r=await fetch(`/api/jira/board?assignee=${encodeURIComponent(assignee)}&issueType=${encodeURIComponent(issueType)}&status=${encodeURIComponent(status)}`);const d=await r.json();
const colData={kbBacklog:d.backlog||[],kbAssigned:d.assigned||[],kbInprogress:d.inprogress||[],kbDone:d.done||[]};
document.getElementById('kbCntBl').textContent=colData.kbBacklog.length;
document.getElementById('kbCntAs').textContent=colData.kbAssigned.length;
document.getElementById('kbCntIp').textContent=colData.kbInprogress.length;
document.getElementById('kbCntDn').textContent=colData.kbDone.length;
let visCount=0;
const alwaysShow=['kbBacklog'];
colIds.forEach(id=>{const col=document.getElementById(id).closest('.kb-col');const hasTickets=colData[id].length>0;const keep=hasTickets||alwaysShow.includes(id);col.style.display=keep?'':'none';if(keep)visCount++;rKbCol(id,colData[id])});
const kanban=document.getElementById('kanban');
if(visCount===0){kanban.style.gridTemplateColumns='1fr';kanban.innerHTML='<div style="padding:40px;text-align:center;color:var(--tx3);font-size:12px">No tickets match the current filters</div>'}
else{kanban.style.gridTemplateColumns=`repeat(${visCount},1fr)`}}catch{}}
function rKbCol(id,tickets){
const el=document.getElementById(id);
if(!tickets.length){el.innerHTML='<div style="padding:16px;text-align:center;color:var(--tx3);font-size:10px">No tickets</div>';return}
el.innerHTML=tickets.map(t=>{
const today=new Date().toISOString().slice(0,10);
const overdue=t.duedate&&t.duedate<today;
return`<div class="kb-card" data-tk-key="${t.key}">
<div class="kb-card-title">${esc(t.summary)}</div>
<div class="kb-card-labels">${t.issueType?`<span class="kb-card-label" style="background:rgba(200,168,50,.12);color:var(--yl)">${esc(t.issueType)}</span>`:''}${t.labels.map(l=>`<span class="kb-card-label">${esc(l)}</span>`).join('')}</div>
${t.duedate?`<div class="kb-card-due ${overdue?'overdue':''}">${overdue?'&#9888; ':''}${t.duedate}</div>`:''}
<div class="kb-card-bottom">
<span class="kb-card-key">${esc(t.key)}</span>
<div style="display:flex;align-items:center;gap:4px">
<span class="kb-card-pri">${esc(t.priority)}</span>
<div class="kb-card-avatar">${t.assigneeInitials}</div>
</div></div></div>`}).join('')}

// Theme
function setTheme(mode,btn){
document.body.classList.add('theme-switching');setTimeout(()=>document.body.classList.remove('theme-switching'),500);
localStorage.setItem('sq_theme',mode);
document.querySelectorAll('.theme-toggle button').forEach(b=>b.classList.remove('active'));
if(btn)btn.classList.add('active');
if(mode==='system'){const dk=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.className=dk?'':'light'}
else if(mode==='light')document.documentElement.className='light';
else document.documentElement.className=''}
(function(){const t=localStorage.getItem('sq_theme')||'dark';const btn=document.getElementById(t==='light'?'thLight':'thDark');setTheme(t,btn);
  // --- histBody: hitem click (loadConv) and hitem-del click (delConv) ---
  var histBody = document.getElementById('histBody');
  if (histBody) {
    histBody.addEventListener('click', function(e) {
      var delBtn = e.target.closest('[data-del-conv]');
      if (delBtn) { e.stopPropagation(); delConv(delBtn.dataset.delConv, e); return; }
      var item = e.target.closest('[data-load-conv]');
      if (item) loadConv(item.dataset.loadConv);
    });
  }

  // --- chMsg: handle data-action="cpMsg" / data-action="openSave" ---
  // (supplement the existing delegation already on chMsg above)

  // --- calTkDetail: close button delegation ---
  var calTkDetail = document.getElementById('calTkDetail');
  if (calTkDetail) {
    calTkDetail.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="closeTkDetail"]');
      if (btn) closeTkDetail();
    });
  }

  // --- resultsBody: saveRowToBank delegation (supplement existing handler) ---
  // Already handled via data-action="saveRowToBank" in resultsBody delegation above
  // but the original used btn directly; now btn has data-rowid so we need to update
  if (resultsBody) {
    resultsBody.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="saveRowToBank"]');
      if (btn) saveRowToBank(btn);
    });
  }

  // --- chMsg: data-action buttons delegation ---
  if (chMsg) {
    chMsg.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="cpMsg"]');
      if (btn) { cpMsg(btn); return; }
      var svBtn = e.target.closest('[data-action="openSave"]');
      if (svBtn) { openSave(svBtn); return; }
    });
  }

})();

// Populate all Jira dropdowns
async function ldIssueTypes(){try{const r=await fetch('/api/jira/issuetypes');const types=await r.json();['calTkType'].forEach(id=>{const sel=document.getElementById(id);if(!sel)return;const cur=sel.value;sel.innerHTML='<option value="">All Types</option>'+types.map(t=>`<option value="${esc(t)}"${t===cur?' selected':''}>${esc(t)}</option>`).join('')})}catch{}}
async function ldStatuses(){try{const r=await fetch('/api/jira/statuses');const statuses=await r.json();const sel=document.getElementById('calTkFilter');const cur=sel.value;sel.innerHTML='<option value="all"'+(cur==='all'?' selected':'')+'>All Statuses</option>'+statuses.map(s=>`<option value="${esc(s.name)}"${s.name===cur?' selected':''}>${esc(s.name)}</option>`).join('')}catch{}}

// Save to bank
function openSave(btn){
const msgEl=btn.closest('.msg');const raw=msgEl?.dataset?.raw||'';
// Find previous user message as the question
let question='';const msgs=document.querySelectorAll('.msg');for(let i=0;i<msgs.length;i++){if(msgs[i]===msgEl&&i>0&&msgs[i-1].dataset.role==='user'){question=msgs[i-1].dataset.raw||'';break}}
// Strip sources from answer
let answer=raw.replace(/---\n\*\*Sources:[\s\S]*$/,'').replace(/\*\*Sources:[\s\S]*$/,'').trim();
document.getElementById('saveQ').value=question;document.getElementById('saveA').value=answer;
// Populate category dropdown with "Add new…" option
const catSel=document.getElementById('saveCat');const catNew=document.getElementById('saveCatNew');
fetch('/api/bank/categories').then(r=>r.json()).then(cats=>{catSel.innerHTML=cats.map(c=>`<option value="${c.name}">${c.name}</option>`).join('')+'<option value="__new__">＋ Add new category…</option>'});
catSel.onchange=()=>{if(catSel.value==='__new__'){catNew.style.display='block';catNew.focus()}else{catNew.style.display='none';catNew.value=''}};
catNew.style.display='none';catNew.value='';
// Populate product dropdown from API
const pSel=document.getElementById('saveProd');
fetch('/api/products').then(r=>r.json()).then(ps=>{pSel.innerHTML='<option value="">Org-wide (all products)</option>'+ps.map(p=>`<option value="${p}">${pLabel(p)}</option>`).join('');pSel.value=document.getElementById('chatProduct').value||''});
document.getElementById('saveRes').style.display='none';document.getElementById('saveModal').classList.add('vis')}
async function doSaveAnswer(){
const q=document.getElementById('saveQ').value.trim();const a=document.getElementById('saveA').value.trim();
const catSel=document.getElementById('saveCat');const catNew=document.getElementById('saveCatNew');
let category=catSel.value==='__new__'?catNew.value.trim().toLowerCase().replace(/\s+/g,'-'):catSel.value;
if(!q||!a){alert('Both question and answer required');return}
if(catSel.value==='__new__'&&!category){alert('Please enter a name for the new category');return}
try{const r=await fetch('/api/bank/save-answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,answer:a,category,product:document.getElementById('saveProd').value,source:'Chat correction via dashboard'})});
const d=await r.json();const res=document.getElementById('saveRes');res.style.display='block';
if(d.success){res.className='save-res ok';res.textContent=`Saved to ${d.path}`;setTimeout(()=>document.getElementById('saveModal').classList.remove('vis'),2000)}
else{res.className='save-res err';res.textContent=d.error||'Failed'}}catch(e){const res=document.getElementById('saveRes');res.style.display='block';res.className='save-res err';res.textContent=e.message}}

function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

// --- Admin Settings ---
function swAdminTab(tab,btn){document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('on'));btn.classList.add('on');document.querySelectorAll('.admin-section').forEach(s=>s.classList.remove('on'));const sectionId={knowledge:'adminKnowledge',status:'adminStatus',bank:'adminBank',quality:'adminQuality',products:'adminProducts',frameworks:'adminFrameworks',logs:'adminLogs',users:'adminUsers'}[tab];if(sectionId){const el=document.getElementById(sectionId);if(el)el.classList.add('on')}if(tab==='products')renderProductList();if(tab==='frameworks')renderFWList();if(tab==='status')checkSystemStatus();if(tab==='bank')refreshBankStats();if(tab==='logs')loadLogs();if(tab==='users')loadUsers()}
const _logTypeCls={auth:'badge',chat:'badge',batch:'badge',upload:'badge',download:'badge',bank:'badge',admin:'badge'};
const _logTypeColor={auth:'#5ba8e6',chat:'var(--ac)',batch:'var(--yl)',upload:'#8b6ed4',download:'#5ba8e6',bank:'var(--gn)',admin:'var(--rd)'};
async function loadLogs(){const type=document.getElementById('logTypeFilter')?.value||'all';const search=document.getElementById('logSearch')?.value||'';try{const r=await fetch(`/api/activity-logs?type=${encodeURIComponent(type)}&search=${encodeURIComponent(search)}&limit=500`);const d=await r.json();const cnt=document.getElementById('logCount');if(cnt)cnt.textContent=`Showing ${d.logs.length} of ${d.total} entries`;const tb=document.getElementById('logsBody');if(!tb)return;if(!d.logs.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--tx3)">No logs found</td></tr>';return}tb.innerHTML=d.logs.map(l=>{const t=new Date(l.timestamp).toLocaleString();const col=_logTypeColor[l.type]||'var(--tx3)';const sc=l.status==='error'||l.status==='failed'?'var(--rd)':l.status==='success'?'var(--gn)':'var(--tx3)';const details=Object.entries(l).filter(([k])=>!['id','timestamp','type','action','ip','status'].includes(k)).map(([k,v])=>`${k}: ${v}`).join(' | ');return`<tr><td style="font-size:10px;color:var(--tx3);white-space:nowrap">${esc(t)}</td><td><span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${col}22;color:${col};font-weight:600;text-transform:uppercase">${esc(l.type||'')}</span></td><td style="font-size:11px">${esc(l.action||'')}</td><td style="font-size:10px;color:var(--tx3)">${esc(l.ip||'')}</td><td style="font-size:10px;color:${sc};font-weight:600">${esc(l.status||'')}</td><td style="font-size:10px;color:var(--tx2)">${esc(details)}</td></tr>`}).join('')}catch(e){const tb=document.getElementById('logsBody');if(tb)tb.innerHTML=`<tr><td colspan="6" style="color:var(--rd)">${esc(e.message)}</td></tr>`}}
function exportLogs(){const type=document.getElementById('logTypeFilter')?.value||'all';const search=document.getElementById('logSearch')?.value||'';window.location.href=`/api/activity-logs/export?type=${encodeURIComponent(type)}&search=${encodeURIComponent(search)}`}
async function clearLogs(){if(!confirm('Clear all activity logs? This cannot be undone.'))return;try{await fetch('/api/activity-logs',{method:'DELETE'});loadLogs()}catch(e){alert(e.message)}}

// --- User Management ---
async function loadUsers() {
  const tbody = document.getElementById('usersBody');
  if (!tbody) return;
  try {
    const r = await fetch('/api/users');
    if (r.status === 401) { showLogin(); return; }
    if (r.status === 403) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--tx3)">Admin access required</td></tr>'; return; }
    const users = await r.json();
    if (!users.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--tx3)">No users yet</td></tr>'; return; }
    tbody.innerHTML = users.map(u => {
      const isSelf = _currentUser && _currentUser.username === u.username;
      const roleColor = u.role === 'admin' ? 'var(--ac)' : 'var(--tx2)';
      const adminBadge = u.canAccessAdmin
        ? `<span style="font-size:10px;padding:2px 7px;border-radius:3px;background:var(--gn)22;color:var(--gn);font-weight:600">Yes</span>`
        : `<span style="font-size:10px;padding:2px 7px;border-radius:3px;background:var(--tx3)22;color:var(--tx3)">No</span>`;
      return `<tr>
        <td style="font-weight:500">${esc(u.username)}${isSelf ? ' <span style="font-size:9px;color:var(--tx3)">(you)</span>' : ''}</td>
        <td><span style="font-size:10px;font-weight:600;color:${roleColor};text-transform:uppercase">${esc(u.role)}</span></td>
        <td>${adminBadge}</td>
        <td style="font-size:10px;color:var(--tx3)">${u.createdAt ? u.createdAt.slice(0,10) : ''}</td>
        <td style="white-space:nowrap">
          <button class="bb sec" data-action="edit-user" data-id="${u.id}" data-username="${esc(u.username)}" data-role="${u.role}" data-canadmin="${u.canAccessAdmin}" style="font-size:10px;padding:3px 9px;margin-right:4px">Edit</button>
          ${!isSelf ? `<button class="bb" data-action="delete-user" data-id="${u.id}" data-username="${esc(u.username)}" style="font-size:10px;padding:3px 9px;background:var(--rd);border-color:var(--rd)">Delete</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  } catch(e) { tbody.innerHTML = `<tr><td colspan="5" style="color:var(--rd)">${esc(e.message)}</td></tr>`; }
}

async function createUser() {
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;
  const canAccessAdmin = document.getElementById('newCanAdmin').checked;
  const res = document.getElementById('createUserResult');
  res.style.display = 'none';
  if (!username) { res.style.display='block'; res.style.background='var(--rd)22'; res.style.color='var(--rd)'; res.textContent='Username is required'; return; }
  if (!password) { res.style.display='block'; res.style.background='var(--rd)22'; res.style.color='var(--rd)'; res.textContent='Password is required'; return; }
  if (password.length < 8) { res.style.display='block'; res.style.background='var(--rd)22'; res.style.color='var(--rd)'; res.textContent='Password must be at least 8 characters'; return; }
  try {
    const r = await fetch('/api/users', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username, password, role, canAccessAdmin})});
    const d = await r.json();
    res.style.display = 'block';
    if (r.ok) {
      res.style.background = 'var(--gn)22'; res.style.color = 'var(--gn)';
      res.textContent = `User "${d.user.username}" created successfully`;
      document.getElementById('newUsername').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('newRole').value = 'user';
      document.getElementById('newCanAdmin').checked = false;
      loadUsers();
    } else { res.style.background = 'var(--rd)22'; res.style.color = 'var(--rd)'; res.textContent = d.error || 'Failed to create user'; }
  } catch(e) { res.style.display='block'; res.style.background='var(--rd)22'; res.style.color='var(--rd)'; res.textContent=e.message; }
}

function openEditUser(id, username, role, canAccessAdmin) {
  document.getElementById('editUserId').value = id;
  document.getElementById('editUserName').textContent = username;
  document.getElementById('editRole').value = role;
  document.getElementById('editCanAdmin').checked = !!canAccessAdmin;
  document.getElementById('editPassword').value = '';
  document.getElementById('editUserResult').style.display = 'none';
  var wrap = document.getElementById('editCanAdminWrap');
  if (wrap) wrap.style.display = role === 'admin' ? 'block' : 'none';
  document.getElementById('editUserModal').style.display = 'flex';
  document.getElementById('editRole').onchange = function() {
    var w = document.getElementById('editCanAdminWrap');
    if (this.value === 'admin') {
      document.getElementById('editCanAdmin').checked = true;
      if (w) w.style.display = 'block';
    } else {
      document.getElementById('editCanAdmin').checked = false;
      if (w) w.style.display = 'none';
    }
  };
}

async function saveEditUser() {
  const id = document.getElementById('editUserId').value;
  const role = document.getElementById('editRole').value;
  const canAccessAdmin = document.getElementById('editCanAdmin').checked;
  const password = document.getElementById('editPassword').value;
  const res = document.getElementById('editUserResult');
  res.style.display = 'none';
  const body = {role, canAccessAdmin};
  if (password) body.password = password;
  try {
    const r = await fetch(`/api/users/${id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const d = await r.json();
    res.style.display = 'block';
    if (r.ok) {
      res.style.background = 'var(--gn)22'; res.style.color = 'var(--gn)'; res.textContent = 'Saved successfully';
      setTimeout(() => { document.getElementById('editUserModal').style.display='none'; loadUsers(); }, 900);
    } else { res.style.background = 'var(--rd)22'; res.style.color = 'var(--rd)'; res.textContent = d.error || 'Failed to update'; }
  } catch(e) { res.style.display='block'; res.style.background='var(--rd)22'; res.style.color='var(--rd)'; res.textContent=e.message; }
}

async function deleteUser(id, username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  try {
    const r = await fetch(`/api/users/${id}`, {method:'DELETE'});
    const d = await r.json();
    if (r.ok) loadUsers();
    else alert(d.error || 'Failed to delete user');
  } catch(e) { alert(e.message); }
}

async function loadAdminSettings(){
// Load AI model
const m=localStorage.getItem(userKey('sq_model'))||'claude-opus-4-20250514';
const modSel=document.getElementById('cfgAIModel');if(modSel)modSel.value=m;
// Confidence threshold
const thr=document.getElementById('cfgConfThreshold');if(thr){thr.value=localStorage.getItem(userKey('sq_conf_threshold'))||'60';document.getElementById('cfgConfThreshVal').textContent=thr.value+'%';thr.oninput=()=>{document.getElementById('cfgConfThreshVal').textContent=thr.value+'%';localStorage.setItem(userKey('sq_conf_threshold'),thr.value)}}
// Checkboxes — load saved state
['cfgAutoSources','cfgSearchConf','cfgSearchJira'].forEach(id=>{const cb=document.getElementById(id);if(!cb)return;const saved=localStorage.getItem(userKey('sq_'+id));if(saved!==null)cb.checked=saved==='true';cb.onchange=()=>localStorage.setItem(userKey('sq_'+id),cb.checked)});
// Atlassian fields — restore from localStorage
const atlUrl=document.getElementById('cfgAtlUrl');if(atlUrl){const sv=localStorage.getItem(userKey('sq_atl_url'));if(sv)atlUrl.value=sv}
const atlEmail=document.getElementById('cfgAtlEmail');if(atlEmail){const sv=localStorage.getItem(userKey('sq_atl_email'));if(sv)atlEmail.value=sv}
const atlProject=document.getElementById('cfgAtlProject');if(atlProject){const sv=localStorage.getItem(userKey('sq_jira_project'));if(sv)atlProject.value=sv}
// Bank stats
refreshBankStats();
// System status
checkSystemStatus();
}


async function saveAtlassianConfig(){const url=document.getElementById('cfgAtlUrl').value.trim();const email=document.getElementById('cfgAtlEmail').value.trim();const token=document.getElementById('cfgAtlToken').value.trim();const project=document.getElementById('cfgAtlProject').value.trim();const res=document.getElementById('cfgAtlResult');
if(!url||!email){res.style.display='flex';res.className='admin-result err';res.textContent='Instance URL and email are required';return}
localStorage.setItem(userKey('sq_atl_url'),url);localStorage.setItem(userKey('sq_atl_email'),email);localStorage.setItem(userKey('sq_jira_project'),project||'ISC');
if(!token){res.style.display='flex';res.className='admin-result warn';res.textContent='Enter API token to save new credentials';return}
res.style.display='flex';res.className='admin-result warn';res.textContent='Authenticating...';
try{const r=await fetch('/api/atlassian/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base:url,email,token,project:project||'ISC'})});const d=await r.json();if(r.ok){res.className='admin-result ok';res.textContent=d.message||'Connected successfully';document.getElementById('cfgAtlToken').value='';document.getElementById('cfgAtlToken').placeholder='API token saved — only enter to change';if(d.project)document.getElementById('sysProject').textContent=d.project;localStorage.setItem(userKey('sq_jira_project'),d.project||project);checkSystemStatus()}else{res.className='admin-result err';res.textContent=d.error||'Authentication failed'}}catch(e){res.className='admin-result err';res.textContent=e.message}}

function toggleJiraSettings(){const panel=document.getElementById('jiraSettingsPanel');const chevron=document.getElementById('jiraSettingsChevron');if(!panel)return;const open=panel.style.display==='none'||panel.style.display==='';panel.style.display=open?'block':'none';if(chevron)chevron.style.transform=open?'rotate(180deg)':'';if(open){const isAdmin=_currentUser&&_currentUser.role==='admin';const adminForm=document.getElementById('jiraAdminForm');const userView=document.getElementById('jiraUserView');if(adminForm)adminForm.style.display=isAdmin?'none':'';if(userView)userView.style.display=isAdmin?'':'none';if(!isAdmin)loadJiraSettingsFields()}}
document.addEventListener('DOMContentLoaded',function(){const bar=document.getElementById('jiraSettingsBar');if(bar){const hdr=bar.querySelector('[data-jira-toggle]')||bar.firstElementChild;if(hdr)hdr.addEventListener('click',toggleJiraSettings)}});
function loadJiraSettingsFields(){const url=localStorage.getItem(userKey('sq_atl_url'))||'';const email=localStorage.getItem(userKey('sq_atl_email'))||'';const project=localStorage.getItem(userKey('sq_jira_project'))||'ISC';const u=document.getElementById('jiraUrl');const e=document.getElementById('jiraEmail');const p=document.getElementById('jiraProject');if(u&&!u.value)u.value=url;if(e&&!e.value)e.value=email;if(p&&!p.value)p.value=project}
function updateJiraConnBadge(ok,label){const b=document.getElementById('jiraConnBadge');if(!b)return;b.textContent=label||(ok?'Connected':'Not configured');b.style.background=ok?'var(--gn)22':'var(--tx3)22';b.style.color=ok?'var(--gn)':'var(--tx3)'}
async function saveJiraSettings(){const url=document.getElementById('jiraUrl').value.trim();const email=document.getElementById('jiraEmail').value.trim();const token=document.getElementById('jiraToken').value.trim();const project=(document.getElementById('jiraProject').value.trim()||'ISC').toUpperCase();const res=document.getElementById('jiraSettingsResult');res.style.display='none';if(!url||!email){res.style.display='inline-block';res.style.background='var(--rd)22';res.style.color='var(--rd)';res.textContent='URL and email are required';return}localStorage.setItem(userKey('sq_atl_url'),url);localStorage.setItem(userKey('sq_atl_email'),email);localStorage.setItem(userKey('sq_jira_project'),project);// also sync admin fields if they exist
const au=document.getElementById('cfgAtlUrl');const ae=document.getElementById('cfgAtlEmail');const ap=document.getElementById('cfgAtlProject');if(au)au.value=url;if(ae)ae.value=email;if(ap)ap.value=project;if(!token){res.style.display='inline-block';res.style.background='var(--warn,#f59e0b)22';res.style.color='var(--warn,#f59e0b)';res.textContent='Enter API token to authenticate';return}res.style.display='inline-block';res.style.background='var(--tx3)22';res.style.color='var(--tx3)';res.textContent='Connecting...';try{const r=await fetch('/api/atlassian/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base:url,email,token,project})});const d=await r.json();if(r.ok){res.style.background='var(--gn)22';res.style.color='var(--gn)';res.textContent=d.message||'Connected';document.getElementById('jiraToken').value='';document.getElementById('jiraToken').placeholder='Token saved — enter to update';updateJiraConnBadge(true,'Connected');checkSystemStatus();ldCal();ldTickets()}else{res.style.background='var(--rd)22';res.style.color='var(--rd)';res.textContent=d.error||'Authentication failed';updateJiraConnBadge(false,'Auth failed')}}catch(e){res.style.background='var(--rd)22';res.style.color='var(--rd)';res.textContent=e.message}}
async function testJiraConn(){const res=document.getElementById('jiraSettingsResult');res.style.display='inline-block';res.style.background='var(--tx3)22';res.style.color='var(--tx3)';res.textContent='Testing...';try{const r=await fetch('/api/jira/test',{method:'POST'});const d=await r.json();if(d.success){res.style.background='var(--gn)22';res.style.color='var(--gn)';res.textContent='Jira: '+d.message;updateJiraConnBadge(true,'Connected')}else{res.style.background='var(--rd)22';res.style.color='var(--rd)';res.textContent='Jira: '+(d.error||'Failed');updateJiraConnBadge(false,'Error')}}catch(e){res.style.background='var(--rd)22';res.style.color='var(--rd)';res.textContent=e.message}}
async function testAtlassianConn(){const res=document.getElementById('cfgAtlResult');res.style.display='flex';res.className='admin-result warn';res.textContent='Testing connections...';
let msgs=[];
try{const r=await fetch('/api/confluence/test',{method:'POST'});const d=await r.json();msgs.push(d.success?'Confluence: Connected'+(d.spaces?.length?' ('+d.spaces.length+' spaces)':''):'Confluence: '+(d.error||'Failed'))}catch{msgs.push('Confluence: Not reachable')}
try{const r=await fetch('/api/jira/test',{method:'POST'});const d=await r.json();msgs.push(d.success?'Jira: '+d.message:'Jira: '+(d.error||'Failed'))}catch{msgs.push('Jira: Not reachable')}
const allOk=msgs.every(m=>m.includes('Connected')||m.includes('Connected as'));
res.className=allOk?'admin-result ok':'admin-result warn';res.textContent=msgs.join(' | ')}

let _bankStats=null;
async function refreshBankStats(){try{const r=await fetch('/api/debug/bank-stats');_bankStats=await r.json();const f=_bankStats.files||{};document.getElementById('bankProdCount').textContent=f.products||0;document.getElementById('bankCatCount').textContent=f.categories||0;document.getElementById('bankPolCount').textContent=f.policies||0;document.getElementById('bankFWCount').textContent=f.frameworks||0;document.getElementById('bankPQCount').textContent=f.pastQuestionnaires||0;document.getElementById('bankTotalFiles').textContent=_bankStats.totalFiles||0}catch{}}
function toggleBankFiles(){const el=document.getElementById('bankFileList');if(el.style.display!=='none'){el.style.display='none';return}if(!_bankStats?.fileList?.length){el.style.display='block';el.textContent='No files in answer bank';return}el.style.display='block';el.innerHTML=_bankStats.fileList.map(f=>`<div style="padding:2px 0;border-bottom:1px solid var(--bd)">${esc(f)}</div>`).join('')}

async function checkSystemStatus(){
const setBadge=(id,txt,cls)=>{const el=document.getElementById(id);if(el){el.textContent=txt;el.className='admin-status-badge '+cls}};
setBadge('sysServer','Running','ok');
try{const r=await fetch('/api/confluence/test',{method:'POST'});const d=await r.json();setBadge('sysConfluence',d.success?'Connected':'Error',d.success?'ok':'err')}catch{setBadge('sysConfluence','Not configured','warn')}
try{const r=await fetch('/api/jira/test',{method:'POST'});const d=await r.json();setBadge('sysJira',d.success?'Connected':'Error',d.success?'ok':'err')}catch{setBadge('sysJira','Not configured','warn')}
try{const r=await fetch('/api/atlassian/project');const d=await r.json();setBadge('sysProject',d.project||'ISC','ok');const inp=document.getElementById('cfgAtlProject');if(inp&&d.project)inp.value=d.project}catch{}
try{const r=await fetch('/api/debug/bank-stats');const d=await r.json();setBadge('sysBank',`${d.totalFiles} files`,'ok')}catch{setBadge('sysBank','Error','err')}
if(window._hasServerApiKey){setBadge('sysAI','Verifying...','warn');try{const r=await fetch('/api/test-api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});const d=await r.json();setBadge('sysAI',d.success?'Connected':d.error||'Invalid key',d.success?'ok':'err')}catch{setBadge('sysAI','Error','err')}}
else{setBadge('sysAI','No API key','warn')}}

/* ── Global Task Tracker ── */
const _tasks={};
function gtAdd(id,label,tab){_tasks[id]={label,tab,pct:0,status:'running'};gtRender()}
function gtUpdate(id,pct,statusText){if(!_tasks[id])return;_tasks[id].pct=pct;if(statusText)_tasks[id].statusText=statusText;gtRender()}
function gtDone(id){if(!_tasks[id])return;_tasks[id].status='done';_tasks[id].pct=100;gtRender();setTimeout(()=>{delete _tasks[id];gtRender()},4000);refreshBankStats()}
function gtError(id,msg){if(!_tasks[id])return;_tasks[id].status='error';_tasks[id].statusText=msg;gtRender();setTimeout(()=>{delete _tasks[id];gtRender()},6000)}
function gtRender(){const bar=document.getElementById('gtBar');const el=document.getElementById('gtTasks');const keys=Object.keys(_tasks);if(!keys.length){bar.classList.remove('vis');return}bar.classList.add('vis');el.innerHTML=keys.map(k=>{const t=_tasks[k];const icon=t.status==='running'?'<span class="gtb-spin"></span>':t.status==='done'?'<span class="gtb-done">&#10003;</span>':'<span class="gtb-err">&#10007;</span>';return`<div class="gtb-task" data-tab="${t.tab}" title="${esc(t.statusText||t.label)}">${icon}<span class="gtb-label">${esc(t.label)}</span><span class="gtb-pct">${t.status==='running'?Math.round(t.pct)+'%':t.status==='done'?'Done':'Failed'}</span></div>`}).join('')}
function swTo(tab){const tabMap={chat:0,upload:1,import:2,migrate:3,calendar:4,admin:5};const idx=tabMap[tab];if(idx!==undefined){const navItems=document.querySelectorAll('.sb-nav-item');if(navItems[idx])sw(tab,navItems[idx])}}

/* Auto-refresh bank stats every 30s */
setInterval(refreshBankStats,30000);
// Sidebar resize
(function(){const SB_MIN=180,SB_MAX=480,handle=document.getElementById('sbResize');if(!handle)return;const saved=parseInt(localStorage.getItem('sq_sb_width'));if(saved&&saved>=SB_MIN&&saved<=SB_MAX){document.documentElement.style.setProperty('--sw',saved+'px')}handle.addEventListener('mousedown',e=>{e.preventDefault();handle.classList.add('dragging');document.body.style.cursor='col-resize';document.body.style.userSelect='none';const onMove=ev=>{const w=Math.min(SB_MAX,Math.max(SB_MIN,ev.clientX));document.documentElement.style.setProperty('--sw',w+'px')};const onUp=ev=>{const w=Math.min(SB_MAX,Math.max(SB_MIN,ev.clientX));document.documentElement.style.setProperty('--sw',w+'px');localStorage.setItem('sq_sb_width',w);handle.classList.remove('dragging');document.body.style.cursor='';document.body.style.userSelect='';document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp)};document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp)})
  // --- histBody: hitem click (loadConv) and hitem-del click (delConv) ---
  var histBody = document.getElementById('histBody');
  if (histBody) {
    histBody.addEventListener('click', function(e) {
      var delBtn = e.target.closest('[data-del-conv]');
      if (delBtn) { e.stopPropagation(); delConv(delBtn.dataset.delConv, e); return; }
      var item = e.target.closest('[data-load-conv]');
      if (item) loadConv(item.dataset.loadConv);
    });
  }

  // --- chMsg: handle data-action="cpMsg" / data-action="openSave" ---
  // (supplement the existing delegation already on chMsg above)

  // --- calTkDetail: close button delegation ---
  var calTkDetail = document.getElementById('calTkDetail');
  if (calTkDetail) {
    calTkDetail.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="closeTkDetail"]');
      if (btn) closeTkDetail();
    });
  }

  // --- resultsBody: saveRowToBank delegation (supplement existing handler) ---
  // Already handled via data-action="saveRowToBank" in resultsBody delegation above
  // but the original used btn directly; now btn has data-rowid so we need to update
  if (resultsBody) {
    resultsBody.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="saveRowToBank"]');
      if (btn) saveRowToBank(btn);
    });
  }

  // --- chMsg: data-action buttons delegation ---
  if (chMsg) {
    chMsg.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="cpMsg"]');
      if (btn) { cpMsg(btn); return; }
      var svBtn = e.target.closest('[data-action="openSave"]');
      if (svBtn) { openSave(svBtn); return; }
    });
  }

})();


// ============================================================
// CSP-compliant event bindings  (replaces all inline handlers)
// Added after original code so all functions are defined first.
// ============================================================
(function bindEvents() {

  // --- Sidebar nav items ---
  var navModes = ['chat','upload','import','migrate','calendar','admin'];
  document.querySelectorAll('.sb-nav-item').forEach(function(item, idx) {
    item.classList.add('sb-nav-item-' + (navModes[idx] || idx));
    item.addEventListener('click', function() { sw(navModes[idx], item); });
  });

  // --- Hist toggle ---
  var histToggle = document.getElementById('histToggle');
  if (histToggle) histToggle.addEventListener('click', toggleHist);

  // --- Hist plus (new chat) ---
  var histPlus = document.querySelector('.sb-hist-plus');
  if (histPlus) histPlus.addEventListener('click', function(e) { e.stopPropagation(); newChat(); });

  // --- Hamburger sidebar toggle ---
  var hamBtn = document.querySelector('.ham');
  if (hamBtn) hamBtn.addEventListener('click', function() {
    var sb = document.getElementById('sb');
    sb.classList.toggle('shut');
    localStorage.setItem('sq_sb_collapsed', sb.classList.contains('shut') ? '1' : '0');
  });
  if (localStorage.getItem('sq_sb_collapsed') === '1') document.getElementById('sb').classList.add('shut');

  // --- Model select ---
  var modelSelect = document.getElementById('modelSelect');
  if (modelSelect) modelSelect.addEventListener('change', function() { chModel(this.value); });

  // --- Theme toggle buttons ---
  var thDark = document.getElementById('thDark');
  var thLight = document.getElementById('thLight');
  if (thDark) thDark.addEventListener('click', function() { setTheme('dark', this); });
  if (thLight) thLight.addEventListener('click', function() { setTheme('light', this); });

  // --- Chat textarea ---
  var chIn = document.getElementById('chIn');
  if (chIn) {
    chIn.addEventListener('keydown', chKey);
    chIn.addEventListener('input', function() { aRsz(this); });
  }

  // --- Chat send button ---
  var chSnd = document.getElementById('chSnd');
  if (chSnd) chSnd.addEventListener('click', sendMsg);

  // --- Chat attach button ---
  var atBtn = document.querySelector('.ib.at');
  if (atBtn) atBtn.addEventListener('click', function() { document.getElementById('chFI').click(); });

  // --- Chat file input ---
  var chFI = document.getElementById('chFI');
  if (chFI) chFI.addEventListener('change', function() { hCF(this.files); });

  // --- Suggestion cards (delegation on stable #chMsg container) ---
  var chMsg = document.getElementById('chMsg');
  if (chMsg) chMsg.addEventListener('click', function(e) { var sug = e.target.closest('.sug'); if (sug) uSug(sug); });

  // --- Copy/Save buttons in messages (delegation on #chMsg) ---
  if (chMsg) chMsg.addEventListener('click', function(e) {
    var cpBtn = e.target.closest('.ma-btn:not(.sv)');
    if (cpBtn) { cpMsg(cpBtn); return; }
    var svBtn = e.target.closest('.ma-btn.sv');
    if (svBtn) { openSave(svBtn); }
  });

  // --- Batch: process button ---
  var processBtn = document.getElementById('processBtn');
  if (processBtn) processBtn.addEventListener('click', startProc);

  // --- Batch: cancel button ---
  var cancelBatchBtn = document.getElementById('cancelBatchBtn');
  if (cancelBatchBtn) cancelBatchBtn.addEventListener('click', cancelBatch);

  // --- Batch: reset (New) ---
  document.querySelectorAll('[data-action="resetUp"]').forEach(function(b) { b.addEventListener('click', resetUp); });

  // --- Batch: save to bank ---
  var saveBankBtn = document.getElementById('saveBankBtn');
  if (saveBankBtn) saveBankBtn.addEventListener('click', saveProcToBank);

  // --- Batch: download ---
  document.querySelectorAll('[data-action="dlFile"]').forEach(function(b) { b.addEventListener('click', dlFile); });

  // --- Batch: framework select ---
  var batchFramework = document.getElementById('batchFramework');
  if (batchFramework) batchFramework.addEventListener('change', updBatchVer);

  // --- Results filter buttons (delegation) ---
  var resFb = document.querySelector('#resultsSection .fb');
  if (resFb) resFb.addEventListener('click', function(e) {
    var btn = e.target.closest('.fbtn');
    if (btn && btn.dataset.filter) fRes(btn.dataset.filter, btn);
  });

  // --- Migration filter buttons (delegation on #migRes .fb) ---
  var migFb = document.querySelector('#migRes .fb');
  if (migFb) migFb.addEventListener('click', function(e) {
    var btn = e.target.closest('.fbtn');
    if (btn && btn.dataset.filter) fMig(btn.dataset.filter, btn);
  });

  // --- Migration: start ---
  var migBtn = document.getElementById('migBtn');
  if (migBtn) migBtn.addEventListener('click', startMig);

  // --- Migration: reset ---
  document.querySelectorAll('[data-action="resetMig"]').forEach(function(b) { b.addEventListener('click', resetMig); });

  // --- Migration: export ---
  document.querySelectorAll('[data-action="expMig"]').forEach(function(b) { b.addEventListener('click', expMig); });

  // --- Migration source/target file inputs ---
  var mSI = document.getElementById('mSI');
  if (mSI) mSI.addEventListener('change', function() { hMF('source', this.files[0]); });
  var mTI = document.getElementById('mTI');
  if (mTI) mTI.addEventListener('change', function() { hMF('target', this.files[0]); });

  // --- Calendar filters ---
  ['calTkFilter','calTkAssignee','calTkType'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', ldTickets);
  });

  // --- Calendar refresh button ---
  var calRefreshBtn = document.getElementById('calRefreshBtn');
  if (calRefreshBtn) calRefreshBtn.addEventListener('click', ldTickets);

  // --- Calendar field select ---
  var calField = document.getElementById('calField');
  if (calField) calField.addEventListener('change', ldCal);

  // --- Calendar nav ---
  var calNavPrev = document.getElementById('calNavPrev');
  var calNavNext = document.getElementById('calNavNext');
  if (calNavPrev) calNavPrev.addEventListener('click', function() { cNav(-1); });
  if (calNavNext) calNavNext.addEventListener('click', function() { cNav(1); });

  // --- Calendar view tab buttons (delegation) ---
  var calTabs = document.querySelector('#calendarPanel .tabs');
  if (calTabs) calTabs.addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (btn && btn.dataset.view) swCalView(btn.dataset.view, btn);
  });

  // --- Calendar maximize ---
  var calMaxBtn = document.getElementById('calMaxBtn');
  if (calMaxBtn) calMaxBtn.addEventListener('click', toggleCalMax);

  // --- Board refresh ---
  var boardRefreshBtn = document.getElementById('boardRefreshBtn');
  if (boardRefreshBtn) boardRefreshBtn.addEventListener('click', ldBoard);

  // --- Calendar modal backdrop ---
  var cMod = document.getElementById('cMod');
  if (cMod) cMod.addEventListener('click', function(e) {
    if (e.target === this) { this.classList.remove('vis'); return; }
    var btn = e.target.closest('[data-action="closeCalModal"]');
    if (btn) cMod.classList.remove('vis');
  });

  // --- Import: destination type buttons (delegation on .itg) ---
  var itg = document.querySelector('.itg');
  if (itg) itg.addEventListener('click', function(e) {
    var btn = e.target.closest('.itb');
    if (btn && btn.dataset.importType) sIT(btn.dataset.importType, btn);
  });

  // --- Import: submit/cancel/reset — use delegation so dynamically-created buttons work ---
  var importPanel = document.getElementById('importPanel');
  if (importPanel) importPanel.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'resetImp') resetImp();
    if (btn.dataset.action === 'subImpFile') subImpFile();
  });

  // --- Admin tabs (delegation on #adminTabs) ---
  var adminTabs = document.getElementById('adminTabs');
  if (adminTabs) adminTabs.addEventListener('click', function(e) {
    var btn = e.target.closest('.admin-tab');
    if (btn && btn.dataset.tab) swAdminTab(btn.dataset.tab, btn);
  });

  // --- Admin action buttons ---
  document.querySelectorAll('[data-action="saveAtlassianConfig"]').forEach(function(b) { b.addEventListener('click', saveAtlassianConfig); });
  document.querySelectorAll('[data-action="testAtlassianConn"]').forEach(function(b) { b.addEventListener('click', testAtlassianConn); });
  document.querySelectorAll('[data-action="saveApiKey"]').forEach(function(b) { b.addEventListener('click', saveApiKey); });
  document.querySelectorAll('[data-action="testApiKey"]').forEach(function(b) { b.addEventListener('click', testApiKey); });
  document.querySelectorAll('[data-action="checkSystemStatus"]').forEach(function(b) { b.addEventListener('click', checkSystemStatus); });
  document.querySelectorAll('[data-action="refreshBankStats"]').forEach(function(b) { b.addEventListener('click', refreshBankStats); });
  document.querySelectorAll('[data-action="toggleBankFiles"]').forEach(function(b) { b.addEventListener('click', toggleBankFiles); });
  document.querySelectorAll('[data-action="loadLogs"]').forEach(function(b) { b.addEventListener('click', loadLogs); });
  document.querySelectorAll('[data-action="exportLogs"]').forEach(function(b) { b.addEventListener('click', exportLogs); });
  document.querySelectorAll('[data-action="clearLogs"]').forEach(function(b) { b.addEventListener('click', clearLogs); });

  // --- Admin: AI model select ---
  var cfgAIModel = document.getElementById('cfgAIModel');
  if (cfgAIModel) cfgAIModel.addEventListener('change', function() { chModel(this.value); });

  // --- Admin: Product name input enter key ---
  var newProductName = document.getElementById('newProductName');
  if (newProductName) newProductName.addEventListener('keydown', function(e) { if (e.key === 'Enter') addProduct(); });
  document.querySelectorAll('[data-action="addProduct"]').forEach(function(b) { b.addEventListener('click', addProduct); });

  // --- Admin: Framework name input enter key ---
  var newFWName = document.getElementById('newFWName');
  if (newFWName) newFWName.addEventListener('keydown', function(e) { if (e.key === 'Enter') addFramework(); });
  document.querySelectorAll('[data-action="addFramework"]').forEach(function(b) { b.addEventListener('click', addFramework); });

  // --- Logs filter/search ---
  var logTypeFilter = document.getElementById('logTypeFilter');
  if (logTypeFilter) logTypeFilter.addEventListener('change', loadLogs);
  var logSearch = document.getElementById('logSearch');
  if (logSearch) logSearch.addEventListener('input', loadLogs);

  // --- Save modal ---
  var saveModal = document.getElementById('saveModal');
  if (saveModal) saveModal.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('vis'); });
  document.querySelectorAll('[data-action="closeSaveModal"]').forEach(function(b) {
    b.addEventListener('click', function() { document.getElementById('saveModal').classList.remove('vis'); });
  });
  document.querySelectorAll('[data-action="doSaveAnswer"]').forEach(function(b) { b.addEventListener('click', doSaveAnswer); });

  // --- Jira Settings buttons ---
  var jiraSaveBtn = document.getElementById('jiraSaveBtn');
  if (jiraSaveBtn) jiraSaveBtn.addEventListener('click', saveJiraSettings);
  var jiraTestBtn = document.getElementById('jiraTestBtn');
  if (jiraTestBtn) jiraTestBtn.addEventListener('click', testJiraConn);

  // --- Login ---
  var loginBtn = document.getElementById('loginBtn');
  if (loginBtn) loginBtn.addEventListener('click', doLogin);
  var loginPassword = document.getElementById('loginPassword');
  if (loginPassword) loginPassword.addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  var loginUsername = document.getElementById('loginUsername');
  if (loginUsername) loginUsername.addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('loginPassword').focus(); });

  // --- User management buttons ---
  var createUserBtn = document.getElementById('createUserBtn');
  if (createUserBtn) createUserBtn.addEventListener('click', createUser);
  var editUserSaveBtn = document.getElementById('editUserSaveBtn');
  if (editUserSaveBtn) editUserSaveBtn.addEventListener('click', saveEditUser);
  var editUserCancelBtn = document.getElementById('editUserCancelBtn');
  if (editUserCancelBtn) editUserCancelBtn.addEventListener('click', function() { document.getElementById('editUserModal').style.display='none'; });
  // Close edit modal on backdrop click
  var editUserModal = document.getElementById('editUserModal');
  if (editUserModal) editUserModal.addEventListener('click', function(e) { if (e.target === this) this.style.display='none'; });
  // Edit/Delete buttons in users table (event delegation — buttons are dynamically rendered)
  var usersBody = document.getElementById('usersBody');
  if (usersBody) usersBody.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit-user') {
      openEditUser(btn.dataset.id, btn.dataset.username, btn.dataset.role, btn.dataset.canadmin === 'true');
    } else if (btn.dataset.action === 'delete-user') {
      deleteUser(btn.dataset.id, btn.dataset.username);
    }
  });
  // Show/hide canAdmin checkbox based on role in create form
  var newRole = document.getElementById('newRole');
  if (newRole) newRole.addEventListener('change', function() {
    var cb = document.getElementById('newCanAdmin');
    var wrap = document.getElementById('newCanAdminWrap');
    if (this.value === 'admin') {
      cb.checked = true; cb.disabled = true;
      if (wrap) wrap.style.display = 'flex';
    } else {
      cb.checked = false; cb.disabled = false;
      if (wrap) wrap.style.display = 'none';
    }
  });

  // --- Sidebar logout button ---
  var sbLogoutBtn = document.getElementById('sbLogoutBtn');
  if (sbLogoutBtn) sbLogoutBtn.addEventListener('click', function() {
    if (confirm('Log out?')) _doLogout();
  });

  // --- Idle warn stay-logged-in button ---
  var idleWarnBtn = document.getElementById('idleWarnBtn');
  if (idleWarnBtn) idleWarnBtn.addEventListener('click', function() {
    var w = document.getElementById('idleWarn');
    if (w && w._iv) clearInterval(w._iv);
    _resetIdle();
  });

  // --- Results table: textarea events (delegation on resultsBody) ---
  var resultsBody = document.getElementById('resultsBody');
  if (resultsBody) {
    resultsBody.addEventListener('change', function(e) { var ta = e.target.closest('.res-answer'); if (ta) updAnswer(ta); });
    resultsBody.addEventListener('input', function(e) { var ta = e.target.closest('.res-answer'); if (ta) autoGrow(ta); });
    resultsBody.addEventListener('click', function(e) { var btn = e.target.closest('.ma-btn.sv'); if (btn) saveRowToBank(btn); });
  }

  // --- adminProductList: delete buttons (delegation) ---
  var adminProductList = document.getElementById('adminProductList');
  if (adminProductList) adminProductList.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-del-product]');
    if (btn) delProduct(btn.dataset.delProduct);
  });

  // --- adminFWList: delegation for delete/add version buttons and enter key ---
  var adminFWList = document.getElementById('adminFWList');
  if (adminFWList) {
    adminFWList.addEventListener('click', function(e) {
      var btn;
      btn = e.target.closest('[data-del-fw]');
      if (btn) { delFramework(btn.dataset.delFw); return; }
      btn = e.target.closest('[data-del-fw-ver]');
      if (btn) { delFWVersion(btn.dataset.delFwName, btn.dataset.delFwVer); return; }
      btn = e.target.closest('[data-add-fw-ver]');
      if (btn) { addFWVersion(btn.dataset.addFwVer); return; }
    });
    adminFWList.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      var inp = e.target.closest('[data-fw-ver-input]');
      if (inp) addFWVersion(inp.dataset.fwVerInput);
    });
  }

  // --- calTkList: ticket item clicks (delegation) ---
  var calTkList = document.getElementById('calTkList');
  if (calTkList) calTkList.addEventListener('click', function(e) {
    var item = e.target.closest('.tk-item');
    if (item && item.dataset.tkKey) showTkDetail(item.dataset.tkKey);
  });

  // --- calGrid: calendar event clicks (delegation) ---
  var calGrid = document.getElementById('calGrid');
  if (calGrid) calGrid.addEventListener('click', function(e) {
    var ct = e.target.closest('.ct');
    if (ct && ct.dataset.ticket) { try { shTD(JSON.parse(ct.dataset.ticket)); } catch(ex) {} }
  });

  // --- kanban: card clicks (delegation) ---
  var kanban = document.getElementById('kanban');
  if (kanban) kanban.addEventListener('click', function(e) {
    var card = e.target.closest('.kb-card');
    if (card && card.dataset.tkKey) showTkDetail(card.dataset.tkKey);
  });

  // --- Jobs badge ---
  var jobsBadge = document.getElementById('jobsBadge');
  if (jobsBadge) jobsBadge.addEventListener('click', function() {
    var navItems = document.querySelectorAll('.sb-nav-item');
    if (navItems[1]) sw('upload', navItems[1]);
  });

  // --- Global task tracker tasks (delegation on #gtTasks) ---
  var gtTasks = document.getElementById('gtTasks');
  if (gtTasks) gtTasks.addEventListener('click', function(e) {
    var task = e.target.closest('.gtb-task');
    if (task && task.dataset.tab) swTo(task.dataset.tab);
  });

  // --- Attachment remove chips (delegation on #chAtt) ---
  var chAtt_el = document.getElementById('chAtt');
  if (chAtt_el) chAtt_el.addEventListener('click', function(e) {
    var x = e.target.closest('.att-x');
    if (x && x.dataset.attIdx !== undefined) { chAtt.splice(parseInt(x.dataset.attIdx), 1); rCAtt(); }
  });


  // --- histBody: hitem click (loadConv) and hitem-del click (delConv) ---
  var histBody = document.getElementById('histBody');
  if (histBody) {
    histBody.addEventListener('click', function(e) {
      var delBtn = e.target.closest('[data-del-conv]');
      if (delBtn) { e.stopPropagation(); delConv(delBtn.dataset.delConv, e); return; }
      var item = e.target.closest('[data-load-conv]');
      if (item) loadConv(item.dataset.loadConv);
    });
  }

  // --- chMsg: handle data-action="cpMsg" / data-action="openSave" ---
  // (supplement the existing delegation already on chMsg above)

  // --- calTkDetail: close button delegation ---
  var calTkDetail = document.getElementById('calTkDetail');
  if (calTkDetail) {
    calTkDetail.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="closeTkDetail"]');
      if (btn) closeTkDetail();
    });
  }

  // --- resultsBody: saveRowToBank delegation (supplement existing handler) ---
  // Already handled via data-action="saveRowToBank" in resultsBody delegation above
  // but the original used btn directly; now btn has data-rowid so we need to update
  if (resultsBody) {
    resultsBody.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="saveRowToBank"]');
      if (btn) saveRowToBank(btn);
    });
  }

  // --- chMsg: data-action buttons delegation ---
  if (chMsg) {
    chMsg.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="cpMsg"]');
      if (btn) { cpMsg(btn); return; }
      var svBtn = e.target.closest('[data-action="openSave"]');
      if (svBtn) { openSave(svBtn); return; }
    });
  }

})();

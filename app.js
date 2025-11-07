/* app.js — 前端邏輯（GitHub Pages ready） */
(function(){
  const $ = (s,el=document)=>el.querySelector(s);
  const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
  const toast = (m)=>alert(m);

  const WEB_APP_URL = (window.APP_CONFIG && window.APP_CONFIG.WEB_APP_URL) || "";

  const autoBasis = r => r?.includes('嘉獎') ? '第四條第十六款'
                     : r?.includes('小功') ? '第五條第十二款' : '';

  const fmt = v => { const d=new Date(v); if(isNaN(d)) return v||''; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const toROC = v => { const d=new Date(v); if(isNaN(d)) return ''; return `中華民國 ${d.getFullYear()-1911} 年 ${String(d.getMonth()+1).padStart(2,'0')} 月 ${String(d.getDate()).padStart(2,'0')} 日`; };

  const tbody = $('#tbody'), countEl = $('#count'), q = $('#q');
  const btnEmcee = $('#btnEmcee'), btnAward = $('#btnAward');

  async function loadList(){
    try{
      const res = await fetch(WEB_APP_URL, { method:'GET' });
      const json = await res.json();
      if(json.status!=='success') throw new Error(json.message||'讀取失敗');
      $('#topWarn').textContent='後端連線成功';
      renderTable(json.data||[]);
    }catch(e){
      $('#topWarn').textContent='後端連線失敗';
      tbody.innerHTML='<tr><td colspan="10" class="empty">無法連線後端</td></tr>';
      countEl.textContent='0';
      btnEmcee.disabled = btnAward.disabled = true;
    }
  }

  function renderTable(list){
    const kw = (q.value||'').toLowerCase();
    const rows = list.filter(o=>{
      const s = `${o['編號']||''} ${o['班級']||''} ${o['座號']||''} ${o['姓名']||''} ${o['發生日期']||''} ${o['事由']||''} ${o['獎懲種類']||''} ${o['法條依據']||''}`.toLowerCase();
      return !kw || s.includes(kw);
    }).map(o=>`
      <tr>
        <td><input type="checkbox" class="rowchk" value="${o['編號']}"></td>
        <td class="mono">${o['編號']||''}</td>
        <td>${o['班級']||''}</td>
        <td>${o['座號']||''}</td>
        <td>${o['姓名']||''}</td>
        <td>${fmt(o['發生日期'])}</td>
        <td>${o['事由']||''}</td>
        <td>${o['獎懲種類']||''}</td>
        <td>${o['法條依據']||''}</td>
        <td>${fmt(o['建立時間'])}</td>
      </tr>`).join('');
    tbody.innerHTML = rows || `<tr><td colspan="10" class="empty">尚無資料</td></tr>`;
    countEl.textContent=list.length;
    updateButtons();
  }

  function selectedIds(){ return $$('.rowchk').filter(x=>x.checked).map(x=>x.value); }
  function updateButtons(){ const n = selectedIds().length; btnEmcee.disabled = btnAward.disabled = !n; }

  tbody.addEventListener('change', e=>{ if(e.target.classList.contains('rowchk')) updateButtons(); });
  $('#toggleAllBtn').addEventListener('click', ()=>{ const c=$$('.rowchk'), all=c.every(x=>x.checked); c.forEach(x=>x.checked=!all); updateButtons(); });
  $('#refreshBtn').addEventListener('click',loadList);
  q.addEventListener('input',loadList);

  // --- 送資料：預設使用 x-www-form-urlencoded（避免 CORS 預檢） ---
  $('#form').addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    if(!payload['法條依據']) payload['法條依據']=autoBasis(payload['獎懲種類'])||'';

    try{
      const res = await fetch(WEB_APP_URL, {method:'POST', body:new URLSearchParams(payload)});
      const json = await res.json();
      if(json.status!=='success') throw new Error(json.message);
      toast('✅ 已加入名單');
      e.target.reset(); $('#basisInput').value='';
      await loadList();
    }catch(err){
      toast('❌ 寫入失敗：'+err.message);
    }
  });

 // ===== 司儀稿設定 =====
const EMCEE_SUFFIX = '恭請校長頒獎';  // 結尾語
const NAME_JOINER = '、';              // 多人連接符號

// 清理尾標點
function normalizeTail(s) {
  return String(s || '').trim().replace(/[，。．、：:；;]+$/g, '');
}

// 從事由切出「比賽名稱（榮獲前）」與「名次（榮獲後）」
function splitByHonor(s) {
  const raw = normalizeTail(s);
  const i = raw.indexOf('榮獲');
  if (i <= 0) return { comp: raw, result: '' };
  const comp = raw.slice(0, i).replace(/^(參加|於|在)/, '').replace(/[，、。:：]+$/,'').trim();
  const result = raw.slice(i + 2).replace(/^[，、。:：]+/,'').replace(/[，、。:：]+$/,'').trim();
  return { comp: comp || '未填事由', result };
}

// 名次白名單（用於規範化）
const RESULT_WHITELIST = ['第一名','第二名','第三名','特優','優等','佳作','金牌','銀牌','銅牌','金質獎','銀質獎','銅質獎'];
function normalizeResult(r) {
  const s = String(r || '').trim();
  if (RESULT_WHITELIST.includes(s)) return s;
  for (const w of RESULT_WHITELIST) if (s.includes(w)) return w;
  return s;
}

// 班級自然排序（701→702→801…）
function classKey(c) {
  const m = String(c || '').match(/\d+/);
  return m ? Number(m[0]) : 9999;
}

// 取使用者勾選的列資料（不含座號版型）
function getCheckedRows() {
  return Array.from(document.querySelectorAll('.rowchk:checked')).map(chk=>{
    const t = chk.closest('tr').children;
    return {
      班級: t[2].innerText.trim(),
      姓名: t[4].innerText.trim(),
      事由: t[6].innerText.trim(),
    };
  });
}


  // --- 獎懲單（後端產出） ---
  // 優先嘗試 JSON（較直覺）；若失敗（多半因預檢）→ fallback 用 URL-encoded + ids JSON 字串
  $('#btnAward').addEventListener('click', async ()=>{
    const ids = selectedIds();
    if(!ids.length){ toast('請至少勾選一筆'); return; }

    // Helper to render modal
    const showLinks = (docUrl,pdfUrl)=>{
      showModal('敘獎公告已建立',
        `<p>試算表：<a class="mono" href="${docUrl}" target="_blank">${docUrl}</a></p>
         <p>PDF：<a class="mono" href="${pdfUrl}" target="_blank">${pdfUrl}</a></p>
         <p style="color:#6b7280">若無法開啟，請確認權限「知道連結者可檢視」。</p>`,
        {doc:true,pdf:true});
    };

    // Try JSON first
    try{
      const res = await fetch(WEB_APP_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'生成文件', type:'獎懲單製作', ids})
      });
      const json = await res.json();
      if(json.status!=='success') throw new Error(json.message||'生成失敗');
      const {docUrl,pdfUrl}=json.data||{};
      showLinks(docUrl,pdfUrl);
      return;
    }catch(e){
      // fallback
      try{
        const form = new URLSearchParams();
        form.set('action','生成文件');
        form.set('type','獎懲單製作');
        form.set('ids', JSON.stringify(ids)); // 後端若未支援，請加上 JSON.parse 修補
        const res2 = await fetch(WEB_APP_URL, { method:'POST', body: form });
        const json2 = await res2.json();
        if(json2.status!=='success') throw new Error(json2.message||'生成失敗');
        const {docUrl,pdfUrl}=json2.data||{};
        showLinks(docUrl,pdfUrl);
      }catch(e2){
        toast('❌ 生成失敗：'+e2.message+ '\\n建議於後端 doPost 加入： if (typeof payload.ids === \"string\") payload.ids = JSON.parse(payload.ids);');
      }
    }
  });

  // --- Modal ---
  const backdrop=$('#backdrop'), docBody=$('#docBody');
  function showModal(title,html,opt={}){
    $('#modalTitle').textContent=title; docBody.innerHTML=html;
    $('#copyBtn').style.display=opt.copy?'':'none';
    $('#openDocBtn').style.display=opt.doc?'':'none';
    $('#openPdfBtn').style.display=opt.pdf?'':'none';
    $('#downloadPdfBtn').style.display=opt.frontPdf?'':'none';
    backdrop.style.display='flex';
  }
  $('#closeModal').addEventListener('click',()=>backdrop.style.display='none');
  $('#copyBtn').addEventListener('click',async()=>{ try{await navigator.clipboard.writeText(docBody.innerText);toast('已複製');}catch{toast('無法複製');}});
  $('#openDocBtn').addEventListener('click',()=>{ /* 直接點連結開啟 */ });
  $('#openPdfBtn').addEventListener('click',()=>{ /* 直接點連結開啟 */ });
  $('#downloadPdfBtn').addEventListener('click',()=>html2pdf().from(docBody).set({margin:10, filename:`輸出_${Date.now()}.pdf`, jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).save());

  // init
  loadList();
})();

/* app.js
   - 隱藏編號/獎懲/建立時間：清單只渲染 班級/座號/姓名/事由/成績
   - 勾選≧2 筆 → 兩顆按鈕加上 .cta（藍底白字＋字級放大）
   - 去重：以「班級|座號|姓名|事由|成績」為鍵，重複只留第一筆（保留第一筆編號做動作）
*/

(function () {
  const $  = (s,el=document)=>el.querySelector(s);
  const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
  const toast = (m)=>alert(m);

  const WEB_APP_URL = (window.APP_CONFIG && window.APP_CONFIG.WEB_APP_URL) || "";

  const tbody      = $("#tbody");
  const countEl    = $("#count");
  const q          = $("#q");
  const btnEmcee   = $("#btnEmcee");
  const btnAward   = $("#btnAward");
  const topWarn    = $("#topWarn");
  const refreshBtn = $("#refreshBtn");

  const backdrop   = $("#backdrop");
  const modalTitle = $("#modalTitle");
  const docBody    = $("#docBody");
  const copyBtn    = $("#copyBtn");
  const closeModal = $("#closeModal");
  const downloadPdfBtn = $("#downloadPdfBtn");

  let _cacheList = [];

  const fmtDate = (v)=>{
    const d=new Date(v); if(isNaN(d)) return v||"";
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${dd}`;
  };

  function dedup(list){
    const seen=new Set();
    const out=[];
    for(const o of list||[]){
      const key=[o["班級"],o["座號"],o["姓名"],o["事由"],o["成績"]].map(x=>String(x||"").trim()).join("|");
      if (!seen.has(key)){
        seen.add(key);
        out.push(o); // 保留第一筆（帶著第一筆的編號）
      }
    }
    return out;
  }

  async function loadList() {
    try{
      const res = await fetch(WEB_APP_URL, {method:"GET"});
      const json = await res.json();
      if (json.status!=="success") throw new Error(json.message||"讀取失敗");

      // 綠底白字
      topWarn.textContent = "後端連線成功";
      topWarn.classList.remove("bad");
      topWarn.classList.add("ok");

      _cacheList = json.data || [];
      renderTable(_cacheList);
    }catch(err){
      console.error(err);
      topWarn.textContent = "後端連線失敗";
      topWarn.classList.remove("ok");
      topWarn.classList.add("bad");
      tbody.innerHTML = `<tr><td colspan="6" class="muted">無法連線後端</td></tr>`;
      countEl.textContent = "0";
      btnEmcee.disabled = btnAward.disabled = true;
    }
  }

  function renderTable(list){
    const kw=(q.value||"").trim().toLowerCase();
    const rows = dedup(list)
      .filter(o=>{
        const s = `${o["班級"]||""} ${o["座號"]||""} ${o["姓名"]||""} ${o["事由"]||""} ${o["成績"]||""}`.toLowerCase();
        return !kw || s.includes(kw);
      })
      .map(o=>{
        const id   = o["編號"] || "";
        const cls  = o["班級"] || "";
        const seat = o["座號"] || "";
        const name = o["姓名"] || "";
        const why  = o["事由"] || "";
        const rank = o["成績"] || "";
        return `
          <tr>
            <td><input type="checkbox" class="rowchk" value="${id}"></td>
            <td class="mono">${cls}</td>
            <td class="mono">${seat}</td>
            <td>${name}</td>
            <td>${why}</td>
            <td>${rank}</td>
          </tr>
        `;
      }).join("");

    tbody.innerHTML = rows || `<tr><td colspan="6" class="muted">尚無資料</td></tr>`;
    countEl.textContent = dedup(list).length;
    updateButtons();
  }

  function selectedIds(){
    return $$(".rowchk").filter(x=>x.checked).map(x=>x.value);
  }
  function getCheckedRows(){
    return $$(".rowchk:checked").map(chk=>{
      const t=chk.closest("tr").children;
      return {
        班級:t[1].innerText.trim(),
        座號:t[2].innerText.trim(),
        姓名:t[3].innerText.trim(),
        事由:t[4].innerText.trim(),
        成績:t[5].innerText.trim(),
      };
    });
  }

  function updateButtons(){
    const n = selectedIds().length;
    // 啟用/停用：至少選 1 筆
    const enable = n>=1;
    btnEmcee.disabled = btnAward.disabled = !enable;

    // 強調樣式：選 2 筆以上
    if (n>=2){
      btnEmcee.classList.add("cta");
      btnAward.classList.add("cta");
    }else{
      btnEmcee.classList.remove("cta");
      btnAward.classList.remove("cta");
    }
  }

  tbody.addEventListener("change", e=>{
    if (e.target.classList.contains("rowchk")) updateButtons();
  });
  q.addEventListener("input", ()=>renderTable(_cacheList));
  refreshBtn.addEventListener("click", e=>{e.preventDefault();loadList();});

  $("#form").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try{
      const res = await fetch(WEB_APP_URL,{
        method:"POST",
        body:new URLSearchParams(payload)
      });
      const json = await res.json();
      if (json.status!=="success") throw new Error(json.message||"寫入失敗");
      toast("✅ 已加入名單");
      e.target.reset();
      await loadList();
    }catch(err){
      toast("❌ 寫入失敗："+err.message);
    }
  });

  // 司儀稿：同一事由合併，不呈現獎懲
  btnEmcee.addEventListener("click", ()=>{
    const rows = getCheckedRows();
    if (!rows.length) return toast("請至少勾選一筆");

    const byComp=new Map();
    for(const r of rows){
      const comp=(r.事由||"").trim();
      const phrase=`${r.班級}班${r.姓名}榮獲${r.成績||""}`;
      if(!byComp.has(comp)) byComp.set(comp,[]);
      byComp.get(comp).push({phrase,cls:r.班級});
    }
    const lines=[];
    for(const [comp,list] of byComp.entries()){
      list.sort((a,b)=>Number(a.cls)-Number(b.cls));
      const joined=list.map(x=>x.phrase).join("、");
      lines.push(`${comp}，${joined}，恭請校長頒獎。`);
    }
    const html=`
      <h2 style="margin:0 0 8px;">頒獎典禮司儀稿（預覽）</h2>
      <div style="line-height:1.9;margin-top:8px;">
        ${lines.map(p=>`<p style="margin:0 0 8px;">${p}</p>`).join("")}
      </div>`;
    showModal("司儀稿預覽", html);
  });

  // 敘獎單（仍需編號，已在去重後保留第一筆編號）
  btnAward.addEventListener("click", async ()=>{
    const ids = selectedIds();
    if (!ids.length) return toast("請至少勾選一筆");
    try{
      const res = await fetch(WEB_APP_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ action:"生成文件", type:"獎懲單製作", ids })
      });
      const json = await res.json();
      if (json.status!=="success") throw new Error(json.message||"生成失敗");
      const {docUrl,pdfUrl} = json.data || {};
      const html = `
        <h3 style="margin:0 0 8px;">敘獎公告已建立</h3>
        <p>試算表：<a class="mono" target="_blank" href="${docUrl}">${docUrl}</a></p>
        <p>PDF：<a class="mono" target="_blank" href="${pdfUrl}">${pdfUrl}</a></p>
        <p class="muted">若無法開啟，請確認權限「知道連結者可檢視」。</p>`;
      showModal("敘獎公告輸出", html);
    }catch(err){
      toast("❌ 生成失敗："+err.message);
    }
  });

  function showModal(title, html){
    modalTitle.textContent=title;
    docBody.innerHTML=html;
    backdrop.style.display="flex";
  }
  closeModal.addEventListener("click", ()=>backdrop.style.display="none"));

  copyBtn.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(docBody.innerText);
      toast("已複製");
    }catch{ toast("無法複製"); }
  });
  downloadPdfBtn.addEventListener("click", ()=>{
    if(!window.html2pdf) return toast("找不到 html2pdf 套件");
    window.html2pdf().from(docBody).set({
      margin:10, filename:`司儀稿_${Date.now()}.pdf`,
      jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}
    }).save();
  });

  loadList();
})();

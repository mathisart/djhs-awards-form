/* app.js — 含司儀稿預覽 / 複製 / 前端PDF */
(function () {
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
  const alert2 = (m)=>alert(m);

  const WEB_APP_URL = (window.APP_CONFIG && window.APP_CONFIG.WEB_APP_URL) || "";

  // 司儀稿規則
  const EMCEE_SUFFIX = "恭請校長頒獎";
  const RESULT_WHITELIST = ["第一名","第二名","第三名","特優","優等","佳作","金牌","銀牌","銅牌","金質獎","銀質獎","銅質獎"];
  const NAME_JOIN = "、";

  // DOM
  const topWarn = $("#topWarn");
  const tbody = $("#tbody");
  const countEl = $("#count");
  const q = $("#q");
  const refreshBtn = $("#refreshBtn");
  const btnAward = $("#btnAward");
  const btnEmcee = $("#btnEmcee");
  const form = $("#form");
  const classInput=$("#classInput"), seatInput=$("#seatInput"), nameInput=$("#nameInput"),
        dateInput=$("#dateInput"), reasonInput=$("#reasonInput"), rewardSelect=$("#rewardSelect");

  // modal
  const backdrop = $("#backdrop");
  const modalTitle = $("#modalTitle");
  const docBody = $("#docBody");
  const copyBtn = $("#copyBtn");
  const downloadPdfBtn = $("#downloadPdfBtn");
  $("#closeModal").addEventListener("click",()=>backdrop.style.display="none");

  let cache = [];

  function setBanner(ok){
    topWarn.classList.remove("success","danger");
    topWarn.classList.add(ok?"success":"danger");
    topWarn.textContent = ok? "後端連線成功":"後端連線失敗";
  }

  function autoBasis(r){
    return r.includes("嘉獎") ? "第四條第十六款" :
           r.includes("小功") ? "第五條第十二款" : "";
  }

  async function load(){
    try{
      const res = await fetch(WEB_APP_URL);
      const json = await res.json();
      if(json.status!=="success") throw new Error(json.message||"讀取失敗");
      cache = json.data || [];
      setBanner(true);
      render(cache);
    }catch(e){
      console.error(e);
      cache=[];
      setBanner(false);
      render(cache);
    }
  }

  function render(list){
    const kw = (q.value||"").toLowerCase();
    const rows = list.filter(o=>{
      const s = `${o["班級"]||""} ${o["座號"]||""} ${o["姓名"]||""} ${o["事由"]||""} ${o["獎懲種類"]||""}`.toLowerCase();
      return !kw || s.includes(kw);
    }).map(o=>`
      <tr>
        <td><input type="checkbox" class="rowchk" value="${o["編號"]||""}"></td>
        <td>${o["班級"]||""}</td>
        <td>${o["座號"]||""}</td>
        <td>${o["姓名"]||""}</td>
        <td>${o["事由"]||""}</td>
        <td>${o["獎懲種類"]||""}</td>
      </tr>
    `).join("");
    tbody.innerHTML = rows || `<tr><td colspan="6" class="empty">尚無資料</td></tr>`;
    countEl.textContent = list.length;
    updateButtons();
  }

  function selectedIds(){
    return $$(".rowchk:checked").map(x=>x.value);
  }
  function updateButtons(){
    const n = selectedIds().length;
    btnEmcee.disabled = !n;
    btnAward.disabled = !n;
  }
  tbody.addEventListener("change",(e)=>{
    if(e.target.classList.contains("rowchk")) updateButtons();
  });

  q.addEventListener("input",()=>render(cache));
  refreshBtn.addEventListener("click",load);

  // 新增
  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const payload = {
      班級:(classInput.value||"").trim(),
      座號:(seatInput.value||"").trim(),
      姓名:(nameInput.value||"").trim(),
      發生日期:dateInput.value||"",
      事由:(reasonInput.value||"").trim(),
      獎懲種類:rewardSelect.value||"",
      法條依據:autoBasis(rewardSelect.value||"")
    };
    if(!payload.班級||!payload.座號||!payload.姓名||!payload.事由||!payload.獎懲種類){
      alert2("請完整填寫班級、座號、姓名、事由與獎懲");
      return;
    }
    try{
      const res = await fetch(WEB_APP_URL,{method:"POST",body:new URLSearchParams(payload)});
      const json = await res.json();
      if(json.status!=="success") throw new Error(json.message||"寫入失敗");
      alert2("✅ 已加入名單");
      form.reset();
      load();
    }catch(err){ alert2("❌ 寫入失敗："+err.message); }
  });

  // 司儀稿 utils
  const tail = (s)=>String(s||"").trim().replace(/[，。．、：:；;]+$/g,"");
  function splitByHonor(s){
    const raw = tail(s);
    const i = raw.indexOf("榮獲");
    if(i<=0) return {comp:raw,result:""};
    const comp = raw.slice(0,i).replace(/^(參加|於|在)/,"").replace(/[，、。:：]+$/,"").trim();
    const result = raw.slice(i+2).replace(/^[，、。:：]+/,"").replace(/[，、。:：]+$/,"").trim();
    return {comp: comp||"未填事由", result};
  }
  function normResult(r){
    const s = String(r||"").trim();
    if(RESULT_WHITELIST.includes(s)) return s;
    for(const w of RESULT_WHITELIST){ if(s.includes(w)) return w; }
    return s;
  }
  function classKey(c){ const m=String(c||"").match(/\d+/); return m?Number(m[0]):9999; }

  function getCheckedRows(){
    return $$(".rowchk:checked").map(chk=>{
      const t=chk.closest("tr").children;
      return {班級:t[1].innerText.trim(),座號:t[2].innerText.trim(),姓名:t[3].innerText.trim(),事由:t[4].innerText.trim()};
    });
  }

  function buildEmceeHTML(){
    const rows = getCheckedRows();
    if(!rows.length){ alert2("請至少勾選一筆"); return ""; }
    const map = new Map();
    for(const r of rows){
      const {comp,result} = splitByHonor(r.事由);
      const phrase = `${r.班級}班${r.姓名}${normResult(result)?`榮獲${normResult(result)}`:""}`;
      if(!map.has(comp)) map.set(comp,[]);
      map.get(comp).push({phrase,cls:r.班級});
    }
    const lines=[];
    for(const [comp,list] of map.entries()){
      list.sort((a,b)=>classKey(a.cls)-classKey(b.cls));
      lines.push(`${comp}，${list.map(x=>x.phrase).join(NAME_JOIN)}，${EMCEE_SUFFIX}。`);
    }
    return lines.map(p=>`<p style="margin:0 0 8px">${p}</p>`).join("");
  }

  function openModal(title,html){
    modalTitle.textContent=title;
    docBody.innerHTML=html||"";
    backdrop.style.display="flex";
  }

  // 點司儀稿
  btnEmcee.addEventListener("click", ()=>{
    const html = buildEmceeHTML();
    if(!html) return;
    openModal("頒獎典禮司儀稿（預覽）", `<div>${html}</div>`);
  });

  // 複製 & PDF
  copyBtn.addEventListener("click", async ()=>{
    try{ await navigator.clipboard.writeText(docBody.innerText); alert2("已複製"); }
    catch{ alert2("無法複製，請手動選取文字"); }
  });
  downloadPdfBtn.addEventListener("click", ()=>{
    if(!window.html2pdf) return alert2("找不到 html2pdf 套件");
    window.html2pdf().from(docBody).set({
      margin:10, filename:`司儀稿_${Date.now()}.pdf`,
      jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}
    }).save();
  });

  // 敘獎單（後端）
  btnAward.addEventListener("click", async ()=>{
    const ids = selectedIds(); if(!ids.length){ alert2("請至少勾選一筆"); return; }
    const open2=(d,p)=>{ alert2(`✅ 已建立敘獎單\n\n試算表：${d}\nPDF：${p}\n\n若無法開啟請確認權限。`); window.open(d,"_blank"); window.open(p,"_blank"); };
    try{
      const r = await fetch(WEB_APP_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"生成文件",type:"獎懲單製作",ids})});
      const j = await r.json(); if(j.status!=="success") throw new Error(j.message||"生成失敗");
      open2(j.data.docUrl,j.data.pdfUrl);
    }catch{
      try{
        const f=new URLSearchParams(); f.set("action","生成文件"); f.set("type","獎懲單製作"); f.set("ids",JSON.stringify(ids));
        const r2=await fetch(WEB_APP_URL,{method:"POST",body:f}); const j2=await r2.json();
        if(j2.status!=="success") throw new Error(j2.message||"生成失敗");
        open2(j2.data.docUrl,j2.data.pdfUrl);
      }catch(e2){ alert2("❌ 生成失敗："+e2.message); }
    }
  });

  load();
})();

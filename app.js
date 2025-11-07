/* ========= 基本設定 ========= */
const WEB_APP_URL = (window.APP_CONFIG && window.APP_CONFIG.WEB_APP_URL) || "";

/* ========= 狀態 & DOM ========= */
const tb = document.querySelector("#tb");
const inputQ = document.querySelector("#q");
const btnAdd = document.querySelector("#btnAdd");
const btnEmcee = document.querySelector("#btnEmcee");
const btnAward = document.querySelector("#btnAward");
const btnRefresh = document.querySelector("#btnRefresh");
const btnClear = document.querySelector("#btnClear");
const connBadge = document.querySelector("#connBadge");

/* 表單欄位 */
const cClass = document.querySelector("#cClass");
const cSeat  = document.querySelector("#cSeat");
const cName  = document.querySelector("#cName");
const cDate  = document.querySelector("#cDate");
const cReason= document.querySelector("#cReason");
const cRank  = document.querySelector("#cRank");
const cAward = document.querySelector("#cAward");

/* ========= Modal（新版：依類型切換按鈕） ========= */
const modal      = document.querySelector("#modal");
const modalTitle = document.querySelector("#modalTitle");
const modalBody  = document.querySelector("#modalBody");
const modalClose = document.querySelector("#modalClose");
const openDocBtn = document.querySelector("#openDocBtn");
const openPdfBtn = document.querySelector("#openPdfBtn");
modalClose.onclick = () => modal.classList.remove("active");

/* ========= 共用：檔名工具 ========= */
function sanitizeFilename(name){
  return (name || "")
    .replace(/[\s　]+/g, "")           // 去空白
    .replace(/[\/\\\?\%\*\:\|\"\<\>]/g, "") // 禁字
    .slice(0, 60);
}
function buildFilenameFromRows(rows){
  if (!rows || rows.length === 0) return "輸出文件";
  // 以第一筆為主組檔名
  const first = rows[0];
  const base = sanitizeFilename(`${first.class || first.班級}${first.seat || first.座號}-${first.reason || first.事由}`);
  return rows.length > 1 ? `${base}_等${rows.length}筆` : base;
}

/* ========= 前端 PDF（司儀稿用） ========= */
function ensureHtml2pdf(){
  return new Promise((resolve) => {
    if (window.html2pdf) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html2pdf.js@0.9.3/dist/html2pdf.bundle.min.js";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}
async function exportEmceePdf(html, filename){
  await ensureHtml2pdf();
  const container = document.createElement("div");
  container.innerHTML = html;
  const opt = {
    margin:       10,
    filename:     `${filename}.pdf`,
    image:        { type:'jpeg', quality:0.98 },
    html2canvas:  { scale:2, useCORS:true },
    jsPDF:        { unit:'mm', format:'a4', orientation:'portrait' }
  };
  await html2pdf().from(container).set(opt).save();
}

/* ========= 後端：建立敘獎單（試算表 & PDF） ========= */
/* 你後端 GAS 可接受以下 payload: {action:'create_award_doc', rows:[...] } 
   回傳: { ok:true, sheetUrl:'...', pdfUrl:'...' } */
async function createAwardDoc(rows){
  try{
    const res = await fetch(WEB_APP_URL, {
      method: "POST",
      mode:   "cors",
      headers:{ "Content-Type":"application/json" },
      body:   JSON.stringify({ action:"create_award_doc", rows })
    });
    const data = await res.json();
    if (data && (data.sheetUrl || data.pdfUrl)) return data;
    throw new Error("No link returned");
  }catch(err){
    console.error("createAwardDoc failed:", err);
    throw err;
  }
}

/* ========= 共用：複製文字 ========= */
async function copyTextToClipboard(text){
  try{
    await navigator.clipboard.writeText(text || "");
    alert("已複製文字到剪貼簿");
  }catch{
    // 備援
    const ta = document.createElement("textarea");
    ta.value = text || "";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    alert("已複製文字到剪貼簿");
  }
}

/* ========= Modal 入口：依 type 切換按鈕 & 行為 =========
   options = {
     type: 'emcee' | 'award',
     rows:  [...],         // 具 class/seat/name/reason/rank 欄位
     html:  '<div>...</div>',
     text:  '純文字（司儀稿用）',
     sheetUrl?: '...',     // award 可先傳，或讓函式去後端生
     pdfUrl?: '...'
   }
*/
function openPreviewModal(options){
  const { type, rows, html, text } = options || {};
  const filename = buildFilenameFromRows(rows);

  modalTitle.textContent = (type === "emcee") ? "司儀稿（預覽）" : "獎懲建議表（預覽）";
  modalBody.innerHTML = html || "";
  modal.classList.add("active");

  // 預設先清掉舊事件
  openDocBtn.onclick = null;
  openPdfBtn.onclick = null;
  openDocBtn.disabled = false;
  openPdfBtn.disabled = false;

  if (type === "emcee"){
    // 司儀稿：複製文字 / 匯出 PDF（前端）
    openDocBtn.textContent = "複製文字";
    openPdfBtn.textContent = "匯出 PDF";

    openDocBtn.onclick = () => copyTextToClipboard(text || "");
    openPdfBtn.onclick = async () => {
      try{
        await exportEmceePdf(html || `<div style="padding:12px">${(text||"").replace(/\n/g,"<br>")}</div>`, filename);
      }catch(e){
        console.error(e);
        alert("匯出 PDF 失敗，請稍後再試。");
      }
    };

  }else{
    // 敘獎單：匯出試算表 / 匯出 PDF（走後端）
    openDocBtn.textContent = "匯出試算表";
    openPdfBtn.textContent = "匯出 PDF";

    openDocBtn.onclick = async () => {
      try{
        if (options.sheetUrl){
          window.open(options.sheetUrl, "_blank");
        }else{
          openDocBtn.disabled = true;
          const out = await createAwardDoc(rows);
          if (out.sheetUrl) window.open(out.sheetUrl, "_blank");
          else alert("無法取得試算表連結。");
        }
      }catch(e){
        console.error(e);
        alert("建立試算表失敗，請稍後再試。");
      }finally{
        openDocBtn.disabled = false;
      }
    };

    openPdfBtn.onclick = async () => {
      try{
        if (options.pdfUrl){
          window.open(options.pdfUrl, "_blank");
          return;
        }
        openPdfBtn.disabled = true;
        const out = await createAwardDoc(rows);
        if (out.pdfUrl){
          // 嘗試以 blob 重新命名另存（跨網域可能會被 CORS 擋，失敗就直接開）
          try{
            const r = await fetch(out.pdfUrl, { mode:"cors" });
            const b = await r.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(b);
            a.download = `${filename}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(a.href);
          }catch{
            window.open(out.pdfUrl, "_blank");
          }
        } else {
          alert("無法取得 PDF 連結。");
        }
      }catch(e){
        console.error(e);
        alert("建立 PDF 失敗，請稍後再試。");
      }finally{
        openPdfBtn.disabled = false;
      }
    };
  }
}

/* =========（可選）快速掛鉤：兩顆主按鈕點擊事件 =========
   若你已經有自己的邏輯在 btnEmcee / btnAward 上，保留即可；
   若沒有或想用我的做法，直接使用以下範例掛鉤。
   需具備：getSelectedRows() 會回傳 [{class, seat, name, reason, rank}, ...]
   以及兩個簡易的預覽輸出函式 buildEmceePreviewHTML / buildAwardPreviewHTML
*/
function getSelectedRows(){
  // 範例：請改為你的實作（從列表 checkbox 蒐集）
  const rows = [];
  document.querySelectorAll('#list tbody tr').forEach(tr=>{
    const chk = tr.querySelector('input[type="checkbox"]');
    if (chk && chk.checked){
      const cells = tr.querySelectorAll('td');
      rows.push({
        class:  cells[1]?.textContent?.trim(),
        seat:   cells[2]?.textContent?.trim(),
        name:   cells[3]?.textContent?.trim(),
        reason: cells[4]?.textContent?.trim(),
        rank:   cells[5]?.textContent?.trim()
      });
    }
  });
  return rows;
}

// 很簡單的預覽（你已經有漂亮卡片版也可以呼叫你的）
function buildEmceePreviewHTML(rows){
  // 這裡示範最小可用：一行式
  const lines = rows.map(r => `${r.reason}：${r.class}班${r.name}榮獲${r.rank}`).join("、");
  const text  = `${lines}，恭請校長頒獎。`;
  const html  = `
    <div class="award-card">
      <div class="award-title">🏆 頒獎典禮司儀稿（自動彙整）</div>
      <div class="award-tip">貼到 Google 文件可再微調。</div>
      <div class="award-desc">${text}</div>
    </div>`;
  return { html, text };
}
function buildAwardPreviewHTML(rows){
  const badge = (t)=>`<span class="award-badge">${t}</span>`;
  const items = rows.map(r=>`
    <div class="award-item">
      ${badge(`${r.class}班`)}
      ${badge(`座${r.seat}`)}
      <div class="award-name">${r.name}</div>
      <div class="award-desc">${r.reason}，${r.rank}</div>
    </div>`).join("");
  return `
    <div class="award-card">
      <div class="award-title">📄 獎懲建議表（預覽）</div>
      <div class="award-tip">確認內容後再按下方「匯出」，產生正式文件。</div>
      <div class="award-list">${items}</div>
    </div>`;
}

// 若你尚未綁定事件，可用以下做法（已有的請保留你的）
const btnEmcee = document.querySelector("#btnEmcee");
if (btnEmcee){
  btnEmcee.onclick = () => {
    const rows = getSelectedRows();
    if (!rows.length) return alert("請先勾選至少一筆。");
    const { html, text } = buildEmceePreviewHTML(rows);
    openPreviewModal({ type:"emcee", rows, html, text });
  };
}
const btnAward = document.querySelector("#btnAward");
if (btnAward){
  btnAward.onclick = () => {
    const rows = getSelectedRows();
    if (!rows.length) return alert("請先勾選至少一筆。");
    const html = buildAwardPreviewHTML(rows);
    openPreviewModal({ type:"award", rows, html });
  };
}


/* ========= 小工具 ========= */
function toast(msg){ alert(msg); }

function normalizeRes(s){
  const t = String(s||"").trim();
  if(!t) return "";
  const map = {
    "第一名":"第一名","第二名":"第二名","第三名":"第三名",
    "特優":"特優","優等":"優等","佳作":"佳作",
    "金牌":"金牌","銀牌":"銀牌","銅牌":"銅牌","金質獎":"金質獎","銀質獎":"銀質獎","銅質獎":"銅質獎"
  };
  for(const k of Object.keys(map)) if(t.includes(k)) return map[k];
  return t;
}

function buildEmceeParagraph(rows){
  const groups = {};
  rows.forEach(r=>{
    const reason = (r.事由||"").trim();
    const cls = (r.班級||"").toString().trim();
    const name = (r.姓名||"").toString().trim();
    const rank = normalizeRes(r.成績);
    if(!groups[reason]) groups[reason] = [];
    groups[reason].push({cls,name,rank});
  });

  const lines = Object.entries(groups).map(([reason,list])=>{
    const seg = list.map(s => `${s.cls}班${s.name}${s.rank?`榮獲${s.rank}`:""}`).join("、");
    return `${reason}：${seg}，恭請校長頒獎。`;
  });

  return `
    <div class="award-card">
      <div class="award-title">🏆 頒獎典禮司儀稿（自動彙整）</div>
      <div class="award-tip">貼到 Google 文件可再微調。</div>
      <div style="line-height:1.9">${lines.map(l=>`<p>${l}</p>`).join("")||"<div class='muted'>尚未勾選資料</div>"}</div>
    </div>
  `;
}

function buildAwardCardHTML(rows){
  const items = rows.map(r=>{
    const cls = (r["班級"]||"").toString().trim();
    const seat = (r["座號"]||"").toString().trim();
    const name = (r["姓名"]||"").toString().trim();
    const reason = (r["事由"]||"").toString().trim();
    const res = normalizeRes(r["成績"]);
    const award = (r["獎懲種類"]||"").toString().trim();
    const desc = `${reason}${res?`，${res}`:""}${award?`（${award}）`:""}`;
    return `
      <div class="award-item">
        <div class="award-badge">${cls}班</div>
        <div class="award-badge">座${seat}</div>
        <div class="award-name">${name}</div>
        <div class="award-desc">${desc}</div>
      </div>`;
  }).join("");

  return `
    <div class="award-card">
      <div class="award-title">📄 獎懲建議表（預覽）</div>
      <div class="award-tip">確認內容後再按下方「匯出」產生正式文件。</div>
      <div class="award-list">${items || `<div class="muted">尚未勾選資料</div>`}</div>
    </div>
  `;
}

/* ========= 假資料容器（實務從後端讀） ========= */
let rows = []; // 每筆：{id,班級,座號,姓名,事由,成績,獎懲種類}

/* 右側表格渲染 */
function render(){
  const q = (inputQ.value||"").trim();
  const list = rows.filter(r=>{
    if(!q) return true;
    const s = `${r.班級} ${r.座號} ${r.姓名} ${r.事由} ${r.成績}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

  tb.innerHTML = list.map(r=>`
    <tr data-id="${r.id}">
      <td><input class="row-check" type="checkbox"></td>
      <td>${r.班級||""}</td>
      <td>${r.座號||""}</td>
      <td>${r.姓名||""}</td>
      <td>${r.事由||""}</td>
      <td>${r.成績||""}</td>
    </tr>
  `).join("");
}

/* 擷取勾選 */
function getCheckedRows(){
  const ids = [];
  tb.querySelectorAll(".row-check").forEach((ck)=>{
    if(ck.checked){
      const tr = ck.closest("tr");
      ids.push(tr.dataset.id);
    }
  });
  const arr = rows.filter(r=>ids.includes(r.id));
  return arr;
}

/* ========= 事件 ========= */
btnAdd.onclick = ()=>{
  if(!cClass.value || !cSeat.value || !cName.value){
    toast("請先填『班級 / 座號 / 姓名』");
    return;
  }
  rows.unshift({
    id: crypto.randomUUID(),
    班級: cClass.value.trim(),
    座號: cSeat.value.trim(),
    姓名: cName.value.trim(),
    事由: cReason.value.trim(),
    成績: cRank.value.trim(),
    獎懲種類: cAward.value.trim()
  });
  render();
  cName.value=""; cSeat.value=""; cReason.value=""; cRank.value="";
};

inputQ.oninput = render;
btnRefresh.onclick = render;
btnClear.onclick = ()=>{
  if(!confirm("確定清除目前清單？")) return;
  rows = [];
  render();
};

/* 司儀稿 */
btnEmcee.addEventListener("click", async ()=>{
  const items = getCheckedRows();
  if(!items.length) return toast("請至少勾選一筆");

  showModal("司儀稿（預覽）", buildEmceeParagraph(items));

  try{
    let json;
    try{
      const r = await fetch(WEB_APP_URL, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ action:"生成文件", type:"司儀稿", ids: items.map(x=>x.id) })
      });
      json = await r.json();
    }catch{
      const form = new URLSearchParams();
      form.set("action","生成文件");
      form.set("type","司儀稿");
      form.set("ids", JSON.stringify(items.map(x=>x.id)));
      const r2 = await fetch(WEB_APP_URL, { method:"POST", body:form });
      json = await r2.json();
    }
    if(json.status!=="success") throw new Error(json.message||"生成失敗");
    const { docUrl, pdfUrl } = json.data || {};
    openDocBtn.disabled = false;
    openPdfBtn.disabled = false;
    openDocBtn.onclick = ()=> window.open(docUrl,"_blank");
    openPdfBtn.onclick = ()=> window.open(pdfUrl,"_blank");
  }catch(e){
    toast("❌ 生成失敗：" + e.message);
  }
});

/* 敘獎單（獎懲建議表） */
btnAward.addEventListener("click", async ()=>{
  const items = getCheckedRows();
  if(!items.length) return toast("請至少勾選一筆");

  showModal("獎懲建議表（預覽）", buildAwardCardHTML(items));

  try{
    let json;
    try{
      const r = await fetch(WEB_APP_URL, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ action:"生成文件", type:"獎懲單製作", ids: items.map(x=>x.id) })
      });
      json = await r.json();
    }catch{
      const form = new URLSearchParams();
      form.set("action","生成文件");
      form.set("type","獎懲單製作");
      form.set("ids", JSON.stringify(items.map(x=>x.id)));
      const r2 = await fetch(WEB_APP_URL, { method:"POST", body:form });
      json = await r2.json();
    }
    if(json.status!=="success") throw new Error(json.message||"生成失敗");
    const { docUrl, pdfUrl } = json.data || {};
    openDocBtn.disabled = false;
    openPdfBtn.disabled = false;
    openDocBtn.onclick = ()=> window.open(docUrl,"_blank");
    openPdfBtn.onclick = ()=> window.open(pdfUrl,"_blank");
  }catch(e){
    toast("❌ 生成失敗：" + e.message);
  }
});

/* ========= 連線檢查（統一一個徽章） ========= */
async function pingBackend(){
  connBadge.classList.remove("success");
  connBadge.textContent = "後端連線狀態檢查中…";

  let ok = false;

  try {
    // 1) 先試 JSON
    try {
      const r = await fetch(WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ping" })
      });
      const j = await r.json().catch(()=>null);
      ok = j && (j.status === "success" || j.status === "ok");
    } catch (_) {}

    // 2) 不行就試 form-urlencoded
    if(!ok){
      try {
        const form = new URLSearchParams();
        form.set("action", "ping");
        const r2 = await fetch(WEB_APP_URL, { method: "POST", body: form });
        const j2 = await r2.json().catch(()=>null);
        ok = j2 && (j2.status === "success" || j2.status === "ok");
      } catch (_) {}
    }

    // 3) 仍不行就做 no-cors GET（保底：只要沒拋錯視為存活）
    if(!ok){
      await fetch(WEB_APP_URL, { method: "GET", mode: "no-cors" });
      ok = true;
    }

    if(ok){
      connBadge.textContent = "後端連線成功";
      connBadge.classList.add("success");  // 綠底白字
    }else{
      connBadge.textContent = "後端連線失敗";
      connBadge.classList.remove("success");
    }
  } catch (e) {
    connBadge.textContent = "後端連線失敗";
    connBadge.classList.remove("success");
  }
}


/* ========= 啟動 ========= */
render();
pingBackend(); // 載入即檢查

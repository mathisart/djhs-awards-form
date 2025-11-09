/* ========= 基本設定 ========= */
const WEB_APP_URL = (window.APP_CONFIG && window.APP_CONFIG.WEB_APP_URL) || "";
const AWARD_WRITE_LIMIT = 12;

/* ========= 狀態 & DOM ========= */
const tb          = document.querySelector("#tb");
const inputQ      = document.querySelector("#q");
const btnAdd      = document.querySelector("#btnAdd");
const btnEmcee    = document.querySelector("#btnEmcee");
const btnAward    = document.querySelector("#btnAward");
const btnRefresh  = document.querySelector("#btnRefresh");
const btnClear    = document.querySelector("#btnClear");
const connBadge   = document.querySelector("#connBadge");

/* 表單欄位 */
const cClass  = document.querySelector("#cClass");
const cSeat   = document.querySelector("#cSeat");
const cName   = document.querySelector("#cName");
const cDate   = document.querySelector("#cDate");
const cReason = document.querySelector("#cReason");
const cRank   = document.querySelector("#cRank");
const cAward  = document.querySelector("#cAward");

/* ========= Modal ========= */
const modal        = document.querySelector("#modal");
const modalTitle   = document.querySelector("#modalTitle");
const modalBody    = document.querySelector("#modalBody");
const modalClose   = document.querySelector("#modalClose");

const copyTextBtn  = document.querySelector("#copyTextBtn"); // 司儀稿專用（預設 hidden，app.js 再顯示）
const openDocBtn   = document.querySelector("#openDocBtn");  // 司儀稿=開 Docs；敘獎單=開 Sheet
const openPdfBtn   = document.querySelector("#openPdfBtn");  // 司儀稿/敘獎單 都下載 PDF

if (modalClose) modalClose.onclick = () => modal.classList.remove("active");


/* ========= 小工具 ========= */
function toast(msg){ alert(msg); }
function sanitizeFilename(s){
  return (s || "").replace(/[\s　]+/g,"").replace(/[\/\\\?\%\*\:\|\"\<\>]/g,"").slice(0,60);
}
function pick(obj, keys){
  for (const k of keys){ if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim(); }
  return "";
}
function buildFilenameFromRows(rows){
  if (!rows || rows.length === 0) return "輸出文件";
  const r = rows[0];
  const cls = pick(r, ["班級","class"]);
  const seat= pick(r, ["座號","seat"]);
  const rsn = pick(r, ["事由","reason"]);
  const base= sanitizeFilename(`${cls}${seat}-${rsn}` || "司儀稿");
  return (rows.length>1) ? `${base}_等${rows.length}筆` : base;
}

/* ========= 後端 API ========= */
async function apiPost(formParams){
  const res = await fetch(WEB_APP_URL, { method:"POST", body:formParams, mode:"cors", cache:"no-store" });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { status:"error", message:"非 JSON 回應" }; }
}

/** 敘獎單（試算表+PDF） */
async function createAwardDoc(rows){
  const form = new URLSearchParams();
  form.set("action","create_award_doc");
  form.set("rows", JSON.stringify(rows));
  const j = await apiPost(form);
  if (j && (j.ok || j.status==="success" || j.status==="ok")) {
    const d = j.data || j;
    return { ok:true, sheetUrl:d.sheetUrl, pdfUrl:d.pdfUrl, docUrl:d.docUrl, fileName:d.fileName };
  }
  throw new Error((j && j.message) || "建立敘獎單失敗");
}

/** 司儀稿：建立 Google 文件 + PDF（字級18px、微軟正黑體、行距1.8） */
async function createEmceeDoc(text){
  const form = new URLSearchParams();
  form.set("action","create_emcee_doc");
  form.set("text", text || "");
  const j = await apiPost(form);
  if (j && (j.ok || j.status==="success" || j.status==="ok")) {
    const d = j.data || j;
    return { ok:true, docUrl:d.docUrl, pdfUrl:d.pdfUrl, fileName:d.fileName };
  }
  throw new Error((j && j.message) || "建立司儀稿文件失敗");
}

/* ========= 複製文字 ========= */
async function copyTextToClipboard(text){
  try{
    await navigator.clipboard.writeText(text || "");
    toast("已複製文字到剪貼簿");
  }catch{
    const ta = document.createElement("textarea");
    ta.value = text || "";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("已複製文字到剪貼簿");
  }
}

/* ========= 司儀稿：同場快取，避免重複產檔 ========= */
let emceeCache = null; // { text, docUrl, pdfUrl, fileName }
function resetEmceeCache(){ emceeCache = null; }
async function ensureEmceeExport(text){
  if (emceeCache && emceeCache.text === (text||"")) return emceeCache;
  const out = await createEmceeDoc(text||"");
  emceeCache = { text: (text||""), ...out };
  return emceeCache;
}

/* ========= Modal 入口 =========
   options = { type:'emcee'|'award', rows, html, text, sheetUrl?, pdfUrl?, docUrl?, fileName? }
*/
function openPreviewModal(options){
  if (!modal || !openDocBtn || !openPdfBtn) { console.error("Modal/Btn 缺少節點"); return; }

  const { type, rows, html, text } = options || {};
  const filename = buildFilenameFromRows(rows);

  modalTitle.textContent = (type === "emcee") ? "司儀稿（預覽）" : "獎懲建議表（預覽）";
  modalBody.innerHTML    = html || "";
  modal.classList.add("active");

  // reset（包含第三顆按鈕）
  if (copyTextBtn){ copyTextBtn.onclick = null; copyTextBtn.style.display = "none"; copyTextBtn.disabled = false; }
  openDocBtn.onclick = null; openPdfBtn.onclick = null;
  openDocBtn.disabled = false; openPdfBtn.disabled = false;

  if (type === "emcee"){
    // 顯示第三顆「複製文字」按鈕
    if (copyTextBtn){
      copyTextBtn.style.display = "";
      copyTextBtn.textContent = "複製文字";
      copyTextBtn.onclick = () => copyTextToClipboard(text || "");
    }

    // 司儀稿：openDoc=開 Docs；openPdf=下載 PDF（共用同一次後端產檔）
    openDocBtn.textContent = "開啟 Google 文件";
    openPdfBtn.textContent = "匯出 PDF";

    openDocBtn.onclick = async ()=>{
      try{
        openDocBtn.disabled = true;
        const out = await ensureEmceeExport(text || "");
        if (out && out.docUrl) window.open(out.docUrl, "_blank");
        else toast("無法取得 Google 文件連結。");
      }catch(e){
        console.error(e); toast("建立文件失敗，請稍後再試。");
      }finally{ openDocBtn.disabled = false; }
    };

    openPdfBtn.onclick = async ()=>{
      try{
        openPdfBtn.disabled = true;
        const out = await ensureEmceeExport(text || "");
        if (out && out.pdfUrl){
          const a = document.createElement("a");
          a.href = out.pdfUrl;
          a.download = (out.fileName || filename) + ".pdf";
          document.body.appendChild(a); a.click(); a.remove();
        }else{
          toast("無法取得 PDF 連結。");
        }
      }catch(e){
        console.error(e); toast("建立 PDF 失敗，請稍後再試。");
      }finally{ openPdfBtn.disabled = false; }
    };

  } else {
    // 敘獎單：openDoc=開啟試算表；openPdf=下載後端 PDF
    if (copyTextBtn) copyTextBtn.style.display = "none";
    openDocBtn.textContent = "匯出試算表";
    openPdfBtn.textContent = "匯出 PDF";

    openDocBtn.onclick = async ()=>{
      try{
        if (options.docUrl || options.sheetUrl) return window.open(options.docUrl || options.sheetUrl, "_blank");
        openDocBtn.disabled = true;
        const out = await createAwardDoc(rows.slice(0, AWARD_WRITE_LIMIT));
        if (out.docUrl || out.sheetUrl) window.open(out.docUrl || out.sheetUrl, "_blank");
        else toast("無法取得試算表連結。");
      }catch(e){
        console.error(e); toast("建立試算表失敗，請稍後再試。");
      }finally{ openDocBtn.disabled = false; }
    };

    openPdfBtn.onclick = async ()=>{
      try{
        openPdfBtn.disabled = true;
        const out = await createAwardDoc(rows.slice(0, AWARD_WRITE_LIMIT));
        if (out && out.pdfUrl){
          const a = document.createElement("a");
          a.href = out.pdfUrl;
          a.download = (out.fileName || "獎懲公告") + ".pdf";
          document.body.appendChild(a); a.click(); a.remove();
        } else {
          toast("無法取得 PDF 連結。");
        }
      }catch(e){
        console.error(e); toast("建立 PDF 失敗，請稍後再試。");
      }finally{ openPdfBtn.disabled = false; }
    };
  }
}

/* ========= 名單渲染 ========= */
let rows = []; // {id, 班級, 座號, 姓名, 事由, 成績, 獎懲種類, 發生日期}

function render(){
  const q = (inputQ.value||"").trim().toLowerCase();
  const list = rows.filter(r=>{
    if(!q) return true;
    const s = `${r.班級} ${r.座號} ${r.姓名} ${r.事由} ${r.成績}`.toLowerCase();
    return s.includes(q);
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
function getSelectedRows(){
  const ids = [];
  tb.querySelectorAll(".row-check").forEach(ck=>{
    if (ck.checked){ ids.push(ck.closest("tr").dataset.id); }
  });
  return rows.filter(r=>ids.includes(r.id));
}

/* ========= 司儀稿內容生成 ========= */
function buildEmceePreviewHTML(sel){
  const byReason = {};
  sel.forEach(r=>{
    const reason = (r.事由||"").trim();
    if(!byReason[reason]) byReason[reason] = [];
    byReason[reason].push(r);
  });
  const parts = Object.entries(byReason).map(([reason, list])=>{
    const seg = list.map(x=>{
      const cls  = x.班級 ? `${x.班級}班` : "";
      const rank = x.成績 ? `榮獲${x.成績}` : "";
      return `${cls}${x.姓名}${rank}`;
    }).join("、");
    return `${reason}：${seg}，恭請校長頒獎。`;
  });

  const text = parts.join("\n");
  const html = `
    <div class="award-card">
      <div class="award-title">🏆 頒獎典禮司儀稿（自動彙整）</div>
      <div class="award-tip">貼到 Google 文件可再微調。</div>
      <div class="award-desc" style="line-height:1.9">${parts.map(p=>`<p>${p}</p>`).join("")}</div>
    </div>
  `;
  return { html, text };
}

/* ========= 事件 ========= */
if (btnAdd) btnAdd.onclick = async ()=>{
  if(!cClass.value || !cSeat.value || !cName.value){ toast("請先填『班級 / 座號 / 姓名』"); return; }
  const rec = {
    id: crypto.randomUUID(),
    班級: cClass.value.trim(),
    座號: cSeat.value.trim(),
    姓名: cName.value.trim(),
    發生日期: cDate.value.trim(),
    事由: cReason.value.trim(),
    成績: cRank.value.trim(),
    獎懲種類: cAward.value.trim()
  };
  rows.unshift(rec); render(); resetEmceeCache(); // 新增名單後，避免快取舊稿

  try{
    const form = new URLSearchParams();
    form.set("班級",rec.班級); form.set("座號",rec.座號); form.set("姓名",rec.姓名);
    form.set("發生日期",rec.發生日期); form.set("事由",rec.事由); form.set("獎懲種類",rec.獎懲種類);
    form.set("action","add_record");
    const j = await apiPost(form);
    if (!(j && (j.ok || j.status==="success"))) toast("已加入名單，但寫入試算表未確認成功。");
  }catch(e){ console.error(e); toast("已加入名單，但寫入試算表失敗。"); }

  cSeat.value=""; cName.value=""; cReason.value=""; cRank.value="";
};

if (inputQ) inputQ.oninput  = render;
if (btnRefresh) btnRefresh.onclick = render;
if (btnClear) btnClear.onclick = ()=>{ if(!confirm("確定清除目前清單？")) return; rows=[]; render(); resetEmceeCache(); };

if (btnEmcee) btnEmcee.onclick = ()=>{
  const sel = getSelectedRows();
  if(!sel.length) return toast("請先勾選至少一筆。");
  const { html, text } = buildEmceePreviewHTML(sel);
  openPreviewModal({ type:"emcee", rows:sel, html, text });
};

if (btnAward) btnAward.onclick = ()=>{
  const sel = getSelectedRows();
  if(!sel.length) return toast("請先勾選至少一筆。");
  if (sel.length > AWARD_WRITE_LIMIT) toast(`目前範本僅寫入第 4–15 列，共 ${AWARD_WRITE_LIMIT} 筆；已選 ${sel.length} 筆，將只輸出前 ${AWARD_WRITE_LIMIT} 筆。`);
  const html = `
    <div class="award-card">
      <div class="award-title">📄 獎懲建議表（預覽）</div>
      <div class="award-tip">確認內容後再按下方按鈕產生正式文件。</div>
    </div>`;
  openPreviewModal({ type:"award", rows:sel, html });
};

/* ========= 後端連線檢查 ========= */
async function pingBackend() {
  if (!connBadge) return;
  connBadge.classList.remove("success");
  connBadge.textContent = "後端連線狀態檢查中…";
  if (!WEB_APP_URL || !/^https?:\/\//i.test(WEB_APP_URL)) { connBadge.textContent = "未設定後端網址"; return; }
  const withTimeout = (p,ms=5000)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),ms))]);
  let ok = false;
  try{
    try{ const url = WEB_APP_URL + (WEB_APP_URL.includes("?")?"&":"?") + "_t=" + Date.now();
      await withTimeout(fetch(url,{method:"GET",mode:"no-cors",cache:"no-store"}),5000); ok = true; }catch{}
    if (!ok){
      try{
        const r = await withTimeout(fetch(WEB_APP_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"ping",_t:Date.now()})}),5000);
        const j = await r.json().catch(()=>null); ok = j && (j.ok || j.status==="success" || j.status==="ok");
      }catch{}
    }
  }catch{}
  if (ok){ connBadge.textContent = "後端連線成功"; connBadge.classList.add("success"); }
  else   { connBadge.textContent = "後端連線失敗"; connBadge.classList.remove("success"); }
}
if (connBadge) connBadge.addEventListener("click", pingBackend);

/* ========= 啟動 ========= */
render();
pingBackend();

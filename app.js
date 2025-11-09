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

/* ========= Modal（依類型切換按鈕） ========= */
const modal       = document.querySelector("#modal");
const modalTitle  = document.querySelector("#modalTitle");
const modalBody   = document.querySelector("#modalBody");
const modalClose  = document.querySelector("#modalClose");
const openDocBtn  = document.querySelector("#openDocBtn"); // 司儀稿=複製文字；敘獎單=匯出試算表
const openPdfBtn  = document.querySelector("#openPdfBtn"); // 兩者皆為匯出 PDF
modalClose.onclick = () => modal.classList.remove("active");

/* ========= 共用：小工具 ========= */
function toast(msg){ alert(msg); }

function sanitizeFilename(s){
  return (s || "")
    .replace(/[\s　]+/g, "")                 // 去空白
    .replace(/[\/\\\?\%\*\:\|\"\<\>]/g, "") // 禁字
    .slice(0, 60);
}
// 允許 rows 內鍵名為中文或英文
function pick(obj, keys){
  for (const k of keys){
    if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
  }
  return "";
}
// 檔名：班級 + 座號 + 事由；多筆：加 _等N筆
function buildFilenameFromRows(rows){
  if (!rows || rows.length === 0) return "輸出文件";
  const r = rows[0];
  const cls    = pick(r, ["班級","class"]);
  const seat   = pick(r, ["座號","seat"]);
  const reason = pick(r, ["事由","reason"]);
  const base   = sanitizeFilename(`${cls}${seat}-${reason}` || "輸出文件");
  return (rows.length > 1) ? `${base}_等${rows.length}筆` : base;
}

/* ========= 司儀稿：前端 PDF（新分頁開啟） ========= */
function ensureHtml2pdf(){
  return new Promise((resolve)=>{
    if (window.html2pdf) return resolve();
    const s = document.createElement("script");
    s.src   = "https://cdn.jsdelivr.net/npm/html2pdf.js@0.9.3/dist/html2pdf.bundle.min.js";
    s.onload= () => resolve();
    document.head.appendChild(s);
  });
}
async function exportEmceePdfNewTab(html, filename){
  await ensureHtml2pdf();

  // 先開新分頁，避免被視為彈窗
  const newWin = window.open('about:blank', '_blank');
  if (!newWin) {
    toast('被瀏覽器阻擋了，請允許此網頁開啟新分頁。');
    return;
  }

  const box = document.createElement("div");
  box.style.width = "794px"; // A4 寬（約 96dpi）
  box.style.padding = "16px";
  box.innerHTML = html;

  const opt = {
    margin: 10,
    filename: `${filename || "司儀稿"}.pdf`,
    image: { type:'jpeg', quality:0.98 },
    html2canvas: { scale:2, useCORS:true },
    jsPDF: { unit:'mm', format:'a4', orientation:'portrait' }
  };

  try{
    const worker = html2pdf().from(box).set(opt);
    const blob   = await worker.outputPdf('blob');
    const url    = URL.createObjectURL(blob);
    // 讓已開啟的新分頁載入 PDF
    newWin.location = url;

    // 60 秒後釋放 URL
    setTimeout(()=> URL.revokeObjectURL(url), 60000);
  }catch(e){
    console.error(e);
    newWin.close();
    toast('匯出 PDF 失敗，請稍後再試。');
  }
}

/* ========= 後端：建立敘獎單（試算表 & PDF） =========
   使用 x-www-form-urlencoded，避免 CORS 預檢
   後端預期：
     action=create_award_doc
     rows=<JSON 字串陣列>
   回傳 JSON（容忍多種鍵）：
     { ok:true, sheetUrl:'...', pdfUrl:'...' }
     或 { status:'success', sheetUrl:'...', pdfUrl:'...' }
*/
async function createAwardDoc(rows){
  const form = new URLSearchParams();
  form.set("action", "create_award_doc");
  form.set("rows", JSON.stringify(rows));

  const res  = await fetch(WEB_APP_URL, {
    method: "POST",
    body:   form,
    mode:   "cors",
    cache:  "no-store",
  });

  const txt  = await res.text();
  let data   = null;
  try { data = JSON.parse(txt); } catch { /* 不是 JSON */ }

  if (!data) throw new Error("後端無回應或格式錯誤");
  if (data.ok || data.status === "success" || data.status === "ok") {
    // 後端有時用 data.* 或頂層 *，都統一讀
    const d = data.data || data;
    return { ok:true, sheetUrl:d.sheetUrl, pdfUrl:d.pdfUrl, docUrl:d.docUrl };
  }
  throw new Error(data.message || "建立文件失敗");
}

/* ========= 後端：寫入〈獲獎名單〉（＋加入名單） =========
   不設 Content-Type，讓 fetch 自動用 x-www-form-urlencoded，避開預檢
   後端 doPost 會將同名欄位寫入（action 會被忽略）
*/
async function writeRecordToSheet(rec){
  const form = new URLSearchParams();
  form.set("班級", rec.班級 || "");
  form.set("座號", rec.座號 || "");
  form.set("姓名", rec.姓名 || "");
  form.set("發生日期", rec.發生日期 || "");
  form.set("事由", rec.事由 || "");
  form.set("獎懲種類", rec.獎懲種類 || "");
  // 附帶 action 但後端不依賴它（僅為語意註記）
  form.set("action", "add_record");

  const res = await fetch(WEB_APP_URL, { method:"POST", body:form, mode:"cors", cache:"no-store" });
  const txt = await res.text();
  try {
    const j = JSON.parse(txt);
    if (j.status === "success" || j.ok === true) return true;
  } catch { /* 後端可能回純文字 */ }
  return false;
}

/* ========= 共用：複製文字 ========= */
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

/* ========= 預覽 Modal 入口 =========
   options = { type:'emcee'|'award', rows, html, text, sheetUrl?, pdfUrl?, docUrl? }
*/
function openPreviewModal(options){
  const { type, rows, html, text } = options || {};
  const filename = buildFilenameFromRows(rows);

  modalTitle.textContent = (type === "emcee") ? "司儀稿（預覽）" : "獎懲建議表（預覽）";
  modalBody.innerHTML    = html || "";
  modal.classList.add("active");

  // 清事件
  openDocBtn.onclick = null;
  openPdfBtn.onclick = null;
  openDocBtn.disabled = false;
  openPdfBtn.disabled = false;

  if (type === "emcee"){
    // 司儀稿：openDoc=複製文字；openPdf=前端 PDF（新分頁）
    openDocBtn.textContent = "複製文字";
    openPdfBtn.textContent = "匯出 PDF";

    openDocBtn.onclick = () => copyTextToClipboard(text || "");
    openPdfBtn.onclick = async () => {
      try{
        const htmlForPdf = html || `<div style="line-height:1.8;font-size:14px">${(text||"").replace(/\n/g,"<br>")}</div>`;
        await exportEmceePdfNewTab(htmlForPdf, filename);
      }catch(e){
        console.error(e);
        toast("開啟 PDF 失敗，請稍後再試。");
      }
    };

  } else {
    // 敘獎單：openDoc=匯出試算表；openPdf=後端 PDF
    openDocBtn.textContent = "匯出試算表";
    openPdfBtn.textContent = "匯出 PDF";

    openDocBtn.onclick = async () => {
      try{
        // 若已有連結就直接開
        if (options.docUrl || options.sheetUrl) {
          return window.open(options.docUrl || options.sheetUrl, "_blank");
        }
        openDocBtn.disabled = true;
        const out = await createAwardDoc(rows);
        if (out.docUrl || out.sheetUrl) window.open(out.docUrl || out.sheetUrl, "_blank");
        else toast("無法取得試算表連結。");
      }catch(e){
        console.error(e);
        toast("建立試算表失敗，請稍後再試。");
      }finally{
        openDocBtn.disabled = false;
      }
    };

    openPdfBtn.onclick = async () => {
  try{
    // 預設檔名（fallback）：獎懲公告_MM-dd
    const pad = n => String(n).padStart(2,'0');
    const now = new Date();
    const fallbackName = `獎懲公告_${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

    const applyDownload = async (url, nameBase) => {
      try{
        const r = await fetch(url, { mode:"cors" });
        const b = await r.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `${nameBase || fallbackName}.pdf`; // ★ 這裡用固定命名
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      }catch{
        window.open(url, "_blank");
      }
    };

    if (options.pdfUrl) {
      return applyDownload(options.pdfUrl, fallbackName);
    }

    openPdfBtn.disabled = true;
    const out = await createAwardDoc(rows);
    const nameBase = (out && out.fileName) ? out.fileName : fallbackName; // ★ 以後端 fileName 為主
    if (out && out.pdfUrl) await applyDownload(out.pdfUrl, nameBase);
    else toast("無法取得 PDF 連結。");

  }catch(e){
    console.error(e);
    toast("建立 PDF 失敗，請稍後再試。");
  }finally{
    openPdfBtn.disabled = false;
  }
};


/* ========= 列表 & 名單 ========= */
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
    if (ck.checked){
      const tr = ck.closest("tr");
      ids.push(tr.dataset.id);
    }
  });
  return rows.filter(r=>ids.includes(r.id));
}

/* ========= 預覽內容產生器 ========= */
// 司儀稿（卡片 + 一行式彙整）
function buildEmceePreviewHTML(sel){
  const byReason = {};
  sel.forEach(r=>{
    const reason = (r.事由||"").trim();
    if(!byReason[reason]) byReason[reason] = [];
    byReason[reason].push(r);
  });
  const parts = Object.entries(byReason).map(([reason,list])=>{
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

// 敘獎單（卡片）
function buildAwardPreviewHTML(sel){
  const badge = (t)=>`<span class="award-badge">${t}</span>`;
  const items = sel.map(r=>`
    <div class="award-item">
      ${badge(`${r.班級||""}班`)}
      ${badge(`座${r.座號||""}`)}
      <div class="award-name">${r.姓名||""}</div>
      <div class="award-desc">${r.事由||""}${r.成績?`，${r.成績}`:""}${r.獎懲種類?`（${r.獎懲種類}）`:""}</div>
    </div>
  `).join("");
  return `
    <div class="award-card">
      <div class="award-title">📄 獎懲建議表（預覽）</div>
      <div class="award-tip">確認內容後再按下方「匯出」，產生正式文件。</div>
      <div class="award-list">${items || `<div class="muted">尚未勾選資料</div>`}</div>
    </div>
  `;
}

/* ========= 事件 ========= */
btnAdd.onclick = async ()=>{
  if(!cClass.value || !cSeat.value || !cName.value){
    toast("請先填『班級 / 座號 / 姓名』");
    return;
  }

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

  // 1) 先寫入前端名單並顯示
  rows.unshift(rec);
  render();

  // 2) 後台寫入 Google 試算表（非阻塞，但給回饋）
  try{
    const ok = await writeRecordToSheet(rec);
    if (!ok) toast("已加入名單，但寫入試算表未確認成功。");
  }catch(e){
    console.error(e);
    toast("已加入名單，但寫入試算表失敗。");
  }

  // 清空（保留班級）
  cSeat.value=""; cName.value=""; cReason.value=""; cRank.value="";
};

inputQ.oninput  = render;
btnRefresh.onclick = render;

btnClear.onclick = ()=>{
  if(!confirm("確定清除目前清單？")) return;
  rows = [];
  render();
};

btnEmcee.onclick = ()=>{
  const sel = getSelectedRows();
  if(!sel.length) return toast("請先勾選至少一筆。");
  const { html, text } = buildEmceePreviewHTML(sel);
  openPreviewModal({ type:"emcee", rows:sel, html, text });
};

btnAward.onclick = ()=>{
  const sel = getSelectedRows();
  if(!sel.length) return toast("請先勾選至少一筆。");
  if (sel.length > AWARD_WRITE_LIMIT) {
    toast(`目前範本僅寫入第 4–15 列，共 ${AWARD_WRITE_LIMIT} 筆；已選 ${sel.length} 筆，將只輸出前 ${AWARD_WRITE_LIMIT} 筆。`);
  }
  const html = buildAwardPreviewHTML(sel);
  openPreviewModal({ type:"award", rows:sel, html });
};


/* ========= 單一徽章：後端連線檢查（加強版） ========= */
async function pingBackend() {
  if (!connBadge) return;
  connBadge.classList.remove("success");
  connBadge.textContent = "後端連線狀態檢查中…";

  // 1) 未設定
  if (!WEB_APP_URL || !/^https?:\/\//i.test(WEB_APP_URL)) {
    connBadge.textContent = "未設定後端網址";
    connBadge.classList.remove("success");
    return;
  }

  // 小工具：加上逾時
  const withTimeout = (p, ms=5000) =>
    Promise.race([ p, new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")), ms)) ]);

  let ok = false;

  try {
    // 2) 先 GET no-cors（只要可連就視為成功）
    try {
      const url = WEB_APP_URL + (WEB_APP_URL.includes("?") ? "&" : "?") + "_t=" + Date.now();
      await withTimeout(fetch(url, { method:"GET", mode:"no-cors", cache:"no-store" }), 5000);
      ok = true;
    } catch (_) {}

    // 3) 再試 POST(JSON)
    if (!ok) {
      try {
        const r = await withTimeout(fetch(WEB_APP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ping", _t: Date.now() })
        }), 5000);
        const j = await r.json().catch(()=>null);
        ok = j && (j.ok || j.status === "success" || j.status === "ok");
      } catch (_) {}
    }

    // 4) 最後 POST(form)
    if (!ok) {
      try {
        const form = new URLSearchParams();
        form.set("action", "ping");
        form.set("_t", String(Date.now()));
        const r2 = await withTimeout(fetch(WEB_APP_URL, { method: "POST", body: form }), 5000);
        const j2 = await r2.json().catch(()=>null);
        ok = j2 && (j2.ok || j2.status === "success" || j2.status === "ok");
      } catch (_) {}
    }
  } catch (_) {
    ok = false;
  }

  if (ok) {
    connBadge.textContent = "後端連線成功";
    connBadge.classList.add("success"); // 綠底白字
  } else {
    connBadge.textContent = "後端連線失敗";
    connBadge.classList.remove("success");
  }
}
if (connBadge) connBadge.addEventListener("click", pingBackend);

/* ========= 啟動 ========= */
render();
pingBackend();

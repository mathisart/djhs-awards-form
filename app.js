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
const btnPing = document.querySelector("#btnPing");
const connBadge = document.querySelector("#connBadge");

/* 表單欄位 */
const cClass = document.querySelector("#cClass");
const cSeat  = document.querySelector("#cSeat");
const cName  = document.querySelector("#cName");
const cDate  = document.querySelector("#cDate");
const cReason= document.querySelector("#cReason");
const cRank  = document.querySelector("#cRank");
const cAward = document.querySelector("#cAward");

/* Modal */
const modal = document.querySelector("#modal");
const modalTitle = document.querySelector("#modalTitle");
const modalBody  = document.querySelector("#modalBody");
const modalClose = document.querySelector("#modalClose");
const openDocBtn = document.querySelector("#openDocBtn");
const openPdfBtn = document.querySelector("#openPdfBtn");

function showModal(title, html){
  modalTitle.textContent = title || "預覽";
  modalBody.innerHTML = html || "";
  // 預設先把匯出按鈕設成 disabled，等後端成功再綁定
  openDocBtn.disabled = true;
  openPdfBtn.disabled = true;
  openDocBtn.onclick = null;
  openPdfBtn.onclick = null;
  modal.classList.add("active");
}
modalClose.onclick = () => modal.classList.remove("active");

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
  // 司儀稿：同一比賽聚合
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

function selectedIds(){ return getCheckedRows().map(r=>r.id); }

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
  cName.value=""; cSeat.value=""; cReason.value=""; cRank.value=""; /* 保留班級 */
};

inputQ.oninput = render;
btnRefresh.onclick = render;
btnClear.onclick = ()=>{
  if(!confirm("確定清除目前清單？")) return;
  rows = [];
  render();
};

btnPing.onclick = async ()=>{
  try{
    const res = await fetch(WEB_APP_URL, { method:"GET", mode:"cors" });
    connBadge.textContent = "後端連線成功";
    connBadge.classList.add("success");
  }catch{
    connBadge.textContent = "後端連線失敗";
    connBadge.classList.remove("success");
  }
};

/* 司儀稿 */
btnEmcee.addEventListener("click", async ()=>{
  const items = getCheckedRows();
  if(!items.length) return toast("請至少勾選一筆");

  // 先顯示預覽
  showModal("司儀稿（預覽）", buildEmceeParagraph(items));

  // 背景生成文件（可用同一個 action，由後端決定模板）
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

  // 卡片式預覽
  showModal("獎懲建議表（預覽）", buildAwardCardHTML(items));

  // 背景呼叫後端建檔：不顯示連結，只把匯出綁到按鈕
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

/* ========= 啟動：初始資料 or 後端載入 ========= */
/* 這裡先用空陣列；如果你原本有「讀取後端」函式，呼叫後 render() 即可 */
render();

/* ========= 連線徽章：開站即嘗試 ping 一次 ========= */
btnPing.click();

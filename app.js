/* app.js — DJHS 獎懲系統前端 */
(function () {
  // ─────────────────────────────────────────────────────────────
  // 工具
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const toast = (m) => alert(m);

  const WEB_APP_URL = (window.APP_CONFIG && window.APP_CONFIG.WEB_APP_URL) || "";
  if (!WEB_APP_URL) console.warn("WEB_APP_URL 未設定，請在 config.js 設定");

  const fmtDate = (v) => {
    const d = new Date(v);
    if (isNaN(d)) return v || "";
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const toROC = (v) => {
    const d = new Date(v);
    if (isNaN(d)) return "";
    return `中華民國 ${d.getFullYear() - 1911} 年 ${String(d.getMonth() + 1).padStart(2, "0")} 月 ${String(d.getDate()).padStart(2, "0")} 日`;
  };

  // ─────────────────────────────────────────────────────────────
  // DOM
  const clsInput   = $("#clsInput");
  const seatInput  = $("#seatInput");
  const nameInput  = $("#nameInput");
  const dateInput  = $("#dateInput");
  const reasonInput= $("#reasonInput");
  const resultInput= $("#resultInput");
  const awardInput = $("#awardInput");

  const addBtn = $("#addBtn");
  const backendStatus = $("#backendStatus");

  const q = $("#q");
  const tbody = $("#tbody");
  const countEl = $("#count");
  const refreshBtn = $("#refreshBtn");
  const clearBtn = $("#clearBtn");

  const btnEmcee = $("#btnEmcee");
  const btnAward = $("#btnAward");

  // Modal
  const backdrop = $("#backdrop");
  const docBody  = $("#docBody");
  const modalTitle = $("#modalTitle");
  const copyBtn = $("#copyBtn");
  const downloadPdfBtn = $("#downloadPdfBtn");
  const closeModal = $("#closeModal");

  // 資料快取
  let _cacheList = [];

  // ─────────────────────────────────────────────────────────────
  // 後端讀取資料
  async function loadList() {
    try {
      const res = await fetch(WEB_APP_URL, { method: "GET" });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "讀取失敗");

      // 狀態顯示：綠底白字
      backendStatus.style.display = "inline-flex";
      backendStatus.className = "status-pill badge-ok";
      backendStatus.textContent = "後端連線成功";

      _cacheList = json.data || [];
      renderTable(_cacheList);
    } catch (e) {
      console.error(e);
      backendStatus.style.display = "inline-flex";
      backendStatus.className = "status-pill";
      backendStatus.textContent = "後端連線失敗";
      _cacheList = [];
      renderTable(_cacheList);
    }
  }

  // 渲染清單（只呈現：班級、座號、姓名、事由、成績）
  function renderTable(list) {
    const kw = (q.value || "").toLowerCase();
    const rows = (list || [])
      .filter((o) => {
        const s = `${o["班級"] || ""} ${o["座號"] || ""} ${o["姓名"] || ""} ${o["事由"] || ""} ${o["成績"] || ""}`.toLowerCase();
        return !kw || s.includes(kw);
      })
      .map(o => {
        return `
        <tr>
          <td style="width:54px"><input type="checkbox" class="rowchk" value="${o["編號"] || ""}"></td>
          <td style="width:80px">${o["班級"] || ""}</td>
          <td style="width:80px">${o["座號"] || ""}</td>
          <td style="width:160px">${o["姓名"] || ""}</td>
          <td>${o["事由"] || ""}</td>
          <td style="width:120px">${o["成績"] || ""}</td>
        </tr>`;
      }).join("");

    tbody.innerHTML = rows || `<tr><td colspan="6" style="text-align:center;color:#6b7280;padding:22px">尚無資料</td></tr>`;
    countEl.textContent = String(list.length || 0);

    // 綁定勾選
    $$(".rowchk").forEach(chk => chk.addEventListener("change", updateButtons));
    updateButtons();
  }

  function selectedIds(){
    return $$(".rowchk").filter(x=>x.checked).map(x=>x.value);
  }
  function getCheckedRows(){
    return $$(".rowchk:checked").map(chk => {
      const t = chk.closest("tr").children;
      return {
        班級: t[1].innerText.trim(),
        座號: t[2].innerText.trim(),
        姓名: t[3].innerText.trim(),
        事由: t[4].innerText.trim(),
        成績: t[5].innerText.trim()
      };
    });
  }

  function updateButtons(){
    const n = selectedIds().length;
    const enable = n >= 1;
    btnEmcee.disabled = !enable;
    btnAward.disabled = !enable;

    // 勾選 ≥2 筆時視覺強調（藍底白字已是預設色，這裡加上陰影放大）
    if (n >= 2){
      btnEmcee.classList.add("cta");
      btnAward.classList.add("cta");
    }else{
      btnEmcee.classList.remove("cta");
      btnAward.classList.remove("cta");
    }
  }

  // 搜尋/刷新
  q.addEventListener("input", () => renderTable(_cacheList));
  refreshBtn.addEventListener("click", loadList);

  // 清除紀錄（前端清空快取並重繪，不影響試算表）
  clearBtn.addEventListener("click", () => {
    if (!confirm("只會清除前端目前載入的清單，不會影響試算表。\n確定要清除嗎？")) return;
    _cacheList = [];
    renderTable(_cacheList);
  });

  // 新增一筆
  addBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const payload = {
      班級: (clsInput.value||"").trim(),
      座號: (seatInput.value||"").trim(),
      姓名: (nameInput.value||"").trim(),
      發生日期: fmtDate(dateInput.value),
      事由: (reasonInput.value||"").trim(),
      成績: (resultInput.value||"").trim(),
      獎懲種類: (awardInput.value||"").trim(),
    };
    if (!payload.班級 || !payload.座號 || !payload.姓名 || !payload.事由){
      return toast("請完整填寫：班級、座號、姓名與事由");
    }
    try{
      const res = await fetch(WEB_APP_URL, { method:"POST", body: new URLSearchParams(payload) });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message||"寫入失敗");
      toast("✅ 已加入名單");
      // 重新讀取
      await loadList();
      // 清表單保留日期
      reasonInput.value = "";
      resultInput.value = "";
      awardInput.value = "";
    }catch(err){
      toast("❌ 寫入失敗：" + err.message);
    }
  });

  // 司儀稿（預覽 / 複製 / 匯出 PDF）
  const EMCEE_SUFFIX = "恭請校長頒獎。";
  const NAME_JOINER = "、";
  // 將同一比賽合併，事由為比賽名稱，成績只取名次字樣（第一名、第二名、第三名、特優、優等…）
  function normalizeResult(r){
    const list = ["第一名","第二名","第三名","特優","優等","佳作","金牌","銀牌","銅牌","金質獎","銀質獎","銅質獎"];
    const s = String(r||"").trim();
    for (const w of list) if (s.includes(w)) return w;
    return s; // fallback
  }
  function splitCompetition(s){
    // 直接把整個事由視為「比賽名稱/事件」，不帶獎懲名，避免出現在司儀稿
    const comp = String(s||"").trim();
    return comp;
  }
  function buildEmceeHTML(){
    const rows = getCheckedRows();
    if (!rows.length) { toast("請至少勾選一筆"); return ""; }

    // 依「比賽名稱」分組
    const byComp = new Map();
    for (const r of rows){
      const comp = splitCompetition(r.事由);
      const res  = normalizeResult(r.成績);
      const phrase = `${r.班級}班${r.姓名}${res ? `獲得${res}` : ""}`;
      if (!byComp.has(comp)) byComp.set(comp, []);
      byComp.get(comp).push({ phrase, cls:r.班級 });
    }

    const lines = [];
    for (const [comp, list] of byComp.entries()){
      // 依班級排序
      list.sort((a,b)=> Number(a.cls) - Number(b.cls));
      const joined = list.map(x=>x.phrase).join(NAME_JOINER);
      // 同一場比賽寫在一起
      lines.push(`${comp}，${joined}，${EMCEE_SUFFIX}`);
    }

    const today = toROC(new Date());
    return `
      <h3 style="margin:0 0 8px">頒獎典禮司儀稿（預覽）</h3>
      <div style="color:#6b7280">${today}</div>
      <div style="line-height:1.9;margin-top:10px">
        ${lines.map(p=>`<p style="margin:0 0 10px">${p}</p>`).join("")}
      </div>
    `;
  }

  function showModal(title, html){
    modalTitle.textContent = title;
    docBody.innerHTML = html;
    backdrop.style.display = "flex";
  }
  closeModal.addEventListener("click", ()=> backdrop.style.display="none");
  copyBtn.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(docBody.innerText);
      toast("已複製");
    }catch{ toast("無法複製"); }
  });
  downloadPdfBtn.addEventListener("click", () => {
    if (!window.html2pdf) return toast("找不到 html2pdf 套件");
    window.html2pdf().from(docBody).set({
      margin:10,
      filename:`司儀稿_${Date.now()}.pdf`,
      jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}
    }).save();
  });

  btnEmcee.addEventListener("click", ()=>{
    const html = buildEmceeHTML();
    if (!html) return;
    showModal("頒獎典禮司儀稿（預覽）", html);
  });

  // 敘獎公告（與既有後端流程相同：把勾選 id 丟給後端生成）
  btnAward.addEventListener("click", async ()=>{
    const ids = selectedIds();
    if (!ids.length) return toast("請至少勾選一筆");

    try{
      // 首選 JSON
      const res = await fetch(WEB_APP_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ action:"生成文件", type:"獎懲單製作", ids })
      });
      const j = await res.json();
      if (j.status!=="success") throw new Error(j.message||"生成失敗");
      const { docUrl, pdfUrl } = j.data || {};
      const html = `
        <h3 style="margin:0 0 8px">敘獎公告已建立</h3>
        <p>試算表：<a class="mono" href="${docUrl}" target="_blank">${docUrl||""}</a></p>
        <p>PDF：<a class="mono" href="${pdfUrl}" target="_blank">${pdfUrl||""}</a></p>
        <p style="color:#6b7280">若無法開啟，請確認權限「知道連結者可檢視」。</p>
      `;
      showModal("敘獎公告輸出", html);
    }catch(e1){
      // fallback x-www-form-urlencoded
      try{
        const form = new URLSearchParams();
        form.set("action","生成文件");
        form.set("type","獎懲單製作");
        form.set("ids", JSON.stringify(ids));
        const res2 = await fetch(WEB_APP_URL,{ method:"POST", body:form });
        const j2 = await res2.json();
        if (j2.status!=="success") throw new Error(j2.message||"生成失敗");
        const { docUrl, pdfUrl } = j2.data || {};
        const html = `
          <h3 style="margin:0 0 8px">敘獎公告已建立</h3>
          <p>試算表：<a class="mono" href="${docUrl}" target="_blank">${docUrl||""}</a></p>
          <p>PDF：<a class="mono" href="${pdfUrl}" target="_blank">${pdfUrl||""}</a></p>
          <p style="color:#6b7280">若無法開啟，請確認權限「知道連結者可檢視」。</p>
        `;
        showModal("敘獎公告輸出", html);
      }catch(e2){
        toast("❌ 生成失敗：" + e2.message);
      }
    }
  });

  // 初始化
  loadList();
})();

/* app.js — 修正：
   1) 後端成功 → 綠底白字 / 失敗 → 紅底白字
   2) 清單只顯示「班級 / 座號 / 姓名 / 事由 / 成績」
*/

(function () {
  // 基本工具
  const $  = (s,el=document)=>el.querySelector(s);
  const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
  const toast = (m)=>alert(m);

  const WEB_APP_URL = (window.APP_CONFIG && window.APP_CONFIG.WEB_APP_URL) || "";
  if (!WEB_APP_URL) console.warn("WEB_APP_URL 未設定，請在 config.js 設定");

  // 日期格式
  const fmtDate = (v)=>{
    const d = new Date(v);
    if (isNaN(d)) return v || "";
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${dd}`;
  };

  // DOM
  const tbody        = $("#tbody");
  const countEl      = $("#count");
  const q            = $("#q");
  const btnEmcee     = $("#btnEmcee");
  const btnAward     = $("#btnAward");
  const topWarn      = $("#topWarn");
  const refreshBtn   = $("#refreshBtn");

  // Modal
  const backdrop     = $("#backdrop");
  const modalTitle   = $("#modalTitle");
  const docBody      = $("#docBody");
  const copyBtn      = $("#copyBtn");
  const closeModal   = $("#closeModal");
  const downloadPdfBtn = $("#downloadPdfBtn");

  // 緩存
  let _cacheList = [];

  // 後端讀取
  async function loadList() {
    try {
      const res = await fetch(WEB_APP_URL, { method:"GET" });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "讀取失敗");

      // 狀態：成功 → 綠底白字
      topWarn.textContent = "後端連線成功";
      topWarn.classList.remove("bad");
      topWarn.classList.add("ok");

      _cacheList = json.data || [];
      renderTable(_cacheList);
    } catch (err) {
      console.error(err);
      // 狀態：失敗 → 紅底白字
      topWarn.textContent = "後端連線失敗";
      topWarn.classList.remove("ok");
      topWarn.classList.add("bad");
      tbody.innerHTML = `<tr><td colspan="6" class="muted">無法連線後端</td></tr>`;
      countEl.textContent = "0";
      btnEmcee.disabled = btnAward.disabled = true;
    }
  }

  // 渲染（只顯示：班級、座號、姓名、事由、成績）
  function renderTable(list) {
    const kw = (q.value || "").trim().toLowerCase();
    const rows = list
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
        const rank = o["成績"] || ""; // 這裡對應「成績」欄
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
    countEl.textContent = list.length;
    updateButtons();
  }

  // 勾選
  function selectedIds() {
    return $$(".rowchk").filter(x=>x.checked).map(x=>x.value);
  }
  function getCheckedRows() {
    return $$(".rowchk:checked").map(chk => {
      const t = chk.closest("tr").children;
      return {
        班級:  t[1].innerText.trim(),
        座號:  t[2].innerText.trim(),
        姓名:  t[3].innerText.trim(),
        事由:  t[4].innerText.trim(),
        成績:  t[5].innerText.trim(),
      };
    });
  }
  function updateButtons() {
    const n = selectedIds().length;
    btnEmcee.disabled = btnAward.disabled = !n;
  }
  tbody.addEventListener("change", e=>{
    if (e.target.classList.contains("rowchk")) updateButtons();
  });

  // 搜尋 & 重新整理
  q.addEventListener("input",()=>renderTable(_cacheList));
  refreshBtn.addEventListener("click", e=>{ e.preventDefault(); loadList(); });

  // 表單送出
  $("#form").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries()); // 班級、座號、姓名、發生日期、事由、成績、獎懲種類
    try {
      const res = await fetch(WEB_APP_URL, {
        method:"POST",
        body:new URLSearchParams(payload)
      });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message||"寫入失敗");
      toast("✅ 已加入名單");
      e.target.reset();
      await loadList();
    } catch (err) {
      toast("❌ 寫入失敗："+err.message);
    }
  });

  // 司儀稿產生（同一比賽合併，固定「恭請校長頒獎。」且不顯示獎懲）
  btnEmcee.addEventListener("click", ()=>{
    const rows = getCheckedRows();
    if (!rows.length) return toast("請至少勾選一筆");

    // 以「事由」分組，同比賽整併
    const byComp = new Map();
    for (const r of rows) {
      const comp = (r.事由||"").trim();
      // 名次口語化：維持「第一名」「第二名」等（如果使用者已填入，就直接用）
      const phrase = `${r.班級}班${r.姓名}榮獲${r.成績||""}`;
      if (!byComp.has(comp)) byComp.set(comp, []);
      byComp.get(comp).push({ phrase, cls: r.班級 });
    }

    // 每組依班級排序，句尾固定「恭請校長頒獎。」
    const lines = [];
    for (const [comp, list] of byComp.entries()) {
      list.sort((a,b)=>Number(a.cls)-Number(b.cls));
      const joined = list.map(x=>x.phrase).join("、");
      lines.push(`${comp}，${joined}，恭請校長頒獎。`);
    }

    const html = `
      <h2 style="margin:0 0 8px;">頒獎典禮司儀稿（預覽）</h2>
      <div style="line-height:1.9;margin-top:8px;">
        ${lines.map(p=>`<p style="margin:0 0 8px;">${p}</p>`).join("")}
      </div>
    `;
    showModal("司儀稿預覽", html);
  });

  // 敘獎單：呼叫後端
  btnAward.addEventListener("click", async ()=>{
    const ids = selectedIds();
    if (!ids.length) return toast("請至少勾選一筆");
    try{
      const res = await fetch(WEB_APP_URL, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ action:"生成文件", type:"獎懲單製作", ids })
      });
      const json = await res.json();
      if (json.status!=="success") throw new Error(json.message||"生成失敗");
      const { docUrl, pdfUrl } = json.data || {};
      const html = `
        <h3 style="margin:0 0 8px;">敘獎公告已建立</h3>
        <p>試算表：<a class="mono" href="${docUrl}" target="_blank">${docUrl}</a></p>
        <p>PDF：<a class="mono" href="${pdfUrl}" target="_blank">${pdfUrl}</a></p>
        <p class="muted">若無法開啟，請確認權限「知道連結者可檢視」。</p>
      `;
      showModal("敘獎公告輸出", html);
    }catch(err){
      toast("❌ 生成失敗："+err.message);
    }
  });

  // Modal 控制
  function showModal(title, html){
    modalTitle.textContent = title;
    docBody.innerHTML = html;
    backdrop.style.display = "flex";
  }
  closeModal.addEventListener("click", ()=>backdrop.style.display="none");

  // 複製 / 匯出 PDF（前端轉出）
  copyBtn.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(docBody.innerText);
      toast("已複製");
    }catch{ toast("無法複製"); }
  });
  downloadPdfBtn.addEventListener("click", ()=>{
    if (!window.html2pdf) return toast("找不到 html2pdf 套件");
    window
      .html2pdf()
      .from(docBody)
      .set({
        margin:10,
        filename:`司儀稿_${Date.now()}.pdf`,
        jsPDF:{ unit:"mm", format:"a4", orientation:"portrait" }
      })
      .save();
  });

  // 初始化
  loadList();
})();

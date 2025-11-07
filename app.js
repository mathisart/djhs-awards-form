/* app.js — DJHS 獎懲系統前端（含成績欄位＆司儀稿 modal） */
(function () {
  // ========== 基本工具 ==========
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

  // ROC 日期（司儀稿預覽標題可用）
  const toROC = (v) => {
    const d = new Date(v);
    if (isNaN(d)) return "";
    return `中華民國 ${d.getFullYear() - 1911} 年 ${String(d.getMonth() + 1).padStart(2, "0")} 月 ${String(d.getDate()).padStart(2, "0")} 日`;
  };

  // ========== DOM ==========
  const tbody = $("#tbody");
  const countEl = $("#count");
  const q = $("#q");
  const btnEmcee = $("#btnEmcee");
  const btnAward = $("#btnAward");
  const topWarn = $("#topWarn");
  const backendStatus = $("#backendStatus");

  // Modal
  const backdrop = $("#backdrop");
  const modalTitle = $("#modalTitle");
  const docBody = $("#docBody");
  const copyBtn = $("#copyBtn");
  const downloadPdfBtn = $("#downloadPdfBtn");

  // ========== 後端讀取 ==========
  async function loadList() {
    try {
      const res = await fetch(WEB_APP_URL, { method: "GET" });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "讀取失敗");

      topWarn.textContent = "後端連線成功";
      topWarn.classList.remove("bad");
      topWarn.classList.add("ok");
      backendStatus.textContent = "已載入最新資料。";
      renderTable(json.data || []);
    } catch (e) {
      console.error(e);
      topWarn.textContent = "後端連線失敗";
      topWarn.classList.remove("ok");
      topWarn.classList.add("bad");
      backendStatus.textContent = "無法連線後端，請稍後重試。";
      tbody.innerHTML = '<tr><td colspan="10" class="empty">無法連線後端</td></tr>';
      countEl.textContent = "0";
      btnEmcee.disabled = btnAward.disabled = true;
    }
  }

  function renderTable(list) {
    const kw = (q.value || "").toLowerCase();
    const rows = list
      .filter((o) => {
        const s = `${o["編號"] || ""} ${o["班級"] || ""} ${o["座號"] || ""} ${o["姓名"] || ""} ${o["發生日期"] || ""} ${o["事由"] || ""} ${o["成績"] || ""} ${o["獎懲種類"] || ""}`.toLowerCase();
        return !kw || s.includes(kw);
      })
      .map(
        (o) => `
      <tr>
        <td><input type="checkbox" class="rowchk" value="${o["編號"] || ""}"></td>
        <td class="mono">${o["編號"] || ""}</td>
        <td>${o["班級"] || ""}</td>
        <td>${o["座號"] || ""}</td>
        <td>${o["姓名"] || ""}</td>
        <td>${fmtDate(o["發生日期"])}</td>
        <td>${o["事由"] || ""}</td>
        <td>${o["成績"] || ""}</td>
        <td>${o["獎懲種類"] || ""}</td>
        <td class="mono">${fmtDate(o["建立時間"])}</td>
      </tr>`
      )
      .join("");

    tbody.innerHTML = rows || `<tr><td colspan="10" class="empty">尚無資料</td></tr>`;
    countEl.textContent = list.length;
    updateButtons();
  }

  function selectedIds() {
    return $$(".rowchk")
      .filter((x) => x.checked)
      .map((x) => x.value);
  }
  function updateButtons() {
    const n = selectedIds().length;
    btnEmcee.disabled = btnAward.disabled = !n;
  }
  tbody.addEventListener("change", (e) => {
    if (e.target.classList.contains("rowchk")) updateButtons();
  });
  $("#toggleAllBtn").addEventListener("click", () => {
    const c = $$(".rowchk");
    const all = c.length && c.every((x) => x.checked);
    c.forEach((x) => (x.checked = !all));
    updateButtons();
  });
  $("#refreshBtn").addEventListener("click", loadList);
  q.addEventListener("input", loadList);

  // ========== 表單送出（加入名單） ==========
  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());

    // 留空也可（代表不敘獎），前端不自動填「法條依據」
    try {
      // 使用 x-www-form-urlencoded 避免預檢
      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        body: new URLSearchParams(payload),
      });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message);
      toast("✅ 已加入名單");
      e.target.reset();
      await loadList();
    } catch (err) {
      toast("❌ 寫入失敗：" + err.message);
    }
  });

  // ========== 司儀稿：同一事由（比賽）合併一句 ==========
  const EMCEE_SUFFIX = "恭請校長頒獎。"; // 固定寫法
  const NAME_JOINER = "、";

  // 輕度標準化成績（可自行擴充）
  function normalizeRank(rank) {
    if (!rank) return "";
    let s = String(rank).trim();
    // 常見寫法歸一
    s = s
      .replace(/第一(?=名)?/g, "第一名")
      .replace(/第二(?=名)?/g, "第二名")
      .replace(/第三(?=名)?/g, "第三名");
    return s;
  }
  function classKey(c) {
    const m = String(c || "").match(/\d+/);
    return m ? Number(m[0]) : 9999;
  }
  function getCheckedRows() {
    return $$(".rowchk:checked").map((chk) => {
      const t = chk.closest("tr").children;
      return {
        編號: t[1].innerText.trim(),
        班級: t[2].innerText.trim(),
        座號: t[3].innerText.trim(),
        姓名: t[4].innerText.trim(),
        發生日期: t[5].innerText.trim(),
        事由: t[6].innerText.trim(),
        成績: t[7].innerText.trim(), // 司儀稿用這個；不讀獎懲
      };
    });
  }
  function buildEmceePreviewHTML() {
    const rows = getCheckedRows();
    if (!rows.length) {
      toast("請至少勾選一筆");
      return "";
    }
    // 以「事由」做比賽名稱分組
    const byComp = new Map();
    for (const r of rows) {
      const comp = (r.事由 || "未填事由").trim();
      const rank = normalizeRank(r.成績);
      const phrase = `${r.班級}班${r.姓名}${rank ? `榮獲${rank}` : ""}`;
      if (!byComp.has(comp)) byComp.set(comp, []);
      byComp.get(comp).push({ phrase, cls: r.班級 });
    }

    const lines = [];
    for (const [comp, list] of byComp.entries()) {
      list.sort((a, b) => classKey(a.cls) - classKey(b.cls));
      const joined = list.map((x) => x.phrase).join(NAME_JOINER);
      lines.push(`${comp}，${joined}，${EMCEE_SUFFIX}`);
    }

    const today = toROC(new Date());
    return `
      <h2 style="margin:0 0 8px;">頒獎典禮司儀稿（預覽）</h2>
      <div style="color:#6b7280">${today}</div>
      <div style="line-height:1.9; margin-top:8px;">
        ${lines.map((p) => `<p style="margin:0 0 8px;">${p}</p>`).join("")}
      </div>
    `;
  }

  // 開啟司儀稿預覽
  btnEmcee.addEventListener("click", () => {
    const html = buildEmceePreviewHTML();
    if (!html) return;
    modalTitle.textContent = "頒獎典禮司儀稿（預覽）";
    docBody.innerHTML = html;
    backdrop.style.display = "flex";
  });

  // ========== 一鍵產出敘獎單（沿用原後端） ==========
  btnAward.addEventListener("click", async () => {
    const ids = selectedIds();
    if (!ids.length) return toast("請至少勾選一筆");

    try {
      // 先嘗試 JSON
      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "生成文件", type: "獎懲單製作", ids }),
      });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "生成失敗");

      const { docUrl, pdfUrl } = json.data || {};
      const html = `
        <h2 style="margin:0 0 8px;">敘獎單已建立</h2>
        ${docUrl ? `<p>試算表：<a class="mono" href="${docUrl}" target="_blank">${docUrl}</a></p>` : ""}
        ${pdfUrl ? `<p>PDF：<a class="mono" href="${pdfUrl}" target="_blank">${pdfUrl}</a></p>` : ""}
        <p class="muted">若無法開啟，請確認權限「知道連結者可檢視」。</p>
      `;
      modalTitle.textContent = "敘獎單輸出";
      docBody.innerHTML = html;
      backdrop.style.display = "flex";
    } catch (e1) {
      // fallback: x-www-form-urlencoded
      try {
        const form = new URLSearchParams();
        form.set("action", "生成文件");
        form.set("type", "獎懲單製作");
        form.set("ids", JSON.stringify(ids));
        const res2 = await fetch(WEB_APP_URL, { method: "POST", body: form });
        const json2 = await res2.json();
        if (json2.status !== "success") throw new Error(json2.message || "生成失敗");
        const { docUrl, pdfUrl } = json2.data || {};
        const html = `
          <h2 style="margin:0 0 8px;">敘獎單已建立</h2>
          ${docUrl ? `<p>試算表：<a class="mono" href="${docUrl}" target="_blank">${docUrl}</a></p>` : ""}
          ${pdfUrl ? `<p>PDF：<a class="mono" href="${pdfUrl}" target="_blank">${pdfUrl}</a></p>` : ""}
          <p class="muted">若無法開啟，請確認權限「知道連結者可檢視」。</p>
        `;
        modalTitle.textContent = "敘獎單輸出";
        docBody.innerHTML = html;
        backdrop.style.display = "flex";
      } catch (e2) {
        toast("❌ 生成失敗：" + e2.message);
      }
    }
  });

  // ========== Modal 控制 / 複製 / 匯出 PDF ==========
  $("#closeModal").addEventListener("click", () => (backdrop.style.display = "none"));

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(docBody.innerText);
      toast("已複製");
    } catch {
      toast("無法複製");
    }
  });

  downloadPdfBtn.addEventListener("click", () => {
    if (!window.html2pdf) return toast("找不到 html2pdf 套件");
    window
      .html2pdf()
      .from(docBody)
      .set({
        margin: 10,
        filename: `司儀稿_${Date.now()}.pdf`,
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .save();
  });

  // ========== 初始化 ==========
  loadList();
})();

/* app.js — DJHS 獎懲系統前端（GitHub Pages / Google Sites 皆可） */
(function () {
  // ─────────────────────────────────────────────────────────────
  // 基本工具
  // ─────────────────────────────────────────────────────────────
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const toast = (m) => alert(m);

  const WEB_APP_URL = (window.APP_CONFIG && window.APP_CONFIG.WEB_APP_URL) || "";
  if (!WEB_APP_URL) console.warn("WEB_APP_URL 未設定，請在 config.js 設定");

  const autoBasis = (r) =>
    r?.includes("嘉獎") ? "第四條第十六款" :
    r?.includes("小功") ? "第五條第十二款" : "";

  const fmtDate = (v) => {
    const d = new Date(v);
    if (isNaN(d)) return v || "";
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  // ROC 日期（預覽標題可用）
  const toROC = (v) => {
    const d = new Date(v);
    if (isNaN(d)) return "";
    return `中華民國 ${d.getFullYear() - 1911} 年 ${String(d.getMonth() + 1).padStart(2, "0")} 月 ${String(d.getDate()).padStart(2, "0")} 日`;
  };

  // ─────────────────────────────────────────────────────────────
  // DOM 元件
  // ─────────────────────────────────────────────────────────────
  const tbody = $("#tbody");
  const countEl = $("#count");
  const q = $("#q");
  const btnEmcee = $("#btnEmcee");
  const btnAward = $("#btnAward");

  const topWarn = $("#topWarn");
  const backendStatus = $("#backendStatus");

  // Modal（預覽窗）
  const backdrop = $("#backdrop");
  const modalTitle = $("#modalTitle");
  const docBody = $("#docBody");
  const copyBtn = $("#copyBtn");
  const openDocBtn = $("#openDocBtn");
  const openPdfBtn = $("#openPdfBtn");
  const downloadPdfBtn = $("#downloadPdfBtn");

  // ─────────────────────────────────────────────────────────────
  // 後端資料讀取與渲染
  // ─────────────────────────────────────────────────────────────
  async function loadList() {
    try {
      const res = await fetch(WEB_APP_URL, { method: "GET" });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "讀取失敗");

      topWarn.textContent = "後端連線成功";
      backendStatus.textContent = "已載入最新資料。";
      renderTable(json.data || []);
    } catch (e) {
      console.error(e);
      topWarn.textContent = "後端連線失敗";
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
        const s = `${o["編號"] || ""} ${o["班級"] || ""} ${o["座號"] || ""} ${o["姓名"] || ""} ${o["發生日期"] || ""} ${o["事由"] || ""} ${o["獎懲種類"] || ""} ${o["法條依據"] || ""}`.toLowerCase();
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
        <td>${o["獎懲種類"] || ""}</td>
        <td>${o["法條依據"] || ""}</td>
        <td>${fmtDate(o["建立時間"])}</td>
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

  // ─────────────────────────────────────────────────────────────
  // 表單送出（加入名單）
  // ─────────────────────────────────────────────────────────────
  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    if (!payload["法條依據"]) payload["法條依據"] = autoBasis(payload["獎懲種類"]) || "";

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
      $("#basisInput").value = "";
      await loadList();
    } catch (err) {
      toast("❌ 寫入失敗：" + err.message);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 司儀稿（預覽 → 複製／PDF）
  // 規格：同一「事由（榮獲前）」合併成單句：
  //  [比賽]，[701班王小明榮獲第一名、702班林佳宜榮獲第二名]，恭請校長頒獎。
  // ─────────────────────────────────────────────────────────────
  const EMCEE_SUFFIX = "恭請校長頒獎";
  const NAME_JOINER = "、";
  const RESULT_WHITELIST = [
    "第一名", "第二名", "第三名",
    "特優", "優等", "佳作",
    "金牌", "銀牌", "銅牌",
    "金質獎", "銀質獎", "銅質獎"
  ];

  function normalizeTail(s) {
    return String(s || "").trim().replace(/[，。．、：:；;]+$/g, "");
  }
  function splitByHonor(s) {
    const raw = normalizeTail(s);
    const i = raw.indexOf("榮獲");
    if (i <= 0) return { comp: raw, result: "" };
    const comp = raw
      .slice(0, i)
      .replace(/^(參加|於|在)/, "")
      .replace(/[，、。:：]+$/, "")
      .trim();
    const result = raw
      .slice(i + 2)
      .replace(/^[，、。:：]+/, "")
      .replace(/[，、。:：]+$/, "")
      .trim();
    return { comp: comp || "未填事由", result };
  }
  function normalizeResult(r) {
    const s = String(r || "").trim();
    if (RESULT_WHITELIST.includes(s)) return s;
    for (const w of RESULT_WHITELIST) if (s.includes(w)) return w;
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
        班級: t[2].innerText.trim(),
        座號: t[3].innerText.trim(),
        姓名: t[4].innerText.trim(),
        事由: t[6].innerText.trim(),
      };
    });
  }
  function buildEmceePreviewHTML() {
    const rows = getCheckedRows();
    if (!rows.length) {
      toast("請至少勾選一筆");
      return "";
    }
    // 以「比賽名稱（榮獲前）」分組
    const byComp = new Map();
    for (const r of rows) {
      const { comp, result } = splitByHonor(r.事由);
      const normResult = normalizeResult(result);
      const phrase = `${r.班級}班${r.姓名}${normResult ? `榮獲${normResult}` : ""}`;
      if (!byComp.has(comp)) byComp.set(comp, []);
      byComp.get(comp).push({ phrase, cls: r.班級 });
    }

    const lines = [];
    for (const [comp, list] of byComp.entries()) {
      list.sort((a, b) => classKey(a.cls) - classKey(b.cls));
      const joined = list.map((x) => x.phrase).join(NAME_JOINER);
      lines.push(`${comp}，${joined}，${EMCEE_SUFFIX}。`);
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

  // 司儀稿按鈕：先預覽，再由 modal 內按鈕做「複製」與「PDF」
  btnEmcee.addEventListener("click", () => {
    const html = buildEmceePreviewHTML();
    if (!html) return;
    showModal("司儀稿預覽", html, { copy: true, frontPdf: true });
  });

  // ─────────────────────────────────────────────────────────────
  // 後端產生：敘獎公告（試算表＋PDF）
  // 先嘗試 application/json；失敗自動 fallback URL-encoded（ids 為 JSON 字串）
  // ─────────────────────────────────────────────────────────────
  btnAward.addEventListener("click", async () => {
    const ids = selectedIds();
    if (!ids.length) {
      toast("請至少勾選一筆");
      return;
    }

    const showLinks = (docUrl, pdfUrl) => {
      const html = `
        <h2 style="margin:0 0 8px;">敘獎公告已建立</h2>
        <p>試算表：<a class="mono" href="${docUrl}" target="_blank">${docUrl}</a></p>
        <p>PDF：<a class="mono" href="${pdfUrl}" target="_blank">${pdfUrl}</a></p>
        <p style="color:#6b7280">若無法開啟，請確認權限「知道連結者可檢視」。</p>
      `;
      showModal("敘獎公告輸出", html, { doc: true, pdf: true });
    };

    // 1) JSON 送法
    try {
      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "生成文件", type: "獎懲單製作", ids }),
      });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "生成失敗");
      const { docUrl, pdfUrl } = json.data || {};
      showLinks(docUrl, pdfUrl);
      return;
    } catch (e) {
      // 2) Fallback: URL-encoded + ids JSON 字串
      try {
        const form = new URLSearchParams();
        form.set("action", "生成文件");
        form.set("type", "獎懲單製作");
        form.set("ids", JSON.stringify(ids)); // 後端已支援字串自動 parse
        const res2 = await fetch(WEB_APP_URL, { method: "POST", body: form });
        const json2 = await res2.json();
        if (json2.status !== "success") throw new Error(json2.message || "生成失敗");
        const { docUrl, pdfUrl } = json2.data || {};
        showLinks(docUrl, pdfUrl);
      } catch (e2) {
        toast(
          "❌ 生成失敗：" +
            e2.message +
            "\n如為跨網域問題，請在後端 doPost 加入：\nif (typeof payload.ids === 'string') payload.ids = JSON.parse(payload.ids);"
        );
      }
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Modal 控制（預覽／複製／PDF）
  // ─────────────────────────────────────────────────────────────
  function showModal(title, html, opt = {}) {
    modalTitle.textContent = title;
    docBody.innerHTML = html;

    copyBtn.style.display = opt.copy ? "" : "none";
    openDocBtn.style.display = opt.doc ? "" : "none";
    openPdfBtn.style.display = opt.pdf ? "" : "none";
    downloadPdfBtn.style.display = opt.frontPdf ? "" : "none";

    backdrop.style.display = "flex";
  }
  $("#closeModal").addEventListener("click", () => (backdrop.style.display = "none"));

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(docBody.innerText);
      toast("已複製");
    } catch {
      toast("無法複製");
    }
  });

  // 這兩顆目前以超連結直接在內容中開啟，如要動態帶入可延伸
  openDocBtn.addEventListener("click", () => {});
  openPdfBtn.addEventListener("click", () => {});

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

  // ─────────────────────────────────────────────────────────────
  // 初始化
  // ─────────────────────────────────────────────────────────────
  loadList();
})();

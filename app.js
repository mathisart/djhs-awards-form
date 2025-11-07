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

  const toROC = (v) => {
    const d = new Date(v);
    if (isNaN(d)) return "";
    return `中華民國 ${d.getFullYear() - 1911} 年 ${String(d.getMonth() + 1).padStart(2, "0")} 月 ${String(d.getDate()).padStart(2, "0")} 日`;
  };

  // ─────────────────────────────────────────────────────────────
  // DOM 元件（全部加上容錯）
  // ─────────────────────────────────────────────────────────────
  const form = $("#form");
  const tbody = $("#tbody") || $("tbody");
  const countEl = $("#count");
  const q = $("#q");
  const btnEmcee = $("#btnEmcee");
  const btnAward = $("#btnAward");

  // 可能在你的 HTML 用的是 class，這裡同時支援 id / class
  const topWarn = $("#topWarn") || $(".top-warn");
  const backendStatus = $("#backendStatus") || $(".backend-status");

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
  let _cacheList = [];

  function setBackendBanner(ok, msgOk = "後端連線成功", msgErr = "後端連線失敗", sub = "") {
    if (ok) {
      topWarn && (topWarn.textContent = msgOk);
      topWarn?.classList.remove("is-error");
      topWarn?.classList.add("is-ok");
      backendStatus && (backendStatus.textContent = sub || "已載入最新資料。");
    } else {
      topWarn && (topWarn.textContent = msgErr);
      topWarn?.classList.remove("is-ok");
      topWarn?.classList.add("is-error");
      backendStatus && (backendStatus.textContent = sub || "無法連線後端，請稍後重試。");
    }
  }

  async function loadList() {
    try {
      const res = await fetch(WEB_APP_URL, { method: "GET" }); // 不加任何自訂 header
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "讀取失敗");

      _cacheList = json.data || [];
      setBackendBanner(true);

      renderTable(_cacheList);
    } catch (e) {
      console.error(e);
      setBackendBanner(false);
      if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="empty">無法連線後端</td></tr>';
      if (countEl) countEl.textContent = "0";
      if (btnEmcee) btnEmcee.disabled = true;
      if (btnAward) btnAward.disabled = true;
    }
  }

  function renderTable(list) {
    const kw = (q?.value || "").toLowerCase();
    const view = (list || []).filter((o) => {
      const s = `${o["編號"] || ""} ${o["班級"] || ""} ${o["座號"] || ""} ${o["姓名"] || ""} ${o["發生日期"] || ""} ${o["事由"] || ""} ${o["獎懲種類"] || ""} ${o["法條依據"] || ""}`.toLowerCase();
      return !kw || s.includes(kw);
    });

    const rows = view.map(
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
    ).join("");

    if (tbody) {
      tbody.innerHTML = rows || `<tr><td colspan="10" class="empty">尚無資料</td></tr>`;
    }
    if (countEl) countEl.textContent = String(list?.length ?? 0);
    updateButtons();
  }

  function selectedIds() {
    return $$(".rowchk").filter((x) => x.checked).map((x) => x.value);
  }
  function updateButtons() {
    const n = selectedIds().length;
    if (btnEmcee) btnEmcee.disabled = !n;
    if (btnAward) btnAward.disabled = !n;
  }

  tbody?.addEventListener("change", (e) => {
    if (e.target.classList?.contains("rowchk")) updateButtons();
  });
  $("#toggleAllBtn")?.addEventListener("click", () => {
    const c = $$(".rowchk");
    const all = c.length && c.every((x) => x.checked);
    c.forEach((x) => (x.checked = !all));
    updateButtons();
  });
  $("#refreshBtn")?.addEventListener("click", loadList);
  q?.addEventListener("input", () => renderTable(_cacheList));

  // ─────────────────────────────────────────────────────────────
  // 表單送出（加入名單）— 使用 URL-encoded，避免 CORS 預檢
  // ─────────────────────────────────────────────────────────────
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      const body = new URLSearchParams(payload);           // 不加 headers → 不會預檢
      const res = await fetch(WEB_APP_URL, { method: "POST", body });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message);
      toast("✅ 已加入名單");
      e.target.reset();
      await loadList();
    } catch (err) {
      console.error(err);
      toast("❌ 寫入失敗：" + err.message);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 司儀稿（預覽 → 複製／PDF）
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

  btnEmcee?.addEventListener("click", () => {
    const html = buildEmceePreviewHTML();
    if (!html) return;
    showModal("司儀稿預覽", html, { copy: true, frontPdf: true });
  });

  // ─────────────────────────────────────────────────────────────
  // 後端產生：敘獎單（試算表＋PDF）— URL-encoded（避免預檢）
  // ─────────────────────────────────────────────────────────────
  btnAward?.addEventListener("click", async () => {
    const ids = selectedIds();
    if (!ids.length) return toast("請至少勾選一筆");

    try {
      const form = new URLSearchParams();
      form.set("action", "生成文件");
      form.set("type", "獎懲單製作");
      form.set("ids", JSON.stringify(ids));

      const res = await fetch(WEB_APP_URL, { method: "POST", body: form });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "生成失敗");
      const { docUrl, pdfUrl } = json.data || {};

      const html = `
        <h2 style="margin:0 0 8px;">敘獎單已建立</h2>
        <p>試算表：<a class="mono" href="${docUrl}" target="_blank">${docUrl}</a></p>
        <p>PDF：<a class="mono" href="${pdfUrl}" target="_blank">${pdfUrl}</a></p>
        <p style="color:#6b7280">若無法開啟，請確認權限「知道連結者可檢視」。</p>
      `;
      showModal("敘獎單輸出", html, { doc: true, pdf: true });
    } catch (e2) {
      console.error(e2);
      toast("❌ 生成失敗：" + e2.message);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Modal 控制（預覽／複製／PDF）
  // ─────────────────────────────────────────────────────────────
  function showModal(title, html, opt = {}) {
    modalTitle && (modalTitle.textContent = title);
    docBody && (docBody.innerHTML = html);

    if (copyBtn) copyBtn.style.display = opt.copy ? "" : "none";
    if (openDocBtn) openDocBtn.style.display = opt.doc ? "" : "none";
    if (openPdfBtn) openPdfBtn.style.display = opt.pdf ? "" : "none";
    if (downloadPdfBtn) downloadPdfBtn.style.display = opt.frontPdf ? "" : "none";

    if (backdrop) backdrop.style.display = "flex";
  }
  $("#closeModal")?.addEventListener("click", () => (backdrop ? (backdrop.style.display = "none") : null));

  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(docBody?.innerText || "");
      toast("已複製");
    } catch {
      toast("無法複製");
    }
  });

  downloadPdfBtn?.addEventListener("click", () => {
    if (!window.html2pdf) return toast("找不到 html2pdf 套件");
    if (!docBody) return toast("找不到可輸出的內容");
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

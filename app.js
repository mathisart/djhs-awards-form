/* app.js — DJHS 獎懲系統前端（含司儀稿預覽／複製／前端PDF） */
(function () {
  // ─────────────────────────────────────
  // 基本工具
  // ─────────────────────────────────────
  const $  = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const toast = (m) => alert(m);

  const WEB_APP_URL = (window.APP_CONFIG && window.APP_CONFIG.WEB_APP_URL) || "";
  if (!WEB_APP_URL) console.warn("WEB_APP_URL 未設定，請在 config.js 設定");

  const autoBasis = (r) =>
    r?.includes("嘉獎") ? "第四條第十六款" :
    r?.includes("小功") ? "第五條第十二款" : "";

  // 司儀稿相關規則
  const EMCEE_SUFFIX = "恭請校長頒獎";
  const NAME_JOINER = "、";
  const RESULT_WHITELIST = [
    "第一名","第二名","第三名","特優","優等","佳作",
    "金牌","銀牌","銅牌","金質獎","銀質獎","銅質獎"
  ];

  // DOM
  const topWarn = $("#topWarn");
  const tbody = $("#tbody");
  const countEl = $("#count");
  const q = $("#q");
  const refreshBtn = $("#refreshBtn");
  const btnAward = $("#btnAward");
  const btnEmcee = $("#btnEmcee");

  const form = $("#form");
  const classInput = $("#classInput");
  const seatInput = $("#seatInput");
  const nameInput = $("#nameInput");
  const dateInput = $("#dateInput");
  const reasonInput = $("#reasonInput");
  const rewardSelect = $("#rewardSelect");

  // Modal
  const backdrop = $("#backdrop");
  const modalTitle = $("#modalTitle");
  const docBody = $("#docBody");
  const copyBtn = $("#copyBtn");
  const downloadPdfBtn = $("#downloadPdfBtn");
  $("#closeModal").addEventListener("click", () => (backdrop.style.display = "none"));

  // cache list
  let _cacheList = [];

  // ─────────────────────────────────────
  // UI helpers
  // ─────────────────────────────────────
  function setBackendBanner(ok, msgOk = "後端連線成功", msgNg = "後端連線失敗") {
    if (!topWarn) return;
    topWarn.classList.remove("success", "danger");
    topWarn.classList.add(ok ? "success" : "danger");
    topWarn.textContent = ok ? msgOk : msgNg;
  }

  function selectedIds() {
    return $$(".rowchk")
      .filter((x) => x.checked)
      .map((x) => x.value);
  }
  function updateButtons() {
    const n = selectedIds().length;
    btnEmcee.disabled = n === 0;
    btnAward.disabled = n === 0;
  }
  tbody.addEventListener("change", (e) => {
    if (e.target.classList.contains("rowchk")) updateButtons();
  });

  // ─────────────────────────────────────
  // 讀取 + 渲染
  // ─────────────────────────────────────
  async function loadList() {
    try {
      const res = await fetch(WEB_APP_URL, { method: "GET" });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "讀取失敗");
      _cacheList = json.data || [];
      setBackendBanner(true);
      renderTable(_cacheList);
    } catch (e) {
      console.error(e);
      setBackendBanner(false);
      _cacheList = [];
      renderTable(_cacheList);
    }
  }

  function renderTable(list) {
    const kw = (q.value || "").toLowerCase();
    const rows = list
      .filter((o) => {
        const s = `${o["班級"] || ""} ${o["座號"] || ""} ${o["姓名"] || ""} ${o["事由"] || ""} ${o["獎懲種類"] || ""}`.toLowerCase();
        return !kw || s.includes(kw);
      })
      .map(
        (o) => `
        <tr>
          <td><input type="checkbox" class="rowchk" value="${o["編號"] || ""}"></td>
          <td>${o["班級"] || ""}</td>
          <td>${o["座號"] || ""}</td>
          <td>${o["姓名"] || ""}</td>
          <td>${o["事由"] || ""}</td>
          <td>${o["獎懲種類"] || ""}</td>
        </tr>`
      )
      .join("");

    tbody.innerHTML = rows || `<tr><td colspan="6" class="empty">尚無資料</td></tr>`;
    countEl.textContent = list.length;
    updateButtons();
  }

  // 即時搜尋（用 cache）
  q.addEventListener("input", () => renderTable(_cacheList));
  refreshBtn.addEventListener("click", loadList);

  // ─────────────────────────────────────
  // 表單：新增一筆
  // ─────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      班級: (classInput.value || "").trim(),
      座號: (seatInput.value || "").trim(),
      姓名: (nameInput.value || "").trim(),
      發生日期: dateInput.value || "",
      事由: (reasonInput.value || "").trim(),
      獎懲種類: rewardSelect.value || "",
      法條依據: autoBasis(rewardSelect.value || "")
    };

    if (!payload.班級 || !payload.座號 || !payload.姓名 || !payload.事由 || !payload.獎懲種類) {
      toast("請完整填寫班級、座號、姓名、事由與獎懲。");
      return;
    }

    try {
      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        body: new URLSearchParams(payload)
      });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "寫入失敗");
      toast("✅ 已加入名單");
      form.reset();
      await loadList();
    } catch (err) {
      toast("❌ 寫入失敗：" + err.message);
    }
  });

  // ─────────────────────────────────────
  // 司儀稿產出（預覽 → 複製 / 前端 PDF）
  // ─────────────────────────────────────
  function normalizeTail(s) {
    return String(s || "").trim().replace(/[，。．、：:；;]+$/g, "");
  }
  function splitByHonor(s) {
    const raw = normalizeTail(s);
    const i = raw.indexOf("榮獲");
    if (i <= 0) return { comp: raw, result: "" };
    const comp = raw.slice(0, i).replace(/^(參加|於|在)/, "").replace(/[，、。:：]+$/, "").trim();
    const result = raw.slice(i + 2).replace(/^[，、。:：]+/, "").replace(/[，、。:：]+$/, "").trim();
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
        班級: t[1].innerText.trim(),
        座號: t[2].innerText.trim(),
        姓名: t[3].innerText.trim(),
        事由: t[4].innerText.trim(),
        獎懲種類: t[5].innerText.trim()
      };
    });
  }
  function buildEmceePreviewHTML() {
    const rows = getCheckedRows();
    if (!rows.length) {
      toast("請至少勾選一筆");
      return "";
    }
    // 按比賽（榮獲前）分組
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

    return `
      <div>
        ${lines.map((p) => `<p style="margin:0 0 8px">${p}</p>`).join("")}
      </div>
    `;
  }

  function showModal(title, html) {
    modalTitle.textContent = title;
    docBody.innerHTML = html || "";
    backdrop.style.display = "flex";
  }

  btnEmcee.addEventListener("click", () => {
    const html = buildEmceePreviewHTML();
    if (!html) return;
    showModal("頒獎典禮司儀稿（預覽）", html);
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(docBody.innerText);
      toast("已複製到剪貼簿");
    } catch {
      toast("無法複製，請手動選取文字複製");
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

  // ─────────────────────────────────────
  // 一鍵產出：敘獎單（後端）
  // ─────────────────────────────────────
  btnAward.addEventListener("click", async () => {
    const ids = $$(".rowchk:checked").map((x) => x.value);
    if (!ids.length) {
      toast("請至少勾選一筆資料");
      return;
    }

    const showLinks = (docUrl, pdfUrl) => {
      const hint = "\n若無法開啟，請確認權限「知道連結者可檢視」。";
      toast(`✅ 已建立敘獎單\n\n試算表：${docUrl}\nPDF：${pdfUrl}${hint}`);
      window.open(docUrl, "_blank");
      window.open(pdfUrl, "_blank");
    };

    try {
      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "生成文件", type: "獎懲單製作", ids })
      });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "生成失敗");
      const { docUrl, pdfUrl } = json.data || {};
      showLinks(docUrl, pdfUrl);
    } catch {
      try {
        const form = new URLSearchParams();
        form.set("action", "生成文件");
        form.set("type", "獎懲單製作");
        form.set("ids", JSON.stringify(ids));
        const res2 = await fetch(WEB_APP_URL, { method: "POST", body: form });
        const json2 = await res2.json();
        if (json2.status !== "success") throw new Error(json2.message || "生成失敗");
        const { docUrl, pdfUrl } = json2.data || {};
        showLinks(docUrl, pdfUrl);
      } catch (e2) {
        toast("❌ 生成失敗：" + e2.message);
      }
    }
  });

  // 初始化
  loadList();
})();

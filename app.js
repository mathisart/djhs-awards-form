/* app.js — DJHS 獎懲系統前端（GitHub Pages / Google Sites 皆可） */
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

  // DOM
  const topWarn = $("#topWarn");
  const tbody = $("#tbody");
  const countEl = $("#count");
  const q = $("#q");
  const refreshBtn = $("#refreshBtn");
  const btnAward = $("#btnAward");

  const form = $("#form");
  const classInput = $("#classInput");
  const seatInput = $("#seatInput");
  const nameInput = $("#nameInput");
  const dateInput = $("#dateInput");
  const reasonInput = $("#reasonInput");
  const rewardSelect = $("#rewardSelect");

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
    btnAward.disabled = selectedIds().length === 0;
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
  // 一鍵產出：敘獎單（後端複製試算表範本＋填入＋回傳 Doc/PDF）
  // ─────────────────────────────────────
  btnAward.addEventListener("click", async () => {
    const ids = selectedIds();
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

    // 優先 JSON 送法，若失敗再 fallback x-www-form-urlencoded（ids 為 JSON 字串）
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

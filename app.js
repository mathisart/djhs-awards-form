/* app.js — DJHS 獎懲填報系統前端 */

(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const toast = (m) => alert(m);

  const WEB_APP_URL = (window.APP_CONFIG && window.APP_CONFIG.WEB_APP_URL) || "";
  if (!WEB_APP_URL) console.warn("WEB_APP_URL 未設定，請在 config.js 設定");

  let _cacheList = [];

  const fmtDate = (v) => {
    const d = new Date(v);
    if (isNaN(d)) return v || "—";
    const y = d.getFullYear(),
      m = String(d.getMonth() + 1).padStart(2, "0"),
      dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const renderTable = (list) => {
    const tbody = $("#tbody");
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:14px">尚無資料</td></tr>`;
      $("#count").textContent = 0;
      $("#btnEmcee").disabled = true;
      $("#btnAward").disabled = true;
      return;
    }
    $("#count").textContent = list.length;
    $("#btnEmcee").disabled = false;
    $("#btnAward").disabled = false;

    tbody.innerHTML = list
      .map(
        (r, i) => `
      <tr>
        <td><input type="checkbox" data-idx="${i}"></td>
        <td>${r.班級}</td>
        <td>${r.座號}</td>
        <td>${r.姓名}</td>
        <td>${r.事由}</td>
        <td>${r.獎懲種類}</td>
      </tr>
    `
      )
      .join("");
  };

  async function loadList() {
    try {
      const res = await fetch(WEB_APP_URL, { method: "GET" });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "讀取失敗");

      _cacheList = json.data || [];
      $("#topWarn").textContent = "✅ 已載入最新資料";
      $("#topWarn").className = "ok";
      renderTable(_cacheList);
    } catch (e) {
      console.error(e);
      $("#topWarn").textContent = "❌ 後端連線失敗";
      $("#topWarn").className = "bad";
      renderTable([]);
    }
  }

  const collectForm = () => {
    const fd = new FormData($("#form"));
    const obj = Object.fromEntries(fd.entries());
    obj.座號 = String(obj.座號).padStart(2, "0");
    obj.發生日期 = fmtDate(obj.發生日期);
    return obj;
  };

  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = collectForm();
    try {
      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.message || "寫入失敗");
      toast("✅ 已成功加入！");
      loadList();
      $("#form").reset();
    } catch (err) {
      toast("❌ 寫入失敗，請稍後再試");
      console.error(err);
    }
  });

  $("#q").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    if (!v) return renderTable(_cacheList);
    renderTable(
      _cacheList.filter(
        (r) => r.班級.includes(v) || r.姓名.includes(v) || r.事由.includes(v)
      )
    );
  });

  $("#toggleAllBtn").addEventListener("change", (e) => {
    $$("tbody input[type=checkbox]").forEach((c) => (c.checked = e.target.checked));
  });

  const pickChecked = () => {
    const ids = $$("tbody input[type=checkbox]")
      .filter((c) => c.checked)
      .map((c) => Number(c.dataset.idx));
    return ids.map((i) => _cacheList[i]);
  };

  const openModal = (title, body) => {
    $("#modalTitle").textContent = title;
    $("#docBody").textContent = body;
    $("#backdrop").style.display = "flex";
  };
  $("#closeModal").onclick = () => ($("#backdrop").style.display = "none");
  $("#copyBtn").onclick = () => {
    navigator.clipboard.writeText($("#docBody").textContent);
    toast("已複製到剪貼簿 ✅");
  };
  $("#downloadPdfBtn").onclick = () => {
    const el = $("#docBody");
    html2pdf().from(el).set({ margin: 10, filename: `輸出_${Date.now()}.pdf` }).save();
  };

  $("#btnEmcee").onclick = () => {
    const list = pickChecked();
    if (!list.length) return toast("請至少勾選一位學生");
    const grp = {};
    list.forEach((r) => {
      if (!grp[r.事由]) grp[r.事由] = [];
      grp[r.事由].push(r);
    });
    let out = "";
    Object.entries(grp).forEach(([k, arr]) => {
      const line = arr
        .map((r) => `${r.班級}班${r.姓名}${r.獎懲種類.replace("獎", "榮獲")}`)
        .join("、");
      out += `${k}，${line}，恭請校長頒獎。\n\n`;
    });
    openModal("司儀稿預覽", out.trim());
  };

  $("#btnAward").onclick = () => {
    const list = pickChecked();
    if (!list.length) return toast("請至少勾選一位學生");
    let out = list
      .map(
        (r) =>
          `${r.班級}班 ${r.座號}號 ${r.姓名} — ${r.事由}（${r.獎懲種類}）`
      )
      .join("\n");
    openModal("敘獎單預覽", out);
  };

  $("#refreshBtn").onclick = loadList;

  loadList();
})();

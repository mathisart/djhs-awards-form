/********** 常數：請改成你的資料表與範本 ID **********/
const SPREADSHEET_ID = '19KahliocjSoPXVqhKY95Bgtibv-aU6rba_VgoM0erPw';      // 你的資料活頁簿 ID
const TEMPLATE_SPREADSHEET_ID = '17RYCwMcH3V8tY3bRU0Xx3Jihu1xvi7oYKKIIUhy7DeE'; // 獎懲單範本試算表 ID
const SHEET_NAME = '獲獎名單';

// 表格寫入設定（避免清到範本底部簽核區）
const TABLE_START_ROW = 4;   // 從第 4 列開始填（你的範本表頭）
const TABLE_COLS      = 12;  // A~L 共 12 欄
const TABLE_MAX_ROWS  = 60;  // 一次最多清/寫 60 列，不影響下方簽核區

/********** 小工具（標準化回應） **********/
function ok(data = {}, msg = 'OK') {
  return ContentService.createTextOutput(
    JSON.stringify({ status: 'success', data, message: msg })
  ).setMimeType(ContentService.MimeType.JSON);
}
function fail(err) {
  return ContentService.createTextOutput(
    JSON.stringify({ status: 'error', message: String(err) })
  ).setMimeType(ContentService.MimeType.JSON);
}

/********** 資料表存取 **********/
function openDataSS_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function ensureHeaders_(sheet) {
  // 只保留：編號 / 班級 / 座號 / 姓名 / 發生日期 / 事由 / 獎懲種類 / 法條依據 / 建立時間
  const headers = ['編號','班級','座號','姓名','發生日期','事由','獎懲種類','法條依據','建立時間'];
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return headers;
}

function valuesToObjects_(values) {
  if (!values || values.length <= 1) return [];
  const [header, ...rows] = values;
  return rows.map(r => {
    const o = {};
    header.forEach((h, i) => o[h] = r[i]);
    return o;
  });
}

/********** 法條：自動推論與「條/款」拆欄 **********/
function getBasis_(reward) {
  if (!reward) return '無';
  const s = String(reward);
  if (s.includes('嘉獎')) return '第四條第十六款';
  if (s.includes('小功')) return '第五條第十二款';
  return '無';
}

// 將「第四條第十六款」→ [4,16]；「第五條第十二款」→ [5,12]；其他→ ["",""]
function splitBasisToArticleClause_(basis) {
  if (!basis) return ["",""];
  const m = String(basis).match(/第(.+?)條.*?第(.+?)款/);
  if (!m) return ["",""];
  return [zhNumToInt_(m[1]), zhNumToInt_(m[2])];
}

// 支援中文數字與阿拉伯數字
function zhNumToInt_(s) {
  s = String(s || '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return parseInt(s, 10);

  const map = { 一:1, 二:2, 兩:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10, 零:0, 〇:0 };
  // 只涵蓋本案需求（到二十幾已足夠）：十、十一、十二…、二十、二十一…
  let n = 0;
  if (s.length === 1) return map[s] || '';
  if (s.startsWith('十')) {            // 十六 → 16
    const tail = map[s[1]] || 0;
    return 10 + tail;
  }
  const parts = s.split('十');
  if (parts.length === 2) {            // 十四 / 二十 / 二十三
    const tens = map[parts[0]] || 0;
    const ones = map[parts[1]] || 0;
    return tens * 10 + ones;
  }
  // 其他罕見格式，嘗試逐字累加
  for (const ch of s) n = n * 10 + (map[ch] || 0);
  return n || '';
}

/********** 輔助：解析前端 payload（支援 JSON 與 URL-encoded） **********/
function parsePayload_(e) {
  if (!e || !e.postData) return {};
  const ctype = String(e.postData.type || e.postData.contentsType || '').toLowerCase();

  // application/json → 直接 parse
  if (ctype.indexOf('application/json') >= 0) {
    try { return JSON.parse(e.postData.contents || '{}'); } catch (err) { return {}; }
  }

  // 其餘視為 URL-encoded（避免預檢）
  const raw = String(e.postData.contents || '');
  const obj = {};
  raw.split('&').filter(Boolean).forEach(pair => {
    const idx = pair.indexOf('=');
    const k = decodeURIComponent(idx >= 0 ? pair.slice(0, idx) : pair);
    const v = decodeURIComponent(idx >= 0 ? pair.slice(idx + 1) : '');
    obj[k] = v;
  });
  return obj;
}

/********** doGet：?page=html 回前端頁，其餘回 JSON **********/
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.page === 'html') {
      return HtmlService.createHtmlOutputFromFile('index')
        .setTitle('學生獎懲報表與文件自動化系統')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    const ss = openDataSS_();
    const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    ensureHeaders_(sh);
    const list = valuesToObjects_(sh.getDataRange().getValues());
    return ok(list, '資料讀取成功');
  } catch (err) {
    return fail('讀取資料時發生錯誤：' + err.message);
  }
}

/********** doPost：新增資料 / 產生獎懲單 **********/
function doPost(e) {
  try {
    const payload = parsePayload_(e) || {};

    // ① 前端直接丟 rows 來製作敘獎單（不依賴資料表的「編號」）
    if (payload.action === 'create_award_doc') {
      let rows = [];
      try { rows = JSON.parse(payload.rows || '[]'); } catch (_) { rows = []; }

      // 正規化欄位名稱
      const normalized = rows.map(r => ({
        班級: String(r.班級 || r.class || ''),
        座號: String(r.座號 || r.seat || ''),
        姓名: String(r.姓名 || r.name || ''),
        發生日期: String(r.發生日期 || r.eventDate || ''),  // 可為空
        事由: String(r.事由 || r.reason || ''),
        獎懲種類: String(r.獎懲種類 || r.reward || '')
      }));

      const urls = generateAwardSheetFromRows_(normalized);
      return ok(urls, '已由前端 rows 直接產生敘獎單');
    }

    // ② 從資料表的「編號」清單產製敘獎單（你原本的流程）
    if (payload.action === '生成文件' && payload.type === '獎懲單製作') {
      let ids = payload.ids;
      if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch (_) { ids = []; } }
      const urls = generateAwardSheetAndReturnUrls_(Array.isArray(ids) ? ids : []);
      return ok(urls, '已建立試算表並回傳 PDF 連結');
    }

    // ③ 新增一筆名單到資料表（＋加入名單）
    const ss = openDataSS_();
    const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    ensureHeaders_(sh);

    const id     = Utilities.getUuid();
    const now    = new Date();
    const cls    = payload['班級'] || payload['class'] || '';
    const seat   = payload['座號'] || payload['seatNo'] || '';
    const name   = payload['姓名'] || payload['name'] || '';
    const date   = payload['發生日期'] || payload['eventDate'] || '';
    const reason = payload['事由'] || payload['reason'] || '';
    const reward = payload['獎懲種類'] || payload['reward'] || '';
    const basis  = getBasis_(reward); // 依獎懲自動推法條

    sh.appendRow([id, cls, seat, name, date, reason, reward, basis, now]);
    return ok({}, '資料寫入成功');

  } catch (err) {
    return fail('寫入或處理時發生錯誤：' + err.message);
  }
}


/********** 產生獎懲單（複製範本、填 A:班級 B:座號 C:姓名 D/E:月日 J:條 K:款 L:獎懲） **********/
function buildPdfExportUrl_(fileId, sheetId) {
  const base = 'https://docs.google.com/spreadsheets/d/' + fileId + '/export?';
  const params = {
    format:'pdf', size:'A4', portrait:'true', fitw:'true',
    top_margin:'0.5', bottom_margin:'0.5', left_margin:'0.5', right_margin:'0.5',
    sheetnames:'false', printtitle:'false', pagenumbers:'false', gridlines:'false', gid:sheetId
  };
  const q = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
  return base + q;
}

function generateAwardSheetAndReturnUrls_(ids) {
  const dataSS = openDataSS_();
  const dataSheet = dataSS.getSheetByName(SHEET_NAME);
  if (!dataSheet) throw new Error('找不到工作表：' + SHEET_NAME);

  const list = valuesToObjects_(dataSheet.getDataRange().getValues());
  const rows = (Array.isArray(ids) && ids.length)
    ? list.filter(o => String(o['編號'] || '') && ids.includes(String(o['編號'])))
    : list.filter(o => String(o['編號'] || ''));

  // 複製範本
  const copied = DriveApp.getFileById(TEMPLATE_SPREADSHEET_ID)
    .makeCopy(`獎懲公告_套版_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm')}`);
  const ss = SpreadsheetApp.open(copied);
  const sheet = ss.getSheets()[0];

  // 右上角日期（M1）
  sheet.getRange('M1').setValue(
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), '中華民國 yyy 年 MM 月 dd 日')
  );

  // 只清「可寫區」以免刪到範本內文（簽報人/組長/主任/校長等）
  sheet.getRange(TABLE_START_ROW, 1, TABLE_MAX_ROWS, TABLE_COLS).clearContent();

  // 寫入列：
  // A:班級 B:座號 C:姓名 D:月 E:日 F:事由 ... J:條 K:款 L:獎懲
  const out = rows.map(p => {
    const d = new Date(p['發生日期'] || '');
    const mm = isNaN(d) ? '' : (d.getMonth() + 1);
    const dd = isNaN(d) ? '' : d.getDate();

    const reward = p['獎懲種類'] || '';
    const basisText = p['法條依據'] || getBasis_(reward);
    const [article, clause] = splitBasisToArticleClause_(basisText); // ← ★ 拆成條/款

    // A B C D E F G H I J K L
    // 0 1 2 3 4 5 6 7 8 9 10 11
    return [
      p['班級'] || '',
      p['座號'] || '',
      p['姓名'] || '',
      mm,             // D 月
      dd,             // E 日
      p['事由'] || '',// F 事由
      '', '', '',     // G H I (保留)
      article,        // J 條 ← 只填數字
      clause,         // K 款 ← 只填數字
      reward          // L 獎懲種類
    ];
  });

  if (out.length) {
    // 寫入不會超過可寫區 TABLE_MAX_ROWS
    const writeRows = Math.min(out.length, TABLE_MAX_ROWS);
    sheet.getRange(TABLE_START_ROW, 1, writeRows, TABLE_COLS).setValues(out.slice(0, writeRows));
  }

  const fileId = ss.getId();
  const docUrl = ss.getUrl();
  const pdfUrl = buildPdfExportUrl_(fileId, sheet.getSheetId());

  // 若要讓任何人可下載 PDF，取消下一行註解
  // DriveApp.getFileById(fileId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { docUrl, pdfUrl };
}
// 直接用「前端傳來的列」產 PDF/試算表，不讀資料表
function generateAwardSheetFromRows_(rows) {
  // 複製範本
  const copied = DriveApp.getFileById(TEMPLATE_SPREADSHEET_ID)
    .makeCopy(`獎懲公告_套版_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm')}`);
  const ss = SpreadsheetApp.open(copied);
  const sheet = ss.getSheets()[0];

  // 右上角日期（M1）
  sheet.getRange('M1').setValue(
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), '中華民國 yyy 年 MM 月 dd 日')
  );

  // 只清「可寫區」
  sheet.getRange(TABLE_START_ROW, 1, TABLE_MAX_ROWS, TABLE_COLS).clearContent();

  // 寫入列：A:班級 B:座號 C:姓名 D:月 E:日 F:事由 ... J:條 K:款 L:獎懲
  const out = (rows || []).map(p => {
    const d  = new Date(p['發生日期'] || '');
    const mm = isNaN(d) ? '' : (d.getMonth() + 1);
    const dd = isNaN(d) ? '' : d.getDate();

    const reward    = p['獎懲種類'] || '';
    const basisText = p['法條依據'] || getBasis_(reward);
    const [article, clause] = splitBasisToArticleClause_(basisText);

    return [
      p['班級'] || '',
      p['座號'] || '',
      p['姓名'] || '',
      mm, dd,
      p['事由'] || '',
      '', '', '',
      article, clause,
      reward
    ];
  });

  if (out.length) {
    const writeRows = Math.min(out.length, TABLE_MAX_ROWS);
    sheet.getRange(TABLE_START_ROW, 1, writeRows, TABLE_COLS).setValues(out.slice(0, writeRows));
  }

  const fileId = ss.getId();
  const docUrl = ss.getUrl();
  const pdfUrl = buildPdfExportUrl_(fileId, sheet.getSheetId());
  // 如需任何人可下載，解除下行註解
  // DriveApp.getFileById(fileId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { docUrl, pdfUrl };
}

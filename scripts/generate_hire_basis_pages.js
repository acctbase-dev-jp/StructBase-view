// Node.js script to generate basis pages
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = path.resolve(__dirname, '..');
const PAGES_DIR = path.join(BASE, 'docs', 'labor-hr', 'pages');
const CSV_DIR = path.join(BASE, 'docs', 'download', 'labor-hr', 'events', 'csv');
const TEMPLATE_PATH = path.join(BASE, 'docs', 'labor-hr', 'pages', 'LH-EVT-CONS01__57fd71d406.html');

// HIRE07: 職業安定法（第5条の3）は既存ページのためスキップ
// 注: ハッシュは元データ依存のため、同一根拠の重複作成時は手動で削除すること
const HIRE07_SKIP_HASH = '9786f3ee36';

function computeHash(basisName, basisLocator, basisUrl) {
  const s = basisName + '||' + basisLocator + '||' + (basisUrl || '');
  return crypto.createHash('md5').update(s, 'utf8').digest('hex').slice(0, 10);
}

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < lines[i].length; j++) {
      const c = lines[i][j];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if ((c === ',' && !inQuotes) || c === '\n') {
        values.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
    rows.push(obj);
  }
  return rows;
}

// Simple CSV parse (handles basic case)
function loadCSV(eventId) {
  const filePath = path.join(CSV_DIR, `labor-hr_audit_checklist_${eventId}_v0_1.generated.csv`);
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (values[idx] || '').trim(); });
    rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function groupByBasis(rows) {
  const groups = {};
  for (const r of rows) {
    const key = `${r.basis_name}|||${r.basis_locator}|||${r.basis_url || ''}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  return groups;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateHtml(eventId, eventName, basisName, basisLocator, basisUrl, rows, templateHtml) {
  const basisDisplay = basisName + ' / ' + basisLocator;
  const title = `${eventName}｜${basisName}｜労務・人事制度 要件DB`;
  const intro = `本ページは、${eventName}に関して、${basisName}を根拠として制度上確認が求められる事項を整理した要件一覧です。`;
  const backHref = `../nav/evt/${eventId}.html`;

  const urlCell = basisUrl
    ? `<a class="btn-link" href="${escapeHtml(basisUrl)}" target="_blank">一次情報を開く</a>`
    : '-';

  const sorted = [...rows].sort((a, b) => (a.requirement_id || '').localeCompare(b.requirement_id || ''));
  const tbodyRows = sorted.map(r => {
    const reqId = escapeHtml(r.requirement_id || '');
    const reqText = escapeHtml(r.requirement_text || '');
    return `        <tr data-req-id="${reqId}">
          <td class="req-cell"><span id="${reqId}" class="req-anchor"></span>${reqText}</td>
          <td>${escapeHtml(basisDisplay)}</td>
          <td>${urlCell}</td>
        </tr>`;
  }).join('\n');

  let out = templateHtml;
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  out = out.replace(/<a class="back" href="[^"]*">← 根拠一覧に戻る<\/a>/, `<a class="back" href="${escapeHtml(backHref)}">← 根拠一覧に戻る</a>`);
  out = out.replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${escapeHtml(eventName)}</h1>`);
  out = out.replace(/本ページは、ハラスメント事案の発生に関して、労働契約法を根拠として制度上確認が求められる事項を整理した要件一覧です。/,
    intro);
  out = out.replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>\n${tbodyRows}\n      </tbody>`);

  return out;
}

function main() {
  const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const events = ['LH-EVT-HIRE07', 'LH-EVT-HIRE08', 'LH-EVT-HIRE09', 'LH-EVT-HIRE10', 'LH-EVT-HIRE11', 'LH-EVT-HIRE12', 'LH-EVT-HIRE13', 'LH-EVT-HIRE14'];

  const created = [];
  const skipped = [];

  for (const eventId of events) {
    const rows = loadCSV(eventId);
    if (!rows.length) continue;
    const eventName = rows[0].event_name || eventId;
    const groups = groupByBasis(rows);

    for (const key of Object.keys(groups)) {
      const [basisName, basisLocator, basisUrl] = key.split('|||');
      const groupRows = groups[key];
      const h = computeHash(basisName, basisLocator, basisUrl);

      if (eventId === 'LH-EVT-HIRE07' && h === HIRE07_SKIP_HASH) {
        skipped.push(`${eventId}__${h}.html (職業安定法)`);
        continue;
      }

      const filename = `${eventId}__${h}.html`;
      const outPath = path.join(PAGES_DIR, filename);
      if (fs.existsSync(outPath)) {
        skipped.push(filename);
        continue;
      }

      const htmlContent = generateHtml(eventId, eventName, basisName, basisLocator, basisUrl, groupRows, templateHtml);
      fs.writeFileSync(outPath, htmlContent, 'utf8');
      created.push({ path: outPath, basis_name: basisName, basis_locator: basisLocator, basis_url: basisUrl });
    }
  }

  console.log('=== 作成したファイル ===');
  created.forEach(c => {
    console.log(c.path);
    console.log(`  basis_name: ${c.basis_name}, basis_locator: ${c.basis_locator}, basis_url: ${c.basis_url}`);
  });
  console.log('\n=== スキップ ===');
  skipped.forEach(s => console.log(s));
}

main();

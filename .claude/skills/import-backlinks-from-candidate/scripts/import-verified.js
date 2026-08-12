#!/usr/bin/env node
// import-verified.js — 把人工核验过的 candidate 记录迁移到 backlinks.json
// 用法: node import-verified.js <verified.json>   (须在 link-master 仓库根目录运行)
//
// verified.json 结构 (数组):
// [
//   {
//     "link": "https://...",              // 必填，按 link 精确匹配 candidate
//     "action": "import" | "remove",      // 默认 "import"
//     "link_type": "Dofollow" | "Nofollow", // action=import 时建议填写
//     "link_category": "Technology",      // 可选，默认沿用 candidate 原值
//     "type": "Text Link",                // 可选，默认 "Text Link"
//     "tips": ""                          // 可选，覆盖 candidate 的 tips
//     "needLogin": true | false           // 可选，默认 false
//   }
// ]

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data', 'json');
const CAND_PATH = path.join(DATA_DIR, 'backlink-candidates.json');
const BACKLINK_PATH = path.join(DATA_DIR, 'backlinks.json');

if (process.argv.length < 3) {
  console.error('usage: node import-verified.js <verified.json>');
  process.exit(1);
}

const verified = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(verified) || verified.length === 0) {
  console.error('verified.json must be a non-empty array');
  process.exit(1);
}

const candidates = JSON.parse(fs.readFileSync(CAND_PATH, 'utf8'));
const backlinks = JSON.parse(fs.readFileSync(BACKLINK_PATH, 'utf8'));

const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const candByLink = new Map(candidates.map((r) => [r.link, r]));
const backlinkSet = new Set(backlinks.map((r) => r.link));

const stats = { imported: 0, dofollow: 0, nofollow: 0, removed: 0, skippedNotFound: 0, skippedDuplicate: 0 };
const detail = [];

for (const v of verified) {
  const cand = candByLink.get(v.link);
  if (!cand) {
    stats.skippedNotFound++;
    detail.push({ link: v.link, action: v.action || 'import', result: 'skipped: not in candidates' });
    continue;
  }
  const action = v.action || 'import';

  if (action === 'remove') {
    candidates.splice(candidates.indexOf(cand), 1);
    candByLink.delete(v.link);
    stats.removed++;
    detail.push({ link: v.link, action, result: 'removed' });
    continue;
  }

  if (backlinkSet.has(v.link)) {
    candidates.splice(candidates.indexOf(cand), 1);
    candByLink.delete(v.link);
    stats.skippedDuplicate++;
    detail.push({ link: v.link, action, result: 'already in backlinks (removed from candidates)' });
    continue;
  }

  const entry = {
    id: cand.id,
    link: cand.link,
    is_paid: cand.is_paid ?? false,
    type: v.type || 'Text Link',
    details: cand.details ?? '',
    link_type: v.link_type || cand.link_type || 'Unknown',
    link_category: v.link_category || cand.link_category || 'Unknown',
    tips: v.tips !== undefined ? v.tips : (cand.tips ?? ''),
    update_date: cand.update_date ?? null,
    dr: cand.dr ?? '',
    organic_traffic: cand.organic_traffic ?? '',
    has_exclusive_offer: cand.has_exclusive_offer ?? false,
    created_at: now,
    updated_at: now,
    exclusive_offer_text: cand.exclusive_offer_text ?? null,
    language: cand.language || 'Unknown',
    status: 'normal',
    needLogin: v.needLogin ?? cand.needLogin ?? false,
  };
  backlinks.push(entry);
  backlinkSet.add(v.link);
  candidates.splice(candidates.indexOf(cand), 1);
  candByKeyDelete(candByLink, v.link);

  stats.imported++;
  if ((entry.link_type || '').toLowerCase() === 'dofollow') stats.dofollow++;
  if ((entry.link_type || '').toLowerCase() === 'nofollow') stats.nofollow++;
  detail.push({ link: v.link, action, result: `imported as ${entry.link_type}` });
}

fs.writeFileSync(CAND_PATH, JSON.stringify(candidates, null, 2));
fs.writeFileSync(BACKLINK_PATH, JSON.stringify(backlinks, null, 2));

console.log('=== import-verified summary ===');
console.log(`imported: ${stats.imported} (dofollow: ${stats.dofollow}, nofollow: ${stats.nofollow})`);
console.log(`removed from candidates: ${stats.removed}`);
console.log(`skipped (not found): ${stats.skippedNotFound}, skipped (duplicate): ${stats.skippedDuplicate}`);
console.log('--- detail ---');
for (const d of detail) console.log(`[${d.action}] ${d.result}: ${d.link}`);

function candByKeyDelete(map, key) {
  map.delete(key);
}

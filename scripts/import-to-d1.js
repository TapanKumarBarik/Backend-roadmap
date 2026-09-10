#!/usr/bin/env node
// Reads cloudflare/export/*.json (produced by export-azure-tables.js) and
// generates cloudflare/import.sql — one INSERT per row, mapped from Table
// Storage's camelCase fields (and partitionKey/rowKey encodings) to the D1
// schema's real columns (cloudflare/d1-schema.sql).
//
// A few tables encoded two IDs into one rowKey as "<id>_<voterId>" (to get
// one partition-scan instead of one query per row under Table Storage) —
// feed_votes, suggestion_votes, comment_votes split that back into real
// columns here, replicating the exact `lastIndexOf('_')` logic the API
// itself uses today to read them (see feed.js/suggestions.js/comments.js).
//
// Usage:
//   node scripts/import-to-d1.js
//   npx wrangler d1 execute backend-roadmap-db --local --file=cloudflare/import.sql
//   npx wrangler d1 execute backend-roadmap-db --remote --file=cloudflare/import.sql

const fs = require('fs');
const path = require('path');

const EXPORT_DIR = path.join(__dirname, '..', 'cloudflare', 'export');
const OUT_FILE = path.join(__dirname, '..', 'cloudflare', 'import.sql');

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlBool(v) {
  return v ? 1 : 0;
}
function sqlNum(v) {
  return v === null || v === undefined ? 'NULL' : Number(v);
}
function splitLastUnderscore(rowKey) {
  const idx = rowKey.lastIndexOf('_');
  return [rowKey.slice(0, idx), rowKey.slice(idx + 1)];
}

// One entry per D1 table: reads cloudflare/export/<AzureTableName>.json and
// returns an array of already-escaped column-value tuples for one INSERT.
const TABLES = {
  admins: {
    file: 'Admins',
    columns: ['email', 'granted_by', 'granted_at'],
    row: (e) => [sqlStr(e.email || decodeURIComponent(e.rowKey)), sqlStr(e.grantedBy), sqlStr(e.grantedAt)]
  },
  users: {
    file: 'Users',
    columns: ['user_id', 'email', 'name', 'picture', 'first_seen', 'last_seen'],
    row: (e) => [sqlStr(e.rowKey), sqlStr(e.email), sqlStr(e.name), sqlStr(e.picture), sqlStr(e.firstSeen), sqlStr(e.lastSeen)]
  },
  bookmarks: {
    file: 'Bookmarks',
    columns: ['user_id', 'path', 'created_at'],
    row: (e) => [sqlStr(e.partitionKey), sqlStr(decodeURIComponent(e.rowKey)), sqlStr(e.createdAt)]
  },
  books: {
    file: 'Books',
    columns: ['id', 'user_id', 'display_name', 'title', 'tag', 'link_url', 'attachment_url', 'created_at'],
    row: (e) => [sqlStr(e.rowKey), sqlStr(e.userId), sqlStr(e.displayName), sqlStr(e.title), sqlStr(e.tag), sqlStr(e.linkUrl), sqlStr(e.attachmentUrl), sqlStr(e.createdAt)]
  },
  feed_posts: {
    file: 'FeedPosts',
    columns: ['id', 'user_id', 'display_name', 'text', 'attachment_url', 'attachment_type', 'link_title', 'created_at'],
    row: (e) => [sqlStr(e.rowKey), sqlStr(e.userId), sqlStr(e.displayName), sqlStr(e.text), sqlStr(e.attachmentUrl), sqlStr(e.attachmentType), sqlStr(e.linkTitle), sqlStr(e.createdAt)]
  },
  feed_votes: {
    file: 'FeedVotes',
    columns: ['post_id', 'voter_id', 'created_at'],
    row: (e) => {
      const [postId, voterId] = e.postId && e.userId ? [e.postId, e.userId] : splitLastUnderscore(e.rowKey);
      return [sqlStr(postId), sqlStr(voterId), sqlStr(e.createdAt)];
    }
  },
  messages: {
    file: 'Messages',
    columns: ['id', 'user_id', 'display_name', 'email', 'text', 'created_at'],
    row: (e) => [sqlStr(e.rowKey), sqlStr(e.userId), sqlStr(e.displayName), sqlStr(e.email), sqlStr(e.text), sqlStr(e.createdAt)]
  },
  module_progress: {
    file: 'ModuleProgress',
    columns: ['user_id', 'path', 'status', 'updated_at'],
    row: (e) => [sqlStr(e.partitionKey), sqlStr(decodeURIComponent(e.rowKey)), sqlStr(e.status), sqlStr(e.updatedAt)]
  },
  notes: {
    file: 'Notes',
    columns: ['user_id', 'path', 'text', 'updated_at'],
    row: (e) => [sqlStr(e.partitionKey), sqlStr(decodeURIComponent(e.rowKey)), sqlStr(e.text), sqlStr(e.updatedAt)]
  },
  page_views: {
    file: 'PageViews',
    columns: ['id', 'date', 'path', 'user', 'referrer', 'timestamp'],
    row: (e) => [sqlStr(e.rowKey), sqlStr(e.partitionKey), sqlStr(e.path), sqlStr(e.user), sqlStr(e.referrer), sqlStr(e.timestamp)]
  },
  rate_limits: {
    file: 'RateLimits',
    columns: ['user_id', 'bucket', 'window_start', 'count'],
    row: (e) => [sqlStr(e.partitionKey), sqlStr(e.rowKey), sqlStr(e.windowStart), sqlNum(e.count)]
  },
  reactions: {
    file: 'Reactions',
    columns: ['path', 'user_id', 'emoji', 'created_at'],
    row: (e) => [sqlStr(decodeURIComponent(e.partitionKey)), sqlStr(e.userId), sqlStr(e.emoji), sqlStr(e.createdAt)]
  },
  streaks: {
    file: 'Streaks',
    columns: ['user_id', 'current_streak', 'longest_streak', 'last_active_date'],
    row: (e) => [sqlStr(e.partitionKey), sqlNum(e.currentStreak), sqlNum(e.longestStreak), sqlStr(e.lastActiveDate)]
  },
  suggestions: {
    file: 'Suggestions',
    columns: ['id', 'user_id', 'display_name', 'text', 'created_at'],
    row: (e) => [sqlStr(e.rowKey), sqlStr(e.userId), sqlStr(e.displayName), sqlStr(e.text), sqlStr(e.createdAt)]
  },
  suggestion_votes: {
    file: 'SuggestionVotes',
    columns: ['suggestion_id', 'voter_id', 'created_at'],
    row: (e) => {
      const [suggestionId, voterId] = e.suggestionId && e.userId ? [e.suggestionId, e.userId] : splitLastUnderscore(e.rowKey);
      return [sqlStr(suggestionId), sqlStr(voterId), sqlStr(e.createdAt)];
    }
  },
  comments: {
    file: 'Comments',
    columns: ['id', 'path', 'user_id', 'display_name', 'text', 'parent_id', 'is_answer', 'hidden', 'edited_at', 'created_at', 'mentions'],
    row: (e) => [
      sqlStr(e.rowKey), sqlStr(decodeURIComponent(e.partitionKey)), sqlStr(e.userId), sqlStr(e.displayName),
      sqlStr(e.text), sqlStr(e.parentId), sqlBool(e.isAnswer), sqlBool(e.hidden), sqlStr(e.editedAt),
      sqlStr(e.createdAt), sqlStr(e.mentions)
    ]
  },
  comment_votes: {
    file: 'CommentVotes',
    columns: ['path', 'comment_id', 'voter_id'],
    row: (e) => {
      const [commentId, voterId] = splitLastUnderscore(e.rowKey);
      return [sqlStr(decodeURIComponent(e.partitionKey)), sqlStr(commentId), sqlStr(voterId)];
    }
  },
  workspace_pages: {
    file: 'WorkspacePages',
    columns: ['id', 'user_id', 'title', 'parent_id', 'sort_order', 'content', 'created_at', 'updated_at'],
    row: (e) => [sqlStr(e.rowKey), sqlStr(e.partitionKey), sqlStr(e.title), sqlStr(e.parentId), sqlNum(e.order), sqlStr(e.content), sqlStr(e.createdAt), sqlStr(e.updatedAt)]
  }
};

function main() {
  const lines = [];
  const summary = [];

  for (const [table, spec] of Object.entries(TABLES)) {
    const file = path.join(EXPORT_DIR, `${spec.file}.json`);
    if (!fs.existsSync(file)) {
      console.warn(`Skipping ${table}: ${file} not found (run export-azure-tables.js first)`);
      continue;
    }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const entity of rows) {
      const values = spec.row(entity);
      lines.push(`INSERT INTO ${table} (${spec.columns.join(', ')}) VALUES (${values.join(', ')});`);
    }
    summary.push({ table, rows: rows.length });
  }

  fs.writeFileSync(OUT_FILE, lines.join('\n') + '\n');
  console.log(`Wrote ${lines.length} INSERT statements to ${path.relative(process.cwd(), OUT_FILE)}`);
  console.table(summary);
}

main();

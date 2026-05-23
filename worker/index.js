/**
 * 忆闪 YiShan - 微信小程序 Cloudflare Worker API
 * SM-2 算法格式 · 多端同步 · JWT 认证（优化版）
 *
 * 部署：wrangler deploy
 * D1 初始化：wrangler d1 execute yishan --file=./schema.sql
 */

const ALLOWED_ORIGINS = [
  'https://yishan.pages.dev',
  'https://yishan-api.workers.dev',
  'https://yishan-api.15703377328.workers.dev',
  'https://mp.weixin.qq.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

/* ==================== JWT 工具 ==================== */

function base64urlEncode(data) {
  // 通用 base64url 编码（浏览器/Worker 兼容）
  var str = typeof data === 'string' ? data : String.fromCharCode(...new Uint8Array(data));
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  var binaryStr = atob(str);
  var bytes = new Uint8Array(binaryStr.length);
  for (var i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

async function signJWT(payload, secret) {
  var header = { alg: 'HS256', typ: 'JWT' };
  var encodedHeader = base64urlEncode(JSON.stringify(header));
  var encodedPayload = base64urlEncode(JSON.stringify(payload));
  var data = encodedHeader + '.' + encodedPayload;

  var key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  var signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  var encodedSig = base64urlEncode(signature);

  return data + '.' + encodedSig;
}

async function verifyJWT(token, secret) {
  var parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');

  var data = parts[0] + '.' + parts[1];
  var key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  var sigBytes = base64urlDecode(parts[2]);
  var valid = await crypto.subtle.verify(
    'HMAC', key,
    sigBytes,
    new TextEncoder().encode(data)
  );
  if (!valid) throw new Error('Invalid signature');

  var payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));

  // 检查过期时间
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}

async function hashPassword(password, saltHex) {
  var salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  var keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    { name: 'PBKDF2' }, false, ['deriveBits']
  );
  var bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return { hash: bytesToHex(bits), salt: bytesToHex(salt) };
}

function bytesToHex(bytes) {
  return new Uint8Array(bytes).reduce(function (acc, b) {
    return acc + b.toString(16).padStart(2, '0');
  }, '');
}

function hexToBytes(hex) {
  var bytes = new Uint8Array(hex.length / 2);
  for (var i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/* ==================== 认证中间件 ==================== */

async function getUser(request, secret) {
  var auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    var token = auth.split(' ')[1];
    return await verifyJWT(token, secret);
  } catch (e) {
    return null;
  }
}

/* ==================== DB 工具 ==================== */

async function ensureTables(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mp_words (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      word TEXT NOT NULL,
      definition TEXT NOT NULL,
      sounds_like TEXT,
      part_of_speech TEXT,
      phonetic TEXT,
      example TEXT,
      category TEXT,
      stability REAL DEFAULT 0,
      ease REAL DEFAULT 2.5,
      interval INTEGER DEFAULT 0,
      repetitions INTEGER DEFAULT 0,
      next_review INTEGER,
      last_seen INTEGER,
      quality INTEGER DEFAULT 0,
      streak INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS mp_study_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date INTEGER,
      words_studied INTEGER DEFAULT 0,
      mastered INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      duration INTEGER DEFAULT 0,
      avg_quality REAL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  // Ensure users table for auth (email + WeChat)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      password_hash TEXT,
      salt TEXT,
      wx_openid TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  // Migration: add wx_openid if missing
  try { await db.exec(`ALTER TABLE users ADD COLUMN wx_openid TEXT`); } catch(e) {}
}

/* ==================== 路由处理 ==================== */

function json(data, status) {
  status = status || 200;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}

function handleOptions(request) {
  var origin = request.headers.get('Origin') || '';
  var headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };

  // 限制允许的 Origin（可选，当前允许所有）
  headers['Access-Control-Allow-Origin'] = '*';

  return new Response(null, { status: 204, headers: headers });
}

async function handleRequest(request, env) {
  var url = new URL(request.url);
  var path = url.pathname;
  var method = request.method;

  // CORS 预检
  if (method === 'OPTIONS') {
    return handleOptions(request);
  }

  try {
    // 注册
    if (path === '/api/mp/register' && method === 'POST') {
      return await mpRegister(request, env);
    }
    // 登录
    if (path === '/api/mp/login' && method === 'POST') {
      return await mpLogin(request, env);
    }
    // 微信登录
    if (path === '/api/mp/wx-login' && method === 'POST') {
      return await mpWxLogin(request, env);
    }
    // 获取单词列表
    if (path === '/api/mp/words' && method === 'GET') {
      return await mpGetWords(request, env);
    }
    // 添加单词
    if (path === '/api/mp/words' && method === 'POST') {
      return await mpAddWord(request, env);
    }
    // 更新单词
    if (path.startsWith('/api/mp/words/') && method === 'PUT') {
      var id = path.replace('/api/mp/words/', '');
      return await mpUpdateWord(request, env, id);
    }
    // 删除单词
    if (path.startsWith('/api/mp/words/') && method === 'DELETE') {
      var delId = path.replace('/api/mp/words/', '');
      return await mpDeleteWord(request, env, delId);
    }
    // 批量同步
    if (path === '/api/mp/sync' && method === 'POST') {
      return await mpSync(request, env);
    }
    // 学习记录
    if (path === '/api/mp/log' && method === 'POST') {
      return await mpLog(request, env);
    }
    // 健康检查
    if (path === '/api/mp/health') {
      return json({ ok: true, time: Date.now() });
    }

    return json({ error: 'Not found: ' + path }, 404);
  } catch (err) {
    console.error('[Worker] Error:', err.stack || err.message);
    return json({ error: err.message || 'Internal error' }, 500);
  }
}

/* ==================== 认证路由 ==================== */

async function mpRegister(request, env) {
  await ensureTables(env.DB);
  var body = await request.json();
  var email = (body.email || '').trim().toLowerCase();
  var password = body.password || '';

  if (!email || !password || password.length < 6) {
    return json({ error: '邮箱或密码不合法（密码至少6位）' }, 400);
  }

  var existing = await env.DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email).first();
  if (existing) {
    return json({ error: '该邮箱已注册' }, 409);
  }

  var hashResult = await hashPassword(password);
  var userId = crypto.randomUUID();
  var now = Date.now();

  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, email, hashResult.hash, hashResult.salt, now).run();

  var token = await signJWT(
    { sub: userId, email: email, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
    env.JWT_SECRET || 'dev-secret-yishan-2024'
  );

  return json({ user: { id: userId, email: email }, token: token }, 201);
}

async function mpLogin(request, env) {
  await ensureTables(env.DB);
  var body = await request.json();
  var email = (body.email || '').trim().toLowerCase();
  var password = body.password || '';

  var userRecord = await env.DB
    .prepare('SELECT * FROM users WHERE email = ?')
    .bind(email).first();
  if (!userRecord) {
    return json({ error: '邮箱或密码错误' }, 401);
  }

  var hashResult = await hashPassword(password, userRecord.salt);
  if (hashResult.hash !== userRecord.password_hash) {
    return json({ error: '邮箱或密码错误' }, 401);
  }

  var token = await signJWT(
    { sub: userRecord.id, email: userRecord.email, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
    env.JWT_SECRET || 'dev-secret-yishan-2024'
  );

  return json({ user: { id: userRecord.id, email: userRecord.email }, token: token });
}

/* ==================== 单词路由 ==================== */

async function mpGetWords(request, env) {
  var user = await getUser(request, env.JWT_SECRET || 'dev-secret-yishan-2024');
  if (!user) return json({ error: 'Unauthorized' }, 401);

  var url = new URL(request.url);
  var mode = url.searchParams.get('mode') || 'all';
  var now = Date.now();

  var query, params;
  if (mode === 'study') {
    query = 'SELECT * FROM mp_words WHERE user_id = ? AND (next_review IS NULL OR next_review <= ?) ORDER BY next_review ASC LIMIT 50';
    params = [user.sub, now];
  } else {
    query = 'SELECT * FROM mp_words WHERE user_id = ? ORDER BY created_at DESC';
    params = [user.sub];
  }

  var result = await env.DB.prepare(query).bind(...params).all();
  return json({ words: (result.results || []).map(formatWord) });
}

async function mpAddWord(request, env) {
  var user = await getUser(request, env.JWT_SECRET || 'dev-secret-yishan-2024');
  if (!user) return json({ error: 'Unauthorized' }, 401);

  var word = await request.json();
  if (!word.word || !word.definition) {
    return json({ error: 'word 和 definition 为必填字段' }, 400);
  }

  await ensureTables(env.DB);
  var now = Date.now();
  var id = word.id || crypto.randomUUID();

  await env.DB.prepare(`
    INSERT OR REPLACE INTO mp_words (
      id, user_id, word, definition, sounds_like, part_of_speech, phonetic,
      example, category, stability, ease, interval, repetitions,
      next_review, last_seen, quality, streak, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.sub, word.word, word.definition,
    word.sounds_like || null, word.part_of_speech || null, word.phonetic || null,
    word.example || null, word.category || null,
    word.stability || 0, word.ease || 2.5, word.interval || 0, word.repetitions || 0,
    word.next_review || null, word.last_seen || null, word.quality || 0, word.streak || 0,
    word.created_at || now, now
  ).run();

  return json({ id: id });
}

async function mpUpdateWord(request, env, id) {
  var user = await getUser(request, env.JWT_SECRET || 'dev-secret-yishan-2024');
  if (!user) return json({ error: 'Unauthorized' }, 401);

  var updates = await request.json();
  var fields = [];
  var values = [];
  var allowed = [
    'word', 'definition', 'sounds_like', 'part_of_speech', 'phonetic',
    'example', 'category', 'stability', 'ease', 'interval', 'repetitions',
    'next_review', 'last_seen', 'quality', 'streak'
  ];

  for (var i = 0; i < allowed.length; i++) {
    var key = allowed[i];
    if (key in updates) {
      fields.push(key + ' = ?');
      values.push(updates[key]);
    }
  }

  if (fields.length === 0) {
    return json({ error: 'No fields to update' }, 400);
  }

  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);
  values.push(user.sub);

  var sql = 'UPDATE mp_words SET ' + fields.join(', ') + ' WHERE id = ? AND user_id = ?';
  var result = await env.DB.prepare(sql).bind(...values).run();

  if (!result.success) return json({ error: 'Word not found or not yours' }, 404);
  return json({ success: true });
}

async function mpDeleteWord(request, env, id) {
  var user = await getUser(request, env.JWT_SECRET || 'dev-secret-yishan-2024');
  if (!user) return json({ error: 'Unauthorized' }, 401);

  var result = await env.DB.prepare(
    'DELETE FROM mp_words WHERE id = ? AND user_id = ?'
  ).bind(id, user.sub).run();

  if (!result.success) return json({ error: 'Word not found' }, 404);
  return json({ success: true });
}

async function mpSync(request, env) {
  var user = await getUser(request, env.JWT_SECRET || 'dev-secret-yishan-2024');
  if (!user) return json({ error: 'Unauthorized' }, 401);

  var body = await request.json();
  var words = body.words || [];
  if (!Array.isArray(words)) return json({ error: 'words must be an array' }, 400);

  await ensureTables(env.DB);
  var now = Date.now();

  // 删除用户所有旧词
  await env.DB.prepare('DELETE FROM mp_words WHERE user_id = ?').bind(user.sub).run();

  // 批量插入
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    var id = w.id || crypto.randomUUID();
    await env.DB.prepare(`
      INSERT OR REPLACE INTO mp_words (
        id, user_id, word, definition, sounds_like, part_of_speech, phonetic,
        example, category, stability, ease, interval, repetitions,
        next_review, last_seen, quality, streak, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, user.sub, w.word || '', w.definition || '',
      w.sounds_like || null, w.part_of_speech || null, w.phonetic || null,
      w.example || null, w.category || null,
      w.stability || 0, w.ease || 2.5, w.interval || 0, w.repetitions || 0,
      w.next_review || null, w.last_seen || null, w.quality || 0, w.streak || 0,
      w.created_at || now, now
    ).run();
  }

  return json({ success: true, imported: words.length });
}

/* ==================== 学习记录 ==================== */

async function mpLog(request, env) {
  var user = await getUser(request, env.JWT_SECRET || 'dev-secret-yishan-2024');
  if (!user) return json({ error: 'Unauthorized' }, 401);

  var log = await request.json();
  await ensureTables(env.DB);
  var now = Date.now();
  var id = log.id || crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO mp_study_logs (id, user_id, date, words_studied, mastered, failed, duration, avg_quality, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.sub,
    log.date || now,
    log.words_studied || 0, log.mastered || 0, log.failed || 0,
    log.duration || 0, log.avg_quality || 0, now
  ).run();

  return json({ id: id });
}

/* ==================== 微信登录 ==================== */

async function mpWxLogin(request, env) {
  var body = await request.json();
  var code = body.code || '';
  if (!code) return json({ error: 'Missing code' }, 400);

  var appId = env.WX_APPID || '';
  var appSecret = env.WX_APPSECRET || '';
  if (!appId || !appSecret) {
    return json({ error: 'WeChat app not configured (WX_APPID/WX_APPSECRET)' }, 500);
  }

  var wxUrl = 'https://api.weixin.qq.com/sns/jscode2session?appid=' + appId +
    '&secret=' + appSecret + '&js_code=' + encodeURIComponent(code) +
    '&grant_type=authorization_code';

  var wxRes = await fetch(wxUrl);
  var wxData = await wxRes.json();

  if (wxData.errcode) {
    return json({ error: 'WeChat login failed: ' + (wxData.errmsg || 'unknown') }, 401);
  }

  var openid = wxData.openid;
  if (!openid) return json({ error: 'No openid returned' }, 500);

  await ensureTables(env.DB);

  var user = await env.DB.prepare('SELECT * FROM users WHERE wx_openid = ?').bind(openid).first();
  if (!user) {
    var userId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO users (id, wx_openid, created_at) VALUES (?, ?, ?)')
      .bind(userId, openid, Date.now()).run();
    user = { id: userId, wx_openid: openid };
  }

  var jwtSecret = env.JWT_SECRET || 'dev-secret-yishan-2024';
  var token = await signJWT(
    { sub: user.id, openid: openid, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
    jwtSecret
  );

  return json({ user: { id: user.id, openid: openid }, token: token });
}

/* ==================== 响应格式化 ==================== */

function formatWord(r) {
  return {
    id: r.id,
    word: r.word,
    definition: r.definition,
    sounds_like: r.sounds_like,
    part_of_speech: r.part_of_speech,
    phonetic: r.phonetic,
    example: r.example,
    category: r.category,
    stability: r.stability,
    ease: r.ease,
    interval: r.interval,
    repetitions: r.repetitions,
    next_review: r.next_review,
    last_seen: r.last_seen,
    quality: r.quality,
    streak: r.streak,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/* ==================== 启动入口 ==================== */

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};
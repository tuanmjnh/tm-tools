const { db } = require('./sqlite.cjs')

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const now = () => new Date().toISOString()

function safeBind(val) {
  if (val === undefined || val === null) return null
  if (typeof val === 'boolean') return val ? 1 : 0
  return val
}

function initProfilesDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT 'primary',
      icon TEXT DEFAULT 'i-lucide-folder',
      description TEXT,
      sort INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS profile_proxies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'http',
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT,
      password TEXT,
      status TEXT DEFAULT 'unknown',
      country TEXT,
      country_code TEXT,
      ip TEXT,
      latency_ms INTEGER,
      last_checked_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS browser_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_id TEXT,
      proxy_id TEXT,
      raw_proxy TEXT,
      browser_type TEXT DEFAULT 'chrome',
      browser_version TEXT DEFAULT '124.0.0.0',
      os TEXT DEFAULT 'windows',
      user_agent TEXT,
      screen_resolution TEXT DEFAULT '1920x1080',
      color_depth INTEGER DEFAULT 24,
      hardware_concurrency INTEGER DEFAULT 8,
      device_memory INTEGER DEFAULT 8,
      languages TEXT DEFAULT 'en-US,en',
      webrtc_mode TEXT DEFAULT 'proxy',
      timezone_mode TEXT DEFAULT 'auto',
      timezone_val TEXT DEFAULT 'Asia/Ho_Chi_Minh',
      geo_mode TEXT DEFAULT 'auto',
      geo_lat REAL,
      geo_lng REAL,
      geo_accuracy REAL DEFAULT 100,
      canvas_mode TEXT DEFAULT 'noise',
      webgl_mode TEXT DEFAULT 'noise',
      webgl_vendor TEXT DEFAULT 'Google Inc. (NVIDIA)',
      webgl_renderer TEXT DEFAULT 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
      audio_mode TEXT DEFAULT 'noise',
      client_rects_mode TEXT DEFAULT 'noise',
      fonts_mode TEXT DEFAULT 'system',
      fonts_list TEXT,
      extensions TEXT,
      start_url TEXT DEFAULT 'https://whoer.net',
      notes TEXT,
      tags TEXT,
      sort INTEGER DEFAULT 0,
      flag INTEGER DEFAULT 1,
      last_launched_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS profile_accounts (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT,
      two_fa_secret TEXT,
      recovery_email TEXT,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    );
  `)

  // Safe migrations for newer columns
  const tryAddCol = (colDef) => {
    try { db.exec(`ALTER TABLE browser_profiles ADD COLUMN ${colDef};`) } catch { /* ignore */ }
  }
  tryAddCol('browser_id TEXT')
  tryAddCol('browser_engine TEXT')
  tryAddCol('custom_exe TEXT')
  tryAddCol('stealth_mode INTEGER DEFAULT 1')
  tryAddCol('stealth_engine TEXT DEFAULT "playwright_stealth"')

  // Insert default group if none exists
  const groupCount = db.prepare('SELECT COUNT(*) as count FROM profile_groups').get()
  if (groupCount.count === 0) {
    const defaultId = uuid()
    db.prepare('INSERT INTO profile_groups (id, name, color, icon, description, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(defaultId, 'Default', 'primary', 'i-lucide-folder', 'Default profile group', 0, now(), now())
  }
}

initProfilesDb()

const profilesDb = {
  // ==================== GROUPS ====================
  listGroups: () => {
    return db.prepare(`
      SELECT g.*, COUNT(p.id) AS profile_count
      FROM profile_groups g
      LEFT JOIN browser_profiles p ON p.group_id = g.id AND p.flag = 1
      GROUP BY g.id
      ORDER BY g.sort ASC, g.created_at ASC
    `).all()
  },

  getGroup: (id) => {
    return db.prepare('SELECT * FROM profile_groups WHERE id=?').get(id)
  },

  createGroup: (data) => {
    const id = uuid()
    db.prepare(`
      INSERT INTO profile_groups (id, name, color, icon, description, sort, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.color || 'primary',
      data.icon || 'i-lucide-folder',
      data.description || null,
      Number(data.sort) || 0,
      now(),
      now()
    )
    return id
  },

  updateGroup: (id, data) => {
    db.prepare(`
      UPDATE profile_groups
      SET name=?, color=?, icon=?, description=?, sort=?, updated_at=?
      WHERE id=?
    `).run(
      data.name,
      data.color || 'primary',
      data.icon || 'i-lucide-folder',
      data.description || null,
      Number(data.sort) || 0,
      now(),
      id
    )
  },

  deleteGroup: (idOrIds) => {
    const ids = Array.isArray(idOrIds)
      ? idOrIds
      : (typeof idOrIds === 'string' ? idOrIds.split(',').map(s => s.trim()).filter(Boolean) : [idOrIds])
    if (ids.length === 0) return { changes: 0 }
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(`UPDATE browser_profiles SET group_id=NULL WHERE group_id IN (${placeholders})`).run(...ids)
    return db.prepare(`DELETE FROM profile_groups WHERE id IN (${placeholders})`).run(...ids)
  },

  // ==================== PROXIES ====================
  listProxies: () => {
    return db.prepare(`
      SELECT pr.*, COUNT(p.id) AS profile_count
      FROM profile_proxies pr
      LEFT JOIN browser_profiles p ON p.proxy_id = pr.id AND p.flag = 1
      GROUP BY pr.id
      ORDER BY pr.created_at DESC
    `).all()
  },

  getProxy: (id) => {
    return db.prepare('SELECT * FROM profile_proxies WHERE id=?').get(id)
  },

  createProxy: (data) => {
    const id = uuid()
    db.prepare(`
      INSERT INTO profile_proxies (id, name, type, host, port, username, password, status, country, country_code, ip, latency_ms, last_checked_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.type || 'http',
      data.host,
      Number(data.port),
      data.username || null,
      data.password || null,
      data.status || 'unknown',
      data.country || null,
      data.country_code || null,
      data.ip || null,
      data.latency_ms ?? null,
      data.last_checked_at || null,
      now(),
      now()
    )
    return id
  },

  updateProxy: (id, data) => {
    db.prepare(`
      UPDATE profile_proxies
      SET name=?, type=?, host=?, port=?, username=?, password=?, status=?, country=?, country_code=?, ip=?, latency_ms=?, last_checked_at=?, updated_at=?
      WHERE id=?
    `).run(
      data.name,
      data.type || 'http',
      data.host,
      Number(data.port),
      data.username || null,
      data.password || null,
      data.status || 'unknown',
      data.country || null,
      data.country_code || null,
      data.ip || null,
      data.latency_ms ?? null,
      data.last_checked_at || null,
      now(),
      id
    )
  },

  deleteProxy: (idOrIds) => {
    const ids = Array.isArray(idOrIds)
      ? idOrIds
      : (typeof idOrIds === 'string' ? idOrIds.split(',').map(s => s.trim()).filter(Boolean) : [idOrIds])
    if (ids.length === 0) return { changes: 0 }
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(`UPDATE browser_profiles SET proxy_id=NULL WHERE proxy_id IN (${placeholders})`).run(...ids)
    return db.prepare(`DELETE FROM profile_proxies WHERE id IN (${placeholders})`).run(...ids)
  },

  // ==================== PROFILES ====================
  listProfiles: (filters = {}) => {
    const {
      groupId,
      search,
      status,
      limit = 50,
      offset = 0
    } = filters

    let query = `
      SELECT p.*,
        g.name as group_name, g.color as group_color, g.icon as group_icon,
        pr.name as proxy_name, pr.type as proxy_type, pr.host as proxy_host, pr.port as proxy_port, pr.country as proxy_country, pr.status as proxy_status
      FROM browser_profiles p
      LEFT JOIN profile_groups g ON p.group_id = g.id
      LEFT JOIN profile_proxies pr ON p.proxy_id = pr.id
      WHERE p.flag = 1
    `
    const params = []

    if (groupId) {
      query += ' AND p.group_id = ?'
      params.push(groupId)
    }

    if (search) {
      query += ' AND (p.name LIKE ? OR p.notes LIKE ? OR p.tags LIKE ? OR p.user_agent LIKE ?)'
      const term = `%${search}%`
      params.push(term, term, term, term)
    }

    // Count total matching rows
    const countSql = `SELECT COUNT(*) as total FROM (${query})`
    const totalRow = db.prepare(countSql).get(...params)
    const total = totalRow ? totalRow.total : 0

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), Number(offset))

    const rows = db.prepare(query).all(...params)

    // parse JSON fields
    const items = rows.map((r) => {
      let tags = []
      let extensions = []
      let fontsList = []
      try {
        if (r.tags) tags = JSON.parse(r.tags)
      } catch { }
      try {
        if (r.extensions) extensions = JSON.parse(r.extensions)
      } catch { }
      try {
        if (r.fonts_list) fontsList = JSON.parse(r.fonts_list)
      } catch { }

      return {
        ...r,
        tags,
        extensions,
        fonts_list: fontsList
      }
    })

    return {
      items,
      total,
      limit: Number(limit),
      offset: Number(offset)
    }
  },

  getProfile: (id) => {
    const row = db.prepare(`
      SELECT p.*,
        g.name as group_name, g.color as group_color, g.icon as group_icon,
        pr.name as proxy_name, pr.type as proxy_type, pr.host as proxy_host, pr.port as proxy_port, pr.country as proxy_country, pr.status as proxy_status
      FROM browser_profiles p
      LEFT JOIN profile_groups g ON p.group_id = g.id
      LEFT JOIN profile_proxies pr ON p.proxy_id = pr.id
      WHERE p.id = ? AND p.flag = 1
    `).get(id)

    if (!row) return null

    let tags = []
    let extensions = []
    let fontsList = []
    try {
      if (row.tags) tags = JSON.parse(row.tags)
    } catch { }
    try {
      if (row.extensions) extensions = JSON.parse(row.extensions)
    } catch { }
    try {
      if (row.fonts_list) fontsList = JSON.parse(row.fonts_list)
    } catch { }

    const accounts = db.prepare('SELECT * FROM profile_accounts WHERE profile_id=? ORDER BY created_at DESC').all(id)

    return {
      ...row,
      tags,
      extensions,
      fonts_list: fontsList,
      accounts
    }
  },

  createProfile: (data) => {
    const id = uuid()
    const tagsJson = Array.isArray(data.tags) ? JSON.stringify(data.tags) : (data.tags || '[]')
    const extJson = Array.isArray(data.extensions) ? JSON.stringify(data.extensions) : (data.extensions || '[]')
    const fontsJson = Array.isArray(data.fonts_list) ? JSON.stringify(data.fonts_list) : (data.fonts_list || '[]')

    db.prepare(`
      INSERT INTO browser_profiles (
        id, name, group_id, proxy_id, raw_proxy,
        browser_type, browser_version, os, user_agent,
        screen_resolution, color_depth, hardware_concurrency, device_memory, languages,
        webrtc_mode, timezone_mode, timezone_val, geo_mode, geo_lat, geo_lng, geo_accuracy,
        canvas_mode, webgl_mode, webgl_vendor, webgl_renderer, audio_mode, client_rects_mode,
        fonts_mode, fonts_list, extensions, start_url, notes, tags, sort, flag,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, 1,
        ?, ?
      )
    `).run(
      id,
      data.name,
      safeBind(data.group_id),
      safeBind(data.proxy_id),
      safeBind(data.raw_proxy),
      data.browser_type || 'chrome',
      data.browser_version || '124.0.0.0',
      data.os || 'windows',
      data.user_agent || null,
      data.screen_resolution || '1920x1080',
      Number(data.color_depth) || 24,
      Number(data.hardware_concurrency) || 8,
      Number(data.device_memory) || 8,
      data.languages || 'en-US,en',
      data.webrtc_mode || 'proxy',
      data.timezone_mode || 'auto',
      data.timezone_val || 'Asia/Ho_Chi_Minh',
      data.geo_mode || 'auto',
      safeBind(data.geo_lat),
      safeBind(data.geo_lng),
      Number(data.geo_accuracy) || 100,
      data.canvas_mode || 'noise',
      data.webgl_mode || 'noise',
      data.webgl_vendor || 'Google Inc. (NVIDIA)',
      data.webgl_renderer || 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
      data.audio_mode || 'noise',
      data.client_rects_mode || 'noise',
      data.fonts_mode || 'system',
      fontsJson,
      extJson,
      data.start_url || 'https://whoer.net',
      data.notes || null,
      tagsJson,
      Number(data.sort) || 0,
      now(),
      now()
    )

    return id
  },

  updateProfile: (id, data) => {
    const tagsJson = Array.isArray(data.tags) ? JSON.stringify(data.tags) : (data.tags || '[]')
    const extJson = Array.isArray(data.extensions) ? JSON.stringify(data.extensions) : (data.extensions || '[]')
    const fontsJson = Array.isArray(data.fonts_list) ? JSON.stringify(data.fonts_list) : (data.fonts_list || '[]')

    db.prepare(`
      UPDATE browser_profiles SET
        name = ?, group_id = ?, proxy_id = ?, raw_proxy = ?,
        browser_type = ?, browser_version = ?, os = ?, user_agent = ?,
        screen_resolution = ?, color_depth = ?, hardware_concurrency = ?, device_memory = ?, languages = ?,
        webrtc_mode = ?, timezone_mode = ?, timezone_val = ?, geo_mode = ?, geo_lat = ?, geo_lng = ?, geo_accuracy = ?,
        canvas_mode = ?, webgl_mode = ?, webgl_vendor = ?, webgl_renderer = ?, audio_mode = ?, client_rects_mode = ?,
        fonts_mode = ?, fonts_list = ?, extensions = ?, start_url = ?, notes = ?, tags = ?, sort = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      data.name,
      safeBind(data.group_id),
      safeBind(data.proxy_id),
      safeBind(data.raw_proxy),
      data.browser_type || 'chrome',
      data.browser_version || '124.0.0.0',
      data.os || 'windows',
      data.user_agent || null,
      data.screen_resolution || '1920x1080',
      Number(data.color_depth) || 24,
      Number(data.hardware_concurrency) || 8,
      Number(data.device_memory) || 8,
      data.languages || 'en-US,en',
      data.webrtc_mode || 'proxy',
      data.timezone_mode || 'auto',
      data.timezone_val || 'Asia/Ho_Chi_Minh',
      data.geo_mode || 'auto',
      safeBind(data.geo_lat),
      safeBind(data.geo_lng),
      Number(data.geo_accuracy) || 100,
      data.canvas_mode || 'noise',
      data.webgl_mode || 'noise',
      data.webgl_vendor || 'Google Inc. (NVIDIA)',
      data.webgl_renderer || 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
      data.audio_mode || 'noise',
      data.client_rects_mode || 'noise',
      data.fonts_mode || 'system',
      fontsJson,
      extJson,
      data.start_url || 'https://whoer.net',
      data.notes || null,
      tagsJson,
      Number(data.sort) || 0,
      now(),
      id
    )
  },

  updateLastLaunched: (id) => {
    db.prepare('UPDATE browser_profiles SET last_launched_at=? WHERE id=?').run(now(), id)
  },

  deleteProfiles: (idOrIds) => {
    if (!idOrIds) return { changes: 0 }
    let ids = []
    if (Array.isArray(idOrIds)) {
      ids = idOrIds
    } else if (typeof idOrIds === 'string') {
      ids = idOrIds.split(',').map(s => s.trim()).filter(Boolean)
    }
    if (ids.length === 0) return { changes: 0 }

    const placeholders = ids.map(() => '?').join(',')
    return db.prepare(`UPDATE browser_profiles SET flag=0, updated_at=? WHERE id IN (${placeholders})`).run(now(), ...ids)
  },

  cloneProfile: (id, newName) => {
    const original = profilesDb.getProfile(id)
    if (!original) throw new Error('Profile not found')

    const cloneData = {
      ...original,
      name: newName || `${original.name} (Copy)`
    }
    delete cloneData.id
    delete cloneData.created_at
    delete cloneData.updated_at
    delete cloneData.last_launched_at
    delete cloneData.accounts

    return profilesDb.createProfile(cloneData)
  },

  // ==================== ACCOUNTS ====================
  listAccounts: (profileId) => {
    return db.prepare('SELECT * FROM profile_accounts WHERE profile_id=? ORDER BY created_at DESC').all(profileId)
  },

  addAccount: (data) => {
    const id = uuid()
    db.prepare(`
      INSERT INTO profile_accounts (id, profile_id, platform, username, password, two_fa_secret, recovery_email, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.profile_id,
      data.platform || 'custom',
      data.username,
      data.password || null,
      data.two_fa_secret || null,
      data.recovery_email || null,
      data.status || 'active',
      data.notes || null,
      now(),
      now()
    )
    return id
  },

  deleteAccount: (id) => {
    return db.prepare('DELETE FROM profile_accounts WHERE id=?').run(id)
  }
}

module.exports = {
  profilesDb
}

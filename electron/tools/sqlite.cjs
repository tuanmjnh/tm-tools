const Database = require('better-sqlite3')
const { app } = require('electron')
const { resolve } = require('path')
const fs = require('fs')
const { getResourcePath } = require('./paths.cjs')

const dbPath = resolve(app.getPath('userData'), 'tools.sqlite')
const db = new Database(dbPath)

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS youtube_formats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      code TEXT,
      opt TEXT NOT NULL,
      w INTEGER DEFAULT 0,
      h INTEGER DEFAULT 0,
      sort INTEGER DEFAULT 1,
      flag INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS youtube_configs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      format_id TEXT REFERENCES youtube_formats(id),
      out_path TEXT,
      file_name TEXT DEFAULT '%(title)s.%(ext)s',
      threads INTEGER DEFAULT 2,
      restrict INTEGER DEFAULT 0,
      overwrite INTEGER DEFAULT 1,
      encoding TEXT DEFAULT 'utf-8',
      flag INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS youtube_history (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      format_id TEXT,
      format_title TEXT,
      out_path TEXT,
      file_name TEXT,
      file_size INTEGER,
      duration REAL,
      status TEXT CHECK(status IN ('completed','failed','cancelled')),
      error_message TEXT,
      config_id TEXT,
      config_title TEXT,
      threads INTEGER,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ffmpeg_configs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT,
      aspect_ratio INTEGER,
      background_type TEXT CHECK(background_type IN ('color','boxblur','file')),
      background_color TEXT DEFAULT '#000000',
      background_boxblur REAL DEFAULT 10,
      background_file TEXT,
      center INTEGER DEFAULT 1,
      speed REAL DEFAULT 1,
      volume REAL DEFAULT 1,
      zoom_enable INTEGER DEFAULT 0,
      zoom_ratio REAL DEFAULT 1.1,
      zoom_time_start REAL DEFAULT 0,
      zoom_time_duration REAL DEFAULT 0,
      zoom_time_loop REAL DEFAULT 0,
      hflip_enable INTEGER DEFAULT 0,
      hflip_all INTEGER DEFAULT 1,
      hflip_time_start REAL DEFAULT 0,
      hflip_time_duration REAL DEFAULT 0,
      hflip_time_loop REAL DEFAULT 0,
      vflip_enable INTEGER DEFAULT 0,
      vflip_all INTEGER DEFAULT 1,
      vflip_time_start REAL DEFAULT 0,
      vflip_time_duration REAL DEFAULT 0,
      vflip_time_loop REAL DEFAULT 0,
      scale_x INTEGER DEFAULT 0,
      scale_y INTEGER DEFAULT 0,
      scale_w INTEGER DEFAULT 0,
      scale_h INTEGER DEFAULT 0,
      labels TEXT,
      files TEXT,
      subtitle TEXT,
      render_code TEXT,
      flag INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS ffmpeg_batch_configs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      items TEXT NOT NULL,
      threads INTEGER DEFAULT 1,
      output_path TEXT,
      flag INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS ffmpeg_history (
      id TEXT PRIMARY KEY,
      config_id TEXT,
      config_title TEXT,
      batch_config_id TEXT,
      batch_config_title TEXT,
      input_file TEXT,
      input_files TEXT,
      output_file TEXT,
      output_path TEXT,
      operation TEXT CHECK(operation IN ('render','split','join','split_render','join_render')),
      duration REAL,
      file_size INTEGER,
      status TEXT CHECK(status IN ('completed','failed','cancelled')),
      error_message TEXT,
      threads INTEGER,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)
}

init()

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

const now = () => new Date().toISOString()

function safeBind(val) {
  if (val === undefined || val === null) return null
  if (typeof val === 'boolean') return val ? 1 : 0
  return val
}

// Load static formats
let staticFormats = []
try {
  const jsonPath = getResourcePath('youtube-formats.json')
  if (fs.existsSync(jsonPath)) {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    staticFormats = raw.map(item => ({
      id: item._id,
      title: item.title,
      code: Array.isArray(item.code) ? JSON.stringify(item.code) : (item.code ? String(item.code) : null),
      opt: typeof item.opt === 'string' ? item.opt : JSON.stringify(item.opt || []),
      w: item.w || 0,
      h: item.h || 0,
      sort: item.sort || 1,
      flag: item.flag !== undefined ? item.flag : 1
    })).filter(f => f.flag === 1).sort((a, b) => a.sort - b.sort)
  }
} catch (e) {
  console.error('[SQLite] Failed to load static formats:', e)
}

module.exports = {
  db,
  // youtube_formats
  listFormats: () => staticFormats,
  getFormat: id => staticFormats.find(f => f.id === id) || null,
  createFormat: (data) => {
    const id = uuid()
    db.prepare(`INSERT INTO youtube_formats (id,title,code,opt,w,h,sort,flag,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(safeBind(id), safeBind(data.title), safeBind(data.code), JSON.stringify(data.opt), safeBind(data.w), safeBind(data.h), safeBind(data.sort), safeBind(data.flag ?? 1), now(), now())
    return id
  },
  updateFormat: (id, data) => {
    db.prepare(`UPDATE youtube_formats SET title=?,code=?,opt=?,w=?,h=?,sort=?,flag=?,updated_at=? WHERE id=?`)
      .run(safeBind(data.title), safeBind(data.code), JSON.stringify(data.opt), safeBind(data.w), safeBind(data.h), safeBind(data.sort), safeBind(data.flag), now(), safeBind(id))
  },
  deleteFormat: id => db.prepare('UPDATE youtube_formats SET flag=0 WHERE id=?').run(safeBind(id)),

  // youtube_configs
  listConfigs: () => db.prepare('SELECT * FROM youtube_configs WHERE flag=1 ORDER BY created_at DESC').all(),
  getConfig: id => db.prepare('SELECT * FROM youtube_configs WHERE id=?').get(id),
  createConfig: (data) => {
    const id = uuid()
    db.prepare(`INSERT INTO youtube_configs (id,title,format_id,out_path,file_name,threads,restrict,overwrite,encoding,flag,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        safeBind(id),
        safeBind(data.title),
        safeBind(data.format_id),
        safeBind(data.out_path),
        safeBind(data.file_name),
        safeBind(data.threads),
        safeBind(data.restrict),
        safeBind(data.overwrite),
        safeBind(data.encoding),
        safeBind(data.flag ?? 1),
        now(),
        now()
      )
    return id
  },
  updateConfig: (id, data) => {
    db.prepare(`UPDATE youtube_configs SET title=?,format_id=?,out_path=?,file_name=?,threads=?,restrict=?,overwrite=?,encoding=?,flag=?,updated_at=? WHERE id=?`)
      .run(
        safeBind(data.title),
        safeBind(data.format_id),
        safeBind(data.out_path),
        safeBind(data.file_name),
        safeBind(data.threads),
        safeBind(data.restrict),
        safeBind(data.overwrite),
        safeBind(data.encoding),
        safeBind(data.flag),
        now(),
        safeBind(id)
      )
  },
  deleteConfig: id => db.prepare('UPDATE youtube_configs SET flag=0 WHERE id=?').run(safeBind(id)),

  // youtube_history
  addHistory: (data) => {
    const id = uuid()
    db.prepare(`INSERT INTO youtube_history (id,url,title,format_id,format_title,out_path,file_name,file_size,duration,status,error_message,config_id,config_title,threads,started_at,completed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        safeBind(id),
        safeBind(data.url),
        safeBind(data.title),
        safeBind(data.format_id),
        safeBind(data.format_title),
        safeBind(data.out_path),
        safeBind(data.file_name),
        safeBind(data.file_size),
        safeBind(data.duration),
        safeBind(data.status),
        safeBind(data.error_message),
        safeBind(data.config_id),
        safeBind(data.config_title),
        safeBind(data.threads),
        safeBind(data.started_at),
        safeBind(data.completed_at),
        now()
      )
    return id
  },
  updateHistory: (id, data) => {
    const sets = []
    const params = []
    for (const [k, v] of Object.entries(data)) {
      sets.push(`${k}=?`)
      params.push(safeBind(v))
    }
    params.push(safeBind(id))
    db.prepare(`UPDATE youtube_history SET ${sets.join(',')} WHERE id=?`).run(...params)
  },
  listHistory: (limit = 100) => db.prepare('SELECT * FROM youtube_history ORDER BY created_at DESC LIMIT ?').all(limit),
  deleteHistory: () => db.prepare('DELETE FROM youtube_history').run(),

  // ffmpeg_configs
  listFfmpegConfigs: () => db.prepare('SELECT * FROM ffmpeg_configs WHERE flag=1 ORDER BY created_at DESC').all(),
  getFfmpegConfig: id => db.prepare('SELECT * FROM ffmpeg_configs WHERE id=?').get(id),
  createFfmpegConfig: (data) => {
    const id = uuid()
    db.prepare(`INSERT INTO ffmpeg_configs (id,user_id,title,aspect_ratio,background_type,background_color,background_boxblur,background_file,center,speed,volume,zoom_enable,zoom_ratio,zoom_time_start,zoom_time_duration,zoom_time_loop,hflip_enable,hflip_all,hflip_time_start,hflip_time_duration,hflip_time_loop,vflip_enable,vflip_all,vflip_time_start,vflip_time_duration,vflip_time_loop,scale_x,scale_y,scale_w,scale_h,labels,files,subtitle,render_code,flag,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, data.user_id, data.title, data.aspect_ratio, data.background_type, data.background_color, data.background_boxblur, data.background_file, data.center, data.speed, data.volume, data.zoom_enable, data.zoom_ratio, data.zoom_time_start, data.zoom_time_duration, data.zoom_time_loop, data.hflip_enable, data.hflip_all, data.hflip_time_start, data.hflip_time_duration, data.hflip_time_loop, data.vflip_enable, data.vflip_all, data.vflip_time_start, data.vflip_time_duration, data.vflip_time_loop, data.scale_x, data.scale_y, data.scale_w, data.scale_h, typeof data.labels === 'string' ? data.labels : JSON.stringify(data.labels || []), typeof data.files === 'string' ? data.files : JSON.stringify(data.files || []), data.subtitle, typeof data.render_code === 'string' ? data.render_code : JSON.stringify(data.render_code || null), data.flag ?? 1, now(), now())
    return id
  },
  updateFfmpegConfig: (id, data) => {
    db.prepare(`UPDATE ffmpeg_configs SET user_id=?,title=?,aspect_ratio=?,background_type=?,background_color=?,background_boxblur=?,background_file=?,center=?,speed=?,volume=?,zoom_enable=?,zoom_ratio=?,zoom_time_start=?,zoom_time_duration=?,zoom_time_loop=?,hflip_enable=?,hflip_all=?,hflip_time_start=?,hflip_time_duration=?,hflip_time_loop=?,vflip_enable=?,vflip_all=?,vflip_time_start=?,vflip_time_duration=?,vflip_time_loop=?,scale_x=?,scale_y=?,scale_w=?,scale_h=?,labels=?,files=?,subtitle=?,render_code=?,flag=?,updated_at=? WHERE id=?`)
      .run(data.user_id, data.title, data.aspect_ratio, data.background_type, data.background_color, data.background_boxblur, data.background_file, data.center, data.speed, data.volume, data.zoom_enable, data.zoom_ratio, data.zoom_time_start, data.zoom_time_duration, data.zoom_time_loop, data.hflip_enable, data.hflip_all, data.hflip_time_start, data.hflip_time_duration, data.hflip_time_loop, data.vflip_enable, data.vflip_all, data.vflip_time_start, data.vflip_time_duration, data.vflip_time_loop, data.scale_x, data.scale_y, data.scale_w, data.scale_h, typeof data.labels === 'string' ? data.labels : JSON.stringify(data.labels || []), typeof data.files === 'string' ? data.files : JSON.stringify(data.files || []), data.subtitle, typeof data.render_code === 'string' ? data.render_code : JSON.stringify(data.render_code || null), data.flag, now(), id)
  },
  deleteFfmpegConfig: id => db.prepare('UPDATE ffmpeg_configs SET flag=0 WHERE id=?').run(id),

  // ffmpeg_batch_configs
  listFfmpegBatchConfigs: () => db.prepare('SELECT * FROM ffmpeg_batch_configs WHERE flag=1 ORDER BY created_at DESC').all(),
  createFfmpegBatchConfig: (data) => {
    const id = uuid()
    db.prepare(`INSERT INTO ffmpeg_batch_configs (id,title,items,threads,output_path,flag,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, data.title, typeof data.items === 'string' ? data.items : JSON.stringify(data.items || []), data.threads, data.output_path, data.flag ?? 1, now(), now())
    return id
  },
  updateFfmpegBatchConfig: (id, data) => {
    db.prepare(`UPDATE ffmpeg_batch_configs SET title=?,items=?,threads=?,output_path=?,flag=?,updated_at=? WHERE id=?`)
      .run(data.title, typeof data.items === 'string' ? data.items : JSON.stringify(data.items || []), data.threads, data.output_path, data.flag, now(), id)
  },
  deleteFfmpegBatchConfig: id => db.prepare('UPDATE ffmpeg_batch_configs SET flag=0 WHERE id=?').run(id),

  // ffmpeg_history
  addFfmpegHistory: (data) => {
    const id = uuid()
    db.prepare(`INSERT INTO ffmpeg_history (id,config_id,config_title,batch_config_id,batch_config_title,input_file,input_files,output_file,output_path,operation,duration,file_size,status,error_message,threads,started_at,completed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, data.config_id, data.config_title, data.batch_config_id, data.batch_config_title, data.input_file, typeof data.input_files === 'string' ? data.input_files : JSON.stringify(data.input_files || []), data.output_file, data.output_path, data.operation, data.duration, data.file_size, data.status, data.error_message, data.threads, data.started_at, data.completed_at, now())
    return id
  },
  listFfmpegHistory: (limit = 100) => db.prepare('SELECT * FROM ffmpeg_history ORDER BY created_at DESC LIMIT ?').all(limit),
  deleteFfmpegHistory: id => db.prepare('DELETE FROM ffmpeg_history WHERE id=?').run(id)
}

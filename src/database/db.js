
import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Ошибка подключения к БД:', err);
  } else {
    console.log('✅ Подключено к SQLite');
  }
});

// =========================
// 🧱 ИНИЦИАЛИЗАЦИЯ БД
// =========================
db.serialize(() => {
  // 🆕 создаём таблицу если нет
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      name TEXT,
      status TEXT,
      time TEXT,
      reason TEXT,
      date TEXT
    )
  `);

  // 🔥 уникальность (фикс дублей)
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_guild
    ON users(user_id, guild_id)
  `);
});

export default db;


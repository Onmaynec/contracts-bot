import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Ошибка подключения к БД:', err);
  } else {
    console.log('✅ Подключено к SQLite');
  }
});

db.serialize(() => {

  // =========================
  // USERS
  // =========================
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

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_guild
    ON users(user_id, guild_id)
  `);

  // =========================
  // SETTINGS (ПРАВИЛЬНЫЕ ПОЛЯ)
  // =========================
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      guild_id TEXT PRIMARY KEY,
      role1 TEXT,
      role2 TEXT,
      table_channel_id TEXT,
      system_channel_id TEXT
    )
  `);

  // =========================
  // 🔧 МИГРАЦИЯ
  // =========================
  const columns = [
    'role1',
    'role2',
    'table_channel_id',
    'system_channel_id'
  ];

  columns.forEach(col => {
    db.run(
      `ALTER TABLE settings ADD COLUMN ${col} TEXT`,
      (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error(`Ошибка колонки ${col}:`, err.message);
        }
      }
    );
  });

});

export default db;
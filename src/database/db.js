import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Ошибка подключения к БД:', err);
  } else {
    console.log('✅ Подключено к SQLite');
  }
});

// =========================
// 🚀 ИНИЦИАЛИЗАЦИЯ БД
// =========================
db.serialize(() => {

  // =========================
  // 👤 ТАБЛИЦА USERS
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
  // ⚙️ ТАБЛИЦА SETTINGS
  // =========================
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      guild_id TEXT PRIMARY KEY,
      table_channel_id TEXT,
      role1_id TEXT,
      role2_id TEXT,
      system_channel_id TEXT
    )
  `);

  // =========================
  // 🔧 МИГРАЦИЯ (если старая БД)
  // =========================
  const columns = [
    { name: 'table_channel_id', type: 'TEXT' },
    { name: 'role1_id', type: 'TEXT' },
    { name: 'role2_id', type: 'TEXT' },
    { name: 'system_channel_id', type: 'TEXT' }
  ];

  columns.forEach(col => {
    db.run(
      `ALTER TABLE settings ADD COLUMN ${col.name} ${col.type}`,
      (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error(`Ошибка добавления колонки ${col.name}:`, err.message);
        }
      }
    );
  });

});

export default db;
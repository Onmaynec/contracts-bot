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

  // Уникальный индекс на комбинацию user_id + guild_id
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_guild
    ON users(user_id, guild_id)
  `);

  // ✅ ДОБАВЛЕНО: Индекс для быстрого поиска по guild_id и date
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_users_guild_date
    ON users(guild_id, date)
  `);

  // ✅ ДОБАВЛЕНО: Индекс для поиска по дате (для очистки старых записей)
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_users_date
    ON users(date)
  `);

  // =========================
  // SETTINGS
  // =========================
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      guild_id TEXT PRIMARY KEY,
      role1 TEXT,
      role2 TEXT,
      table_channel_id TEXT,
      system_channel_id TEXT,
      log_channel_id TEXT,
      role1_id TEXT,
      role2_id TEXT,
      welcome_channel_id TEXT,
      auto_time TEXT,
      auto_enabled INTEGER DEFAULT 0
    )
  `);

  // =========================
  // 🔧 МИГРАЦИЯ (безопасная)
  // =========================
  const columns = [
    'role1',
    'role2', 
    'table_channel_id',
    'system_channel_id',
    'log_channel_id',
    'role1_id',
    'role2_id',
    'welcome_channel_id',
    'auto_time',
    'auto_enabled'
  ];

  // ✅ ИСПРАВЛЕНО: Безопасная миграция с параметризованными запросами
  db.all("PRAGMA table_info(settings)", [], (err, existingColumns) => {
    if (err) {
      console.error('Ошибка при получении информации о таблице:', err);
      return;
    }

    const existingColumnNames = new Set(existingColumns.map(col => col.name));

    columns.forEach(col => {
      if (!existingColumnNames.has(col)) {
        // ✅ Безопасно: проверяем что имя колонки в белом списке
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
          db.run(
            `ALTER TABLE settings ADD COLUMN ${col} TEXT`,
            (err) => {
              if (err) {
                console.error(`Ошибка добавления колонки ${col}:`, err.message);
              } else {
                console.log(`✅ Колонка ${col} добавлена`);
              }
            }
          );
        } else {
          console.error(`❌ Недопустимое имя колонки: ${col}`);
        }
      }
    });
  });

});

// Обработка ошибок
db.on('error', (err) => {
  console.error('Ошибка SQLite:', err);
});

export default db;

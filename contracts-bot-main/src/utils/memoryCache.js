/**
 * 🧠 Утилита для кеширования в памяти с TTL (Time To Live)
 * Автоматически удаляет устаревшие записи через указанное время
 */

class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
    
    // Запускаем периодическую очистку каждые 10 минут
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Устанавливает значение в кеш с TTL
   * @param {string} key - Ключ
   * @param {*} value - Значение
   * @param {number} ttlMs - Время жизни в миллисекундах (по умолчанию 3 дня)
   */
  set(key, value, ttlMs = 3 * 24 * 60 * 60 * 1000) {
    // Очищаем старый таймер если есть
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Сохраняем значение с метаданными
    this.cache.set(key, {
      value,
      createdAt: Date.now(),
      ttlMs
    });

    // Устанавливаем таймер на удаление
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttlMs);

    this.timers.set(key, timer);
  }

  /**
   * Получает значение из кеша
   * @param {string} key - Ключ
   * @returns {*} Значение или undefined
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    // Проверяем не истек ли TTL
    if (Date.now() - entry.createdAt > entry.ttlMs) {
      this.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  /**
   * Удаляет значение из кеша
   * @param {string} key - Ключ
   */
  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    this.cache.delete(key);
  }

  /**
   * Проверяет существование ключа
   * @param {string} key - Ключ
   * @returns {boolean}
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Проверяем не истек ли TTL
    if (Date.now() - entry.createdAt > entry.ttlMs) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Очищает все устаревшие записи
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > entry.ttlMs) {
        this.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 MemoryCache: очищено ${cleaned} устаревших записей`);
    }
  }

  /**
   * Полностью очищает кеш
   */
  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.cache.clear();
  }

  /**
   * Возвращает статистику кеша
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Создаем глобальный экземпляр
export const memoryCache = new MemoryCache();

// Кеш для broadcast с TTL 3 дня
export const broadcastCache = {
  set(userId, value) {
    memoryCache.set(`broadcast:${userId}`, value, 3 * 24 * 60 * 60 * 1000);
  },
  get(userId) {
    return memoryCache.get(`broadcast:${userId}`);
  },
  delete(userId) {
    memoryCache.delete(`broadcast:${userId}`);
  },
  has(userId) {
    return memoryCache.has(`broadcast:${userId}`);
  }
};

// Кеш для логов таблиц с TTL 3 дня
export const tableLogCache = {
  set(guildId, userId, value) {
    memoryCache.set(`tablelog:${guildId}:${userId}`, value, 3 * 24 * 60 * 60 * 1000);
  },
  get(guildId, userId) {
    return memoryCache.get(`tablelog:${guildId}:${userId}`);
  },
  delete(guildId, userId) {
    memoryCache.delete(`tablelog:${guildId}:${userId}`);
  },
  clearGuild(guildId) {
    for (const key of memoryCache.cache.keys()) {
      if (key.startsWith(`tablelog:${guildId}:`)) {
        memoryCache.delete(key);
      }
    }
  }
};

export default memoryCache;

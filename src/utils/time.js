export function getMoscowTime() {
  const now = new Date();
  return new Date(
    now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' })
  );
}

export function getMoscowDate() {
  return getMoscowTime().toLocaleDateString('ru-RU');
}

export function getMoscowTimeString() {
  return getMoscowTime().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

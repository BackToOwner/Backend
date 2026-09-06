export function newId(prefix) {
  const random = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${random}`;
}

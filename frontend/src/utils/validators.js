export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password) {
  return password && password.length >= 8;
}

export function isNotEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

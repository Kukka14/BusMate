const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export const ENDPOINTS = {
  LOGIN: `${BASE_URL}/api/auth/login`,
  REGISTER: `${BASE_URL}/api/auth/register`,
  LOGOUT: `${BASE_URL}/api/auth/logout`,
  USERS: `${BASE_URL}/api/users`,
  USER_BY_ID: (id) => `${BASE_URL}/api/users/${id}`,
};

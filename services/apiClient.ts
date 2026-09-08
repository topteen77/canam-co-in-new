import axios from 'axios';

// Backend API: use VITE_API_URL in .env or default to port 3001 (must match server/index.js PORT)
const API_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'https://canam.co.in/api'; 

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT from localStorage on every request
apiClient.interceptors.request.use((config) => {
  const token = typeof localStorage !== 'undefined' && localStorage.getItem('crmToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.warn('API Error:', error.response?.status, error.message);
    return Promise.reject(error);
  }
);

export default apiClient;
import axios from 'axios';

// Base URL from the provided cURL (host and path only)
const apiClient = axios.create({
  baseURL: 'https://data.elexon.co.uk/bmrs/api/v1',
  headers: {
    Accept: 'text/plain',
  },
  timeout: 30000,
});

// Request interceptor – place to inject auth, common params, logging, etc.
apiClient.interceptors.request.use(
  (config) => {
    // Example: you can add default query params here if needed
    // config.params = { ...(config.params || {}), someDefault: 'value' };
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor – normalize responses and centralize error handling.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Example: You can log errors or map them to a standard shape here.
    return Promise.reject(error);
  },
);

export default apiClient;


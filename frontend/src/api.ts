import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error
    ) {
      const response = (
        error as {
          response?: {
            status?: number;
            config?: {
              url?: string;
            };
          };
        }
      ).response;

      const requestUrl =
        response?.config?.url ?? '';

      const isAuthRequest =
        requestUrl.includes('/auth/login') ||
        requestUrl.includes('/auth/status') ||
        requestUrl.includes('/auth/logout');

      if (
        response?.status === 401 &&
        !isAuthRequest
      ) {
        window.dispatchEvent(
          new Event(
            'proxpilot-auth-required',
          ),
        );
      }
    }

    return Promise.reject(error);
  },
);

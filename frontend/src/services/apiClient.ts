import axios, { AxiosError } from 'axios';

export const apiClient = axios.create({ baseURL: '/api', timeout: 20_000, withCredentials: true });
let connecting: Promise<unknown> | null = null;
function requestError(error: unknown) {
  return new Error(axios.isAxiosError<{ message?: string }>(error) && error.response?.data?.message
    || 'The backend is unavailable. Start the API and Redis, then retry.');
}
apiClient.interceptors.request.use(config => {
  config.headers.set('Accept', 'application/json');
  return config;
});
apiClient.interceptors.response.use(response => response, async (error: AxiosError<{ message?: string }>) => {
  const config = error.config;
  if (error.response?.status === 401 && config && !config.headers.has('X-Session-Retry')) {
    connecting ??= axios.post('/api/session', {}, { withCredentials: true }).finally(() => { connecting = null; });
    try { await connecting; }
    catch (sessionError) { return Promise.reject(requestError(sessionError)); }
    config.headers.set('X-Session-Retry', '1');
    return apiClient.request(config);
  }
  return Promise.reject(requestError(error));
});

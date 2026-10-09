import axios, { AxiosError } from 'axios';
import { useWorkspaceSession } from '../store/workspaceSession';

export const apiClient = axios.create({ baseURL: '/api', timeout: 20_000, withCredentials: true });
let connecting: Promise<unknown> | null = null;
function requestError(error: unknown) {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    if (error.response?.data?.message) return new Error(error.response.data.message);
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new Error('The request took too long. The service may be busy. Please retry shortly.');
    }
    if (error.response) return new Error(`The data service could not complete this request (HTTP ${error.response.status}). Please retry.`);
  }
  return new Error('Cannot connect to the data service. Check that the API is running and your connection is available.');
}
apiClient.interceptors.request.use(config => {
  config.headers.set('Accept', 'application/json');
  return config;
});
apiClient.interceptors.response.use(response => response, async (error: AxiosError<{ message?: string; code?: string }>) => {
  const config = error.config;
  if (error.response?.status === 401 && (error.response.data?.code === 'LOGIN_REQUIRED' || useWorkspaceSession.getState().hosted)) {
    useWorkspaceSession.getState().setSession(true, false);
    return Promise.reject(requestError(error));
  }
  if (error.response?.status === 401 && config && !config.headers.has('X-Session-Retry')) {
    connecting ??= axios.post('/api/session', {}, { withCredentials: true }).finally(() => { connecting = null; });
    try { await connecting; }
    catch (sessionError) { return Promise.reject(requestError(sessionError)); }
    config.headers.set('X-Session-Retry', '1');
    return apiClient.request(config);
  }
  return Promise.reject(requestError(error));
});

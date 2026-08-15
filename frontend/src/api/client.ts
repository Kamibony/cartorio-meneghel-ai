import axios, { type AxiosError, type AxiosResponse } from 'axios';
import { auth } from '../utils/firebase';
import { ENV } from '../config/env';

export interface AppError {
  code: string | number;
  message: string;
  details?: any;
}

const apiClient = axios.create({
  timeout: 600000, // Large timeout to let direct Cloud Run requests handle their own timeouts
});

apiClient.interceptors.request.use(
  async (config) => {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // If we receive an HTML document instead of JSON (usually because of SPA fallback on missing route)
    if (typeof response.data === 'string' && response.data.trim().toLowerCase().startsWith('<!doctype html>')) {
      const appError: AppError = {
        code: 'API_NOT_FOUND',
        message: 'Endpoint da API não encontrado (Recebeu HTML ao invés de JSON). Verifique a configuração de rotas.',
      };
      return Promise.reject(appError);
    }
    return response.data;
  },
  (error: AxiosError) => {
    let appError: AppError = {
      code: 'NETWORK_ERROR',
      message: 'Ocorreu um erro de rede. Verifique sua conexão e tente novamente.',
    };

    if (error.code === 'ECONNABORTED') {
       appError = {
         code: 'TIMEOUT',
         message: 'O servidor demorou muito para responder. Tente novamente mais tarde.'
       };
    } else if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;

      if (status === 502 || status === 504) {
        appError = {
          code: status,
          message: 'O servidor está temporariamente indisponível (Gateway Timeout/Bad Gateway).',
        };
      } else if (data && data.error) {
         // Contract: { error: { code: ..., message: ..., details: ... } }
         appError = {
           code: data.error.code || status,
           message: data.error.message || 'Erro interno do servidor',
           details: data.error.details
         };
      } else {
        appError = {
          code: status,
          message: `Erro do servidor: ${status}`,
          details: data
        };
      }
    }

    return Promise.reject(appError);
  }
);

export const ingestRawClauses = async (rawText: string) => {
  const url = import.meta.env.VITE_INGEST_API_URL || '/api/ingest_raw_clauses';
  // Strip trailing slash if any
  const cleanUrl = url.replace(/\/$/, "");

  // Use apiClient which has all the interceptors
  const response = await apiClient.post(cleanUrl, { raw_text: rawText });
  return response;
};

export const orchestrateDocument = async (intent: string) => {
  const baseUrl = import.meta.env.VITE_ORCHESTRATE_API_URL;
  const url = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/orchestrate_document`
    : `${ENV.apiUrl}/orchestrate_document`;

  const response = await apiClient.post(url, { intent });
  return response;
};

export default apiClient;

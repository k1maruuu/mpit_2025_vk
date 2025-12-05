import axios from "axios";
import { parseCookies } from "nookies";
import { destroyCookie } from "nookies";

const isServer = typeof window === "undefined";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  timeout: 1000000,
  validateStatus: () => true,
});


api.interceptors.response.use(
  (response) => {
    if (!isServer && response.status === 401) {
      destroyCookie(null, "_token", { path: "/" });
      // опционально:
      // window.location.href = "/login";
    }
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// REQUEST INTERCEPTOR
api.interceptors.request.use(
  (config) => {
    // Нормализуем URL
    if (config.url && !config.url.startsWith("/")) {
      config.url = "/" + config.url;
    }

    if (isServer) {
      return config;
    }

    const cookies = parseCookies();
    const token = cookies._token;

    if (token) {
      config.headers = config.headers || {};
      if (!config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => {
    return Promise.resolve(error); // KEKW — не даём упасть
  }
);

// RESPONSE INTERCEPTOR
api.interceptors.response.use(
  (response) => response,
  () => {
    return { status: 0, data: null }; // Никаких AxiosError
  }
);

export default api;

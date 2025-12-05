import type { GetServerSidePropsContext } from "next";
import api from "./api";
import axios from "axios";
import { setCookie, parseCookies, destroyCookie } from "nookies";

export { parseCookies };

interface LoginResponse {
  access_token: string;
  token_type: string;
}

export type LoginResult =
  | {
      success: true;
      data: LoginResponse;
    }
  | {
      success: false;
      errorCode?: number;
      errorMessage: string;
    };

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    console.log("Sending login request for email:", email);

    const response = await api.post<LoginResponse>(
      "/auth/token",
      new URLSearchParams({ username: email, password }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    if (!response.data?.access_token) {
      console.warn("Login: response without access_token", response.data);
      return {
        success: false,
        errorMessage: "Неправильный пароль или логин",
      };
    }

    console.log("Token received:", response.data.access_token);
    setCookie(null, "_token", response.data.access_token, {
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    console.log("Token saved in cookies");

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("Login error:", error);

    // Никаких throw — только аккуратный объект
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      if (status === 401) {
        return {
          success: false,
          errorCode: 401,
          errorMessage: "Неверный email или пароль",
        };
      }

      if (status === 403) {
        const detail =
          typeof error.response?.data === "object" &&
          error.response?.data !== null &&
          "detail" in error.response.data
            ? (error.response.data as { detail?: string }).detail
            : undefined;

        return {
          success: false,
          errorCode: 403,
          errorMessage:
            detail ??
            "Ваш аккаунт временно заблокирован из-за нескольких неудачных попыток входа",
        };
      }

      if (error.response) {
        const detail =
          typeof error.response.data === "object" &&
          error.response.data !== null &&
          "detail" in error.response.data
            ? (error.response.data as { detail?: string }).detail
            : undefined;

        return {
          success: false,
          errorCode: status,
          errorMessage: detail ?? "Ошибка входа. Попробуйте позже.",
        };
      }

      if (error.request) {
        return {
          success: false,
          errorMessage: "Сервер не отвечает. Проверьте интернет-подключение.",
        };
      }

      return {
        success: false,
        errorMessage: "Неизвестная ошибка при входе.",
      };
    }

    return {
      success: false,
      errorMessage: "Неожиданная ошибка. Попробуйте позже.",
    };
  }
}

export function logout() {
  try {
    destroyCookie(null, "_token", { path: "/" });
  } catch (e) {
    console.warn("Logout error (можно игнорировать):", e);
  }
}

/**
 * Проверка авторизации.
 * - На сервере:  isAuthenticated(context)
 * - На клиенте:  isAuthenticated()
 */
export function isAuthenticated(
  context?: GetServerSidePropsContext | null
): boolean {
  const cookies = parseCookies(context ?? undefined);
  const token = cookies._token;

  console.log("Auth check, token:", token ? "[TOKEN_PRESENT]" : "[NO_TOKEN]");
  return !!token;
}

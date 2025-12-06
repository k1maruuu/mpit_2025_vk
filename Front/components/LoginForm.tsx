"use client";

import { useState, useEffect } from "react";
import { login, isAuthenticated } from "../lib/auth";
import { useRouter } from "next/router";
import Image from "next/image";

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (attempts >= 5) {
      setError("Аккаунт заблокирован из-за превышения попыток входа");
      return;
    }

    setLoading(true);

    const result = await login(email, password);

    setLoading(false);

    if (!result.success) {
      setAttempts((prev) => prev + 1);
      setError(result.errorMessage);
      return;
    }

    // успешный логин
    setAttempts(0);
    await router.push("/dashboard");
  };

  useEffect(() => {
    if (isAuthenticated()) {
      router.push("/news");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5] px-4">
      <div className="w-full max-w-5xl flex bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Левая панель с картинкой */}
        <div className="hidden md:flex w-1/2 relative">
          <Image
            src="/bg1.png"
            alt="Background"
            fill
            className="object-cover"
            priority
          />

          {/* затемнение для читаемости текста */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />

          <div className="relative z-10 text-white p-10 flex flex-col justify-between">
            <div>
              <h2 className="text-3xl font-bold mb-3 drop-shadow-md">
                VK-Tracker
              </h2>
              <p className="text-sm text-white/90 max-w-xs drop-shadow-sm">
                Платформа для отслеживания эмоционального состояния сотрудников
                и снижения выгорания в команде.
              </p>
            </div>

            <div className="space-y-4">
              <div className="backdrop-blur-sm bg-white/10 rounded-2xl p-4">
                <p className="text-sm text-white/90 drop-shadow-sm">
                  Аналитика по сотрудникам в реальном времени
                </p>
              </div>
              <div className="backdrop-blur-sm bg-white/10 rounded-2xl p-4">
                <p className="text-sm text-white/90 drop-shadow-sm">
                  LLM-рекомендации по снижению стресса
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Правая часть — форма логина */}
        <div className="w-full md:w-1/2 p-8 md:p-12 flex items-center justify-center">
          <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-[#000000]">
                Логин
              </h1>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 rounded-2xl border border-gray-200 bg-[#FFFFFF] px-4 text-sm outline-none focus:ring-2 focus:ring-[#0077FF] focus:border-transparent"
                  placeholder="example@company.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Пароль
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 rounded-2xl border border-gray-200 bg-[#FFFFFF] px-4 text-sm outline-none focus:ring-2 focus:ring-[#0077FF] focus:border-transparent"
                  placeholder="Введите пароль"
                  required
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-2xl px-3 py-2">
                {error}
              </p>
            )}

            {attempts > 0 && attempts < 5 && (
              <p className="text-xs text-gray-500">
                Осталось попыток:{" "}
                <span className="font-semibold">{5 - attempts}</span>
              </p>
            )}

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-[#0077FF] hover:text-[#005fd1] transition-colors"
              >
                Забыли пароль?
              </button>
            </div>

            <button
              type="submit"
              disabled={attempts >= 5 || loading}
              className="w-full h-11 rounded-2xl bg-[#0077FF] text-white text-sm font-medium shadow-md hover:bg-[#005fd1] disabled:bg-gray-400 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Входим..." : "Войти"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;

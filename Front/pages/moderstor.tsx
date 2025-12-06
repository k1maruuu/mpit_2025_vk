// pages/moderstor.tsx
import { useEffect, useState } from "react";
import { GetServerSideProps } from "next";
import { parseCookies as parseNookies } from "nookies";
import api from "../lib/api";
import { isAuthenticated } from "../lib/auth";
import { User, UserRole } from "../lib/types";

type RecommendationCategory =
  | "workload"
  | "rest"
  | "support"
  | "development"
  | "health";

interface Recommendation {
  category: RecommendationCategory;
  priority: string; // "high" | "medium" | "low"
  text: string;
  action_items: string[];
}

interface EmployeeGroupStats {
  total_employees: number;
  employees_with_tests: number;
  avg_burnout_score: number | null;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  critical_risk_count: number;
  avg_work_experience: number | null;
  long_vacation_gap_count: number;
  avg_mood_last_30d: number | null;
}

interface EmployeeShortInfo {
  user_id: number;
  full_name: string;
  position: string | null;
  burnout_score: number | null;
  vacation_gap_days: number | null;
  work_experience: number | null;
}

interface GroupBurnoutAnalysisResponse {
  analysis_date: string;
  filter_type: string; // "company" | "city"
  filter_value: string;
  group_stats: EmployeeGroupStats;
  summary: string;
  key_trends: string[];
  recommendations: Recommendation[];
  priority_actions: string[];
  employee_breakdown: EmployeeShortInfo[];
}

interface ModeratorPageProps {
  currentUser: User;
}

type FilterMode = "company" | "city";

type ErrorWithCode = {
  code?: string;
  response?: {
    data?: {
      detail?: string;
    };
  };
};

const isErrorWithCode = (e: unknown): e is ErrorWithCode => {
  if (typeof e !== "object" || e === null) return false;
  return "code" in e || "response" in e;
};

type UserWithOrgFields = User & {
  company?: string | null;
  city?: string | null;
};

const ModeratorPage: React.FC<ModeratorPageProps> = ({ currentUser }) => {
  const [filterMode, setFilterMode] = useState<FilterMode>("company");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] =
    useState<GroupBurnoutAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orgUser = currentUser as UserWithOrgFields;
  const company = orgUser.company ?? null;
  const city = orgUser.city ?? null;

  const formatNumber = (value: number | null, digits = 1) => {
    if (value == null) return "нет данных";
    return value.toFixed(digits).replace(".", ",");
  };

  const fetchAnalysis = async (forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const body: {
        company?: string;
        city?: string;
        force_refresh?: boolean;
      } = {};
      if (filterMode === "company" && company) body.company = company;
      if (filterMode === "city" && city) body.city = city;

      if (!body.company && !body.city) {
        setError(
          "Для анализа нужно, чтобы у вас в профиле была указана компания или город."
        );
        return;
      }

      body.force_refresh = forceRefresh;

      const res = await api.post<GroupBurnoutAnalysisResponse>(
        "/ai/analysis/group-analysis",
        body,
        { timeout: 1000000 }
      );

      setAnalysis(res.data);
    } catch (e: unknown) {
      console.error("Ошибка загрузки группового анализа", e);

      if (isErrorWithCode(e) && e.code === "ECONNABORTED") {
        setError(
          "Ответ от модели занимает слишком много времени. Попробуйте ещё раз позже."
        );
      } else {
        const msg =
          (isErrorWithCode(e) && e.response?.data?.detail) ||
          "Не удалось загрузить групповой анализ. Проверьте права доступа и попробуйте позже.";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode]);

  const isManagerOrAdmin =
    currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.MANAGER;

  const roleLabel =
    currentUser.role === UserRole.ADMIN
      ? "Администратор"
      : currentUser.role === UserRole.MANAGER
      ? "Менеджер"
      : "Сотрудник";

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#F5F7FB] flex justify-center items-start pt-16 px-4">
      <div className="w-full max-w-6xl bg-white rounded-[32px] shadow-sm border border-[#E5E7F0] p-6 md:p-8 mt-4 flex flex-col gap-6">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#005EFF] mb-1">
              панель модератора
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-[#111827]">
              Аналитика выгорания в команде
            </h1>
            <p className="text-sm text-gray-600 mt-2 max-w-xl">
              Здесь вы видите агрегированные данные по выгоранию сотрудников
              вашей компании или города. Данные помогают не «искать виноватых», а
              планировать системные меры поддержки.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Вы вошли как{" "}
              <span className="font-semibold">{currentUser.full_name}</span>{" "}
              ({roleLabel}) —{" "}
              {currentUser.position_employee || "должность не указана"}.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="inline-flex items-center rounded-full bg-[#E8F9EE] px-3 py-1 text-xs font-semibold text-[#00A334]">
              {roleLabel}
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-[#F3F4F6] px-2 py-1 text-xs">
              <button
                type="button"
                onClick={() => setFilterMode("company")}
                className={[
                  "px-3 py-1 rounded-full transition-colors",
                  filterMode === "company"
                    ? "bg-[#005EFF] text-white"
                    : "text-gray-600 hover:text-gray-900",
                ].join(" ")}
                disabled={!company}
              >
                По компании
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("city")}
                className={[
                  "px-3 py-1 rounded-full transition-colors",
                  filterMode === "city"
                    ? "bg-[#005EFF] text-white"
                    : "text-gray-600 hover:text-gray-900",
                ].join(" ")}
                disabled={!city}
              >
                По городу
              </button>
            </div>

            <button
              type="button"
              onClick={() => fetchAnalysis(true)}
              disabled={loading}
              className="mt-1 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border border-[#00B33C] text-[#00B33C] hover:bg-[#00B33C] hover:text-white transition-colors disabled:opacity-50"
            >
              <span>Обновить данные</span>
            </button>
          </div>
        </div>

        {/* Нет прав */}
        {!isManagerOrAdmin && (
          <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
            Эта страница доступна только менеджерам и администраторам. Сейчас у
            вас роль <strong>{currentUser.role}</strong>. Обратитесь к
            администратору системы, если вам нужен доступ.
          </div>
        )}

        {/* Контент только для MANAGER / ADMIN */}
        {isManagerOrAdmin && (
          <>
            {error && (
              <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {loading && (
              <div className="rounded-2xl bg-[#F8FAFC] border border-gray-100 p-4 text-sm text-gray-600">
                Генерируем групповой анализ… Это может занять несколько секунд.
              </div>
            )}

            {!loading && analysis && (
              <>
                {/* KPI */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-2xl bg-[#F8FAFC] border border-gray-100 p-4">
                    <p className="text-xs text-gray-500 mb-1">
                      Всего сотрудников
                    </p>
                    <p className="text-2xl font-semibold">
                      {analysis.group_stats.total_employees}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      С тестом по выгоранию:{" "}
                      <span className="font-semibold">
                        {analysis.group_stats.employees_with_tests}
                      </span>
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#F8FAFC] border border-gray-100 p-4">
                    <p className="text-xs text-gray-500 mb-1">
                      Средний балл выгорания
                    </p>
                    <p className="text-2xl font-semibold">
                      {analysis.group_stats.avg_burnout_score == null
                        ? "—"
                        : formatNumber(analysis.group_stats.avg_burnout_score)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Настроение за 30 дней:{" "}
                      <span className="font-semibold">
                        {formatNumber(analysis.group_stats.avg_mood_last_30d)}
                      </span>
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#F8FAFC] border border-gray-100 p-4">
                    <p className="text-xs text-gray-500 mb-1">
                      Средний стаж (лет)
                    </p>
                    <p className="text-2xl font-semibold">
                      {analysis.group_stats.avg_work_experience == null
                        ? "—"
                        : formatNumber(
                            analysis.group_stats.avg_work_experience,
                            1
                          )}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      &gt; 6 мес без отпуска:{" "}
                      <span className="font-semibold">
                        {analysis.group_stats.long_vacation_gap_count}
                      </span>
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#F8FAFC] border border-gray-100 p-4">
                    <p className="text-xs text-gray-500 mb-1">
                      Анализ обновлён
                    </p>
                    <p className="text-sm font-semibold">
                      {new Date(
                        analysis.analysis_date
                      ).toLocaleString("ru-RU")}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Фильтр: {analysis.filter_type}{" "}
                      <span className="font-semibold">
                        {analysis.filter_value}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Риски */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="rounded-2xl bg-green-50 border border-green-100 p-4">
                    <p className="text-xs text-green-700 mb-1">Низкий риск</p>
                    <p className="text-2xl font-semibold text-green-800">
                      {analysis.group_stats.low_risk_count}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-yellow-50 border border-yellow-100 p-4">
                    <p className="text-xs text-yellow-700 mb-1">
                      Умеренный риск
                    </p>
                    <p className="text-2xl font-semibold text-yellow-800">
                      {analysis.group_stats.medium_risk_count}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-orange-50 border border-orange-100 p-4">
                    <p className="text-xs text-orange-700 mb-1">Высокий риск</p>
                    <p className="text-2xl font-semibold text-orange-800">
                      {analysis.group_stats.high_risk_count}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
                    <p className="text-xs text-red-700 mb-1">
                      Критический риск
                    </p>
                    <p className="text-2xl font-semibold text-red-800">
                      {analysis.group_stats.critical_risk_count}
                    </p>
                  </div>
                </div>

                {/* Summary + приоритеты */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1.1fr] gap-6">
                  <div className="rounded-2xl bg-[#F9FAFB] border border-gray-100 p-5">
                    <h2 className="text-lg font-semibold mb-2">
                      Итог по группе
                    </h2>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {analysis.summary}
                    </p>

                    {analysis.key_trends.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs uppercase text-gray-400 mb-2">
                          ключевые тренды
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {analysis.key_trends.map((t, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-3 py-1 rounded-full bg-[#EFF4FF] text-[#1D3BBF]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl bg-[#F9FAFB] border border-gray-100 p-5 flex flex-col">
                    <h2 className="text-lg font-semibold mb-2">
                      Приоритетные шаги
                    </h2>
                    {analysis.priority_actions.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Приоритетные действия не сформированы.
                      </p>
                    ) : (
                      <ol className="list-decimal list-inside space-y-2 text-sm text-gray-800">
                        {analysis.priority_actions.map((act, idx) => (
                          <li key={idx}>{act}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>

                {/* Рекомендации для компании */}
                <div className="rounded-2xl bg-white border border-gray-100 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-semibold">
                        Рекомендации для компании
                      </h2>
                      <p className="text-xs text-gray-500 mt-1 max-w-xl">
                        Подборка шагов, которые можно использовать как основу
                        для программы профилактики выгорания.
                      </p>
                    </div>
                    <span className="hidden md:inline-flex text-[11px] text-gray-400">
                      Сформировано на основе последних тестов
                    </span>
                  </div>

                  {analysis.recommendations.length === 0 && (
                    <p className="text-sm text-gray-500">
                      Пока нет рекомендаций. Попробуйте обновить анализ позже.
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-3">
                    {analysis.recommendations.map((rec, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl bg-[#F9FAFB] border border-gray-100 p-4 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase text-gray-500">
                            {rec.category}
                          </span>
                          <span
                            className={[
                              "text-[10px] px-2 py-0.5 rounded-full border",
                              rec.priority === "high"
                                ? "border-red-300 text-red-700 bg-red-50"
                                : rec.priority === "medium"
                                ? "border-yellow-300 text-yellow-700 bg-yellow-50"
                                : "border-gray-300 text-gray-700 bg-gray-50",
                            ].join(" ")}
                          >
                            приоритет: {rec.priority}
                          </span>
                        </div>
                        <p className="text-gray-800 leading-snug">
                          {rec.text}
                        </p>
                        {rec.action_items?.length > 0 && (
                          <ul className="list-disc list-inside text-xs text-gray-600 space-y-1 mt-1">
                            {rec.action_items.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ModeratorPage;

export const getServerSideProps: GetServerSideProps<
  ModeratorPageProps
> = async (context) => {
  if (!isAuthenticated(context)) {
    return {
      redirect: { destination: "/", permanent: false },
    };
  }

  const { _token } = parseNookies(context);

  try {
    const response = await api.get<User>("/users/me", {
      headers: { Authorization: `Bearer ${_token}` },
    });

    const user = response.data;

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      return {
        redirect: { destination: "/dashboard", permanent: false },
      };
    }

    return {
      props: {
        currentUser: user,
      },
    };
  } catch (error) {
    console.error("Error fetching user for moderstor:", error);
    return {
      redirect: { destination: "/", permanent: false },
    };
  }
};

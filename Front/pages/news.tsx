import { useEffect, useState } from "react";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { parseCookies } from "nookies";
import axios from "axios";
import api from "../lib/api";
import { isAuthenticated } from "../lib/auth";
import { User } from "../lib/types";

interface DashboardProps {
  currentUser: User;
}

interface MoodEntry {
  id: number;
  date: string;
  mood: number;
  note?: string | null;
}

interface BurnoutTestResult {
  id: number;
  created_at: string;
  physical_score: number;
  emotional_score: number;
  cognitive_score: number;
  total_score: number;
  comment_work?: string | null;
  comment_factors?: string | null;
}

const getBurnoutLevel = (total: number): string => {
  if (total <= 16) return "Низкий уровень выгорания";
  if (total <= 32) return "Средний уровень выгорания";
  if (total <= 48) return "Высокий уровень выгорания";
  return "Очень высокий уровень выгорания";
};

const getDomainLevel = (
  domain: "physical" | "emotional" | "cognitive",
  score: number
): string => {
  if (domain === "physical") {
    if (score <= 4) return "Низкий";
    if (score <= 8) return "Средний";
    if (score <= 12) return "Высокий";
    return "Очень высокий";
  }
  if (score <= 6) return "Низкий";
  if (score <= 12) return "Средний";
  if (score <= 18) return "Высокий";
  return "Очень высокий";
};

const Dashboard: React.FC<DashboardProps> = ({ currentUser }) => {
  const router = useRouter();

  const [lastTest, setLastTest] = useState<BurnoutTestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const burnoutScoreFromUser = currentUser.burn_out_score ?? null;
  const effectiveBurnoutScore =
    burnoutScoreFromUser ?? (lastTest ? lastTest.total_score : null);

  let burnoutLabel = "Нет данных";
  let burnoutColor = "text-gray-700";
  if (effectiveBurnoutScore !== null) {
    if (effectiveBurnoutScore <= 16) {
      burnoutLabel = "Низкий уровень выгорания";
      burnoutColor = "text-green-600";
    } else if (effectiveBurnoutScore <= 32) {
      burnoutLabel = "Средний уровень выгорания";
      burnoutColor = "text-yellow-600";
    } else if (effectiveBurnoutScore <= 48) {
      burnoutLabel = "Высокий уровень выгорания";
      burnoutColor = "text-orange-600";
    } else {
      burnoutLabel = "Очень высокий уровень выгорания";
      burnoutColor = "text-red-600";
    }
  }

  const fetchLastTest = async () => {
    setTestLoading(true);
    setTestError(null);
    const cookies = parseCookies();
    const token = cookies._token;

    try {
      const res = await api.get<BurnoutTestResult>("/burnout-tests/last", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setLastTest(res.data);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          setLastTest(null);
        } else {
          console.error("Не удалось загрузить последний тест", error);
          setTestError("Не удалось загрузить данные о тесте.");
        }
      } else {
        console.error("Неизвестная ошибка при загрузке теста", error);
        setTestError("Не удалось загрузить данные о тесте.");
      }
    } finally {
      setTestLoading(false);
    }
  };

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState(today.getMonth());

  const [moodByDate, setMoodByDate] = useState<Record<string, number>>({});
  const [moodLoading, setMoodLoading] = useState(false);
  const [moodError, setMoodError] = useState<string | null>(null);

  const monthNames = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayWeekIndex = (() => {
    const jsDay = new Date(year, monthIndex, 1).getDay();
    return (jsDay + 6) % 7;
  })();

  const fetchMood = async () => {
    setMoodLoading(true);
    setMoodError(null);

    try {
      const cookies = parseCookies();
      const token = cookies._token;

      const res = await api.get<MoodEntry[]>("/diary", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        params: {
          year,
          month: monthIndex + 1,
        },
      });

      const map: Record<string, number> = {};
      res.data.forEach((entry) => {
        const key = entry.date.slice(0, 10);
        map[key] = entry.mood;
      });
      setMoodByDate(map);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          setMoodByDate({});
          setMoodError(null);
        } else {
          console.error("Не удалось загрузить дневник", error);
          setMoodError("Не удалось загрузить дневник самочувствия");
        }
      } else {
        console.error("Неизвестная ошибка при загрузке дневника", error);
        setMoodError("Не удалось загрузить дневник самочувствия");
      }
    } finally {
      setMoodLoading(false);
    }
  };

  useEffect(() => {
    fetchMood();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthIndex]);

  useEffect(() => {
    fetchLastTest();
  }, []);

  const getMoodColorClass = (mood?: number) => {
    if (!mood) return "bg-gray-100 text-gray-400";
    if (mood <= 2) return "bg-red-100 text-red-700";
    if (mood === 3) return "bg-amber-100 text-amber-700";
    return "bg-emerald-100 text-emerald-700";
  };

  const totalDays = daysInMonth || 1;
  let redDays = 0;
  let yellowDays = 0;
  let greenDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(monthIndex + 1).padStart(
      2,
      "0"
    )}-${String(day).padStart(2, "0")}`;
    const mood = moodByDate[key];
    if (!mood) continue;

    if (mood <= 2) redDays++;
    else if (mood === 3) yellowDays++;
    else greenDays++;
  }

  const redPct = Math.round((redDays / totalDays) * 100);
  const yellowPct = Math.round((yellowDays / totalDays) * 100);
  const greenPct = Math.round((greenDays / totalDays) * 100);
  const nonePct = Math.max(0, 100 - redPct - yellowPct - greenPct);

  const goPrevMonth = () => {
    let newMonth = monthIndex - 1;
    let newYear = year;
    if (newMonth < 0) {
      newMonth = 11;
      newYear = year - 1;
    }
    setMonthIndex(newMonth);
    setYear(newYear);
  };

  const goNextMonth = () => {
    let newMonth = monthIndex + 1;
    let newYear = year;
    if (newMonth > 11) {
      newMonth = 0;
      newYear = year + 1;
    }
    setMonthIndex(newMonth);
    setYear(newYear);
  };

  // ---------- РЕНДЕР ----------
  return (
    <div className="relative min-h-screen bg-[#F4F6FB]">
      {/* фоновые круги как на лендинге */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-[#005EFF]/6 blur-3xl" />
        <div className="absolute bottom-[-80px] left-[-40px] h-72 w-72 rounded-full bg-[#00B33C]/6 blur-3xl" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-4 lg:px-6 pt-10 pb-16 space-y-8">
        {/* заголовок / приветствие */}
        <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-[#E1E5F0] px-3 py-1 text-[11px] text-[#4B5563]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Панель благополучия сотрудника
            </div>
            <h1 className="mt-3 text-2xl md:text-[26px] font-semibold text-[#111827]">
              Привет, {currentUser.full_name?.split(" ")[0] || "коллега"} 👋
            </h1>
            <p className="mt-1.5 text-sm text-[#6B7280] max-w-xl">
              Здесь собраны ваши показатели выгорания, дневник самочувствия и
              рекомендации. Следите за состоянием и управляйте нагрузкой.
            </p>
          </div>

          <div className="flex gap-3 text-xs text-[#4B5563]">
            <div className="flex flex-col items-end rounded-2xl bg-white/80 border border-[#E1E5F0] px-3 py-2 shadow-sm">
              <span className="text-[11px]">Статус выгорания</span>
              <span className={`text-[13px] font-semibold ${burnoutColor}`}>
                {burnoutLabel}
              </span>
            </div>
          </div>
        </section>

        {/* Верхняя строка: 3 карточки */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Уровень выгорания */}
          <article className="bg-white rounded-[24px] border border-[#E4E7F2] shadow-[0_18px_40px_rgba(15,23,42,0.08)] p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-[#111827]">
                Уровень выгорания
              </h2>
              {effectiveBurnoutScore !== null && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium bg-[#F3F4FF] text-[#111827]`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      burnoutColor.includes("green")
                        ? "bg-emerald-500"
                        : burnoutColor.includes("yellow")
                        ? "bg-amber-400"
                        : burnoutColor.includes("orange")
                        ? "bg-orange-500"
                        : "bg-red-500"
                    }`}
                  />
                  {effectiveBurnoutScore} баллов
                </span>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-between">
              <div className="h-40 rounded-2xl relative overflow-hidden bg-gradient-to-tr from-[#E0F2FE] via-[#E5ECFF] to-[#FFE4EC]">
                <img
                  src="/bg1.png"
                  alt="Background"
                  className="absolute inset-0 w-full h-full object-cover opacity-70"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0" />
              </div>

              <p className={`mt-4 text-sm ${burnoutColor}`}>
                {burnoutLabel === "Нет данных"
                  ? "Пока нет данных. Пройдите опрос, чтобы увидеть свой уровень выгорания."
                  : burnoutLabel}
              </p>
            </div>
          </article>

          {/* Последний тест */}
          <article className="bg-white rounded-[24px] border border-[#E4E7F2] shadow-[0_18px_40px_rgba(15,23,42,0.08)] p-6 flex flex-col">
            <h2 className="text-[15px] font-semibold mb-4 text-[#111827]">
              Последний тест
            </h2>

            {testLoading ? (
              <div className="flex-1 flex items-center text-sm text-gray-500">
                Загрузка данных о тесте…
              </div>
            ) : testError ? (
              <div className="flex-1 flex items-center text-sm text-red-500">
                {testError}
              </div>
            ) : !lastTest ? (
              <div className="flex-1 flex flex-col justify-between text-sm text-gray-700 gap-2">
                <p>Вы ещё не проходили тест на выгорание.</p>
                <p className="text-xs text-gray-400">
                  Пройдите опрос, чтобы получить персональные рекомендации.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/test")}
                  className="mt-3 inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[#005EFF] text-white text-sm font-semibold hover:bg-[#0050D6] transition shadow-[0_14px_36px_rgba(0,95,255,0.35)]"
                >
                  Пройти опрос
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between text-sm text-gray-700 gap-3">
                <p>
                  Дата прохождения:{" "}
                  <span className="font-medium">
                    {new Date(lastTest.created_at).toLocaleDateString("ru-RU")}
                  </span>
                </p>
                <p>
                  Общий результат:{" "}
                  <span className="font-medium">
                    {lastTest.total_score} баллов
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {getBurnoutLevel(lastTest.total_score)}
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/test")}
                  className="mt-2 inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[#F3F4FF] text-[#1F2937] text-sm font-semibold hover:bg-[#E4E7FF] transition"
                >
                  Пройти тест ещё раз
                </button>
              </div>
            )}
          </article>

          {/* Дневник самочувствия */}
          <article className="bg-white rounded-[24px] border border-[#E4E7F2] shadow-[0_18px_40px_rgba(15,23,42,0.08)] p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-[#111827]">
                Дневник самочувствия
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#F3F4FF]"
                >
                  ‹
                </button>
                <span className="font-medium">
                  {monthNames[monthIndex]} {year}
                </span>
                <button
                  type="button"
                  onClick={goNextMonth}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#F3F4FF]"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="flex-1">
              {moodLoading ? (
                <div className="text-sm text-gray-400">Загрузка данных...</div>
              ) : moodError ? (
                <div className="text-sm text-red-500">{moodError}</div>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1 text-[11px] text-gray-400 mb-2">
                    {["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map((d) => (
                      <div key={d} className="text-center">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-[11px]">
                    {Array.from({ length: 42 }).map((_, index) => {
                      const dayNumber = index - firstDayWeekIndex + 1;

                      if (dayNumber < 1 || dayNumber > daysInMonth) {
                        return (
                          <div
                            key={index}
                            className="h-7 rounded-md bg-transparent"
                          />
                        );
                      }

                      const key = `${year}-${String(monthIndex + 1).padStart(
                        2,
                        "0"
                      )}-${String(dayNumber).padStart(2, "0")}`;

                      const mood = moodByDate[key];
                      const colorClass = getMoodColorClass(mood);

                      return (
                        <div
                          key={index}
                          className={`h-7 rounded-md flex items-center justify-center ${colorClass}`}
                        >
                          {dayNumber}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                      Зелёных дней: {greenPct}%
                    </span>
                    <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold">
                      Жёлтых дней: {yellowPct}%
                    </span>
                    <span className="px-3 py-1 rounded-full bg-red-100 text-red-800 font-semibold">
                      Красных дней: {redPct}%
                    </span>
                    <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800 font-semibold">
                      Без записи: {nonePct}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </article>
        </section>

        {/* Нижняя строка */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Показатели теста */}
          <article className="bg-white rounded-[24px] border border-[#E4E7F2] shadow-[0_18px_40px_rgba(15,23,42,0.08)] p-6">
            <h2 className="text-[15px] font-semibold mb-4 text-[#111827]">
              Показатели теста
            </h2>

            {testLoading ? (
              <p className="text-sm text-gray-500">Загрузка показателей…</p>
            ) : !lastTest ? (
              <div className="text-sm text-gray-700 space-y-3">
                <p>
                  Пока нет результатов теста. Пройдите опрос, чтобы увидеть
                  свои физические, эмоциональные и когнитивные показатели.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/test")}
                  className="mt-1 inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[#005EFF] text-white text-sm font-semibold hover:bg-[#0050D6] transition shadow-[0_14px_36px_rgba(0,95,255,0.35)]"
                >
                  Пройти опрос
                </button>
              </div>
            ) : (
              <ul className="space-y-4 text-sm text-gray-700">
                <li>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium">Физическое состояние</span>
                    <span className="text-xs text-gray-500">
                      {lastTest.physical_score} баллов (
                      {getDomainLevel(
                        "physical",
                        lastTest.physical_score
                      )}
                      )
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (lastTest.physical_score / 16) * 100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </li>
                <li>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium">Эмоциональное состояние</span>
                    <span className="text-xs text-gray-500">
                      {lastTest.emotional_score} баллов (
                      {getDomainLevel(
                        "emotional",
                        lastTest.emotional_score
                      )}
                      )
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (lastTest.emotional_score / 24) * 100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </li>
                <li>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium">Когнитивное состояние</span>
                    <span className="text-xs text-gray-500">
                      {lastTest.cognitive_score} баллов (
                      {getDomainLevel(
                        "cognitive",
                        lastTest.cognitive_score
                      )}
                      )
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-400 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (lastTest.cognitive_score / 24) * 100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </li>
              </ul>
            )}
          </article>

          {/* Рекомендации */}
          <article className="bg-white rounded-[24px] border border-[#E4E7F2] shadow-[0_18px_40px_rgba(15,23,42,0.08)] p-6 md:col-span-2 flex flex-col">
            <h2 className="text-[15px] font-semibold mb-4 text-[#111827]">
              Рекомендации
            </h2>
            {!lastTest ? (
              <p className="text-sm text-gray-700">
                Пройдите опрос, чтобы мы могли подготовить персональные
                рекомендации по управлению стрессом и восстановлению ресурса.
              </p>
            ) : (
              <div className="text-sm text-gray-700 space-y-3">
                <p>
                  Ваш общий результат —{" "}
                  <span className="font-semibold">
                    {lastTest.total_score} баллов
                  </span>{" "}
                  ({getBurnoutLevel(lastTest.total_score)}).
                </p>
                <p>
                  Обратите внимание на те области, где уровень{" "}
                  <span className="font-semibold">высокий</span> или{" "}
                  <span className="font-semibold">очень высокий</span>. В
                  ближайшее время попробуйте:
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>планировать короткие перерывы в течение дня;</li>
                  <li>
                    ограничивать переработки и работать в комфортном для вас
                    темпе;
                  </li>
                  <li>
                    обсудить нагрузку и возможности поддержки с руководителем;
                  </li>
                  <li>
                    выделять время на сон, отдых и занятия, которые приносят
                    удовольствие.
                  </li>
                </ul>
              </div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;

export const getServerSideProps: GetServerSideProps<DashboardProps> = async (
  context
) => {
  if (!isAuthenticated(context)) {
    return {
      redirect: { destination: "/", permanent: false },
    };
  }

  const { _token } = parseCookies(context);

  try {
    const response = await api.get<User>("/users/me", {
      headers: { Authorization: `Bearer ${_token}` },
    });

    return {
      props: {
        currentUser: response.data,
      },
    };
  } catch (error) {
    console.error("Error fetching user for dashboard:", error);
    return {
      redirect: { destination: "/", permanent: false },
    };
  }
};

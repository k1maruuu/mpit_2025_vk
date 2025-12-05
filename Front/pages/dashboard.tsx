// pages/dashboard.tsx
import { useEffect, useState } from "react";
import { NextPage, GetServerSideProps } from "next";
import axios from "axios";
import api from "../lib/api";
import { User } from "../lib/types";
import { parseCookies as parseNookies } from "nookies";
import { isAuthenticated } from "../lib/auth";

type Mood = 1 | 2 | 3 | 4 | 5;

interface MoodEntry {
  id: number;
  date: string; // YYYY-MM-DD
  mood: Mood;
  comment?: string | null;
}

interface DiaryStats {
  total_days: number;
  first_entry_date: string | null;
  current_streak: number;
}

interface DiaryPageProps {
  currentUser: User;
}

const EMOJI: Record<Mood, string> = {
  1: "😣",
  2: "🙁",
  3: "😐",
  4: "😊",
  5: "😄",
};

const DashboardDiary: NextPage<DiaryPageProps> = ({ currentUser }) => {
  // ----------------- Состояние дневника (эмодзи + комментарий) -----------------
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const getAuthConfig = () => {
    const { _token } = parseNookies();
    return _token
      ? { headers: { Authorization: `Bearer ${_token}` } }
      : undefined;
  };

  const handleSave = async () => {
    if (!selectedMood) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post(
        "/diary/entries",
        {
          mood: selectedMood,
          comment: comment.trim() || null,
        },
        getAuthConfig()
      );
      setComment("");
      setSuccess("Запись сохранена!");

      // после успешного сохранения обновляем календарь и статистику
      await Promise.all([fetchMood(), fetchStats()]);
    } catch (e: unknown) {
      console.error(e);
      let msg = "Не удалось сохранить запись";

      if (axios.isAxiosError(e)) {
        const detail = e.response?.data?.detail;
        if (detail === "Вы уже отправили дневник сегодня") {
          msg = "Вы уже отправили дневник сегодня";
        }
      }

      setError(msg);
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 2500);
    }
  };

  // ----------------- Календарь -----------------
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState(today.getMonth()); // 0–11

  const [moodByDate, setMoodByDate] = useState<Record<string, Mood>>({});
  const [moodLoading, setMoodLoading] = useState(false);
  const [moodError, setMoodError] = useState<string | null>(null);

  const [stats, setStats] = useState<DiaryStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

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
    // JS: 0 вс, 1 пн...
    const jsDay = new Date(year, monthIndex, 1).getDay();
    // нам нужно: 0 пн, 6 вс
    return (jsDay + 6) % 7;
  })();

  const fetchMood = async () => {
    setMoodLoading(true);
    setMoodError(null);

    try {
      const cookies = parseNookies();
      const token = cookies._token;

      const res = await api.get<MoodEntry[]>("/diary", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        params: {
          year,
          month: monthIndex + 1,
        },
      });

      const map: Record<string, Mood> = {};
      res.data.forEach((entry) => {
        const key = entry.date.slice(0, 10);
        map[key] = entry.mood;
      });
      setMoodByDate(map);
    } catch (err) {
      console.error("Не удалось загрузить дневник", err);
      setMoodError("Не удалось загрузить дневник самочувствия");
    } finally {
      setMoodLoading(false);
    }
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const cookies = parseNookies();
      const token = cookies._token;

      const res = await api.get<DiaryStats>("/diary/stats", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setStats(res.data);
    } catch (err) {
      console.error("Не удалось загрузить статистику дневника", err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchMood();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthIndex]);

  useEffect(() => {
    fetchStats();
  }, []);

  const getMoodColorClass = (mood?: number) => {
    if (!mood) return "bg-gray-100 text-gray-400";
    if (mood <= 2) return "bg-red-200 text-red-700";
    if (mood === 3) return "bg-yellow-200 text-yellow-700";
    return "bg-green-200 text-green-700";
  };

  // проценты по цветам для легенды
  const totalDays = daysInMonth || 1;
  let redDays = 0;
  let yellowDays = 0;
  let greenDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
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
    if (monthIndex === 0) {
      setYear((y) => y - 1);
      setMonthIndex(11);
    } else {
      setMonthIndex((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (monthIndex === 11) {
      setYear((y) => y + 1);
      setMonthIndex(0);
    } else {
      setMonthIndex((m) => m + 1);
    }
  };

  // ----------------- Рендер -----------------
  return (
    <div className="min-h-[calc(100vh-96px)] bg-[#F5F7F9] flex justify-center items-start pt-16 px-4">
      <div className="w-full max-w-6xl space-y-6">

        {/* Верхняя строка: календарь + дневник + достижения */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr_1fr] gap-6">
          {/* Календарь */}
          <div className="bg-white rounded-[24px] shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Календарь</h2>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                  ‹
                </button>
                <span className="font-medium">
                  {monthNames[monthIndex]} {year}
                </span>
                <button
                  type="button"
                  onClick={goNextMonth}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                  ›
                </button>
              </div>
            </div>

            {moodLoading ? (
              <p className="text-sm text-gray-500">Загружаем календарь…</p>
            ) : moodError ? (
              <p className="text-sm text-red-500">{moodError}</p>
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
                      return <div key={index} className="h-7 rounded-md" />;
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

                <div className="mt-4 flex gap-2 text-[11px]">
                  <span className="px-3 py-1 rounded-md bg-green-200 text-green-800 font-semibold">
                    {greenPct}%
                  </span>
                  <span className="px-3 py-1 rounded-md bg-yellow-200 text-yellow-800 font-semibold">
                    {yellowPct}%
                  </span>
                  <span className="px-3 py-1 rounded-md bg-red-200 text-red-800 font-semibold">
                    {redPct}%
                  </span>
                  <span className="px-3 py-1 rounded-md bg-gray-200 text-gray-800 font-semibold">
                    {nonePct}%
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Дневник самочувствия (центр) */}
          <div className="bg-white rounded-[24px] shadow-sm p-6 flex flex-col">
            <h2 className="text-lg font-semibold mb-4 text-center">
              Дневник самочувствия
            </h2>

            <h1 className="text-2xl font-bold text-center mb-3">
              Как прошёл ваш день?
            </h1>
            <p className="text-sm text-gray-500 text-center mb-6">
              Выберите эмоцию, которая лучше всего отражает ваше текущее
              состояние.
            </p>

            <div className="flex justify-center gap-5 mb-6">
              {(Object.keys(EMOJI) as unknown as Mood[]).map((mood) => {
                const selected = selectedMood === mood;
                return (
                  <button
                    key={mood}
                    type="button"
                    onClick={() => setSelectedMood(mood)}
                    className={[
                      "w-12 h-12 rounded-full flex items-center justify-center text-2xl transition",
                      "bg-gray-50 hover:bg-gray-100",
                      "border",
                      selected
                        ? "border-[#00B33C] ring-2 ring-[#00B33C]/40"
                        : "border-gray-200",
                    ].join(" ")}
                  >
                    {EMOJI[mood]}
                  </button>
                );
              })}
            </div>

            <div className="mb-6">
              <textarea
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#00B33C]/40"
                rows={4}
                placeholder="Что повлияло на ваше самочувствие?"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 mb-2 text-center">{error}</p>
            )}
            {success && (
              <p className="text-sm text-green-600 mb-2 text-center">
                {success}
              </p>
            )}

            <button
              type="button"
              disabled={!selectedMood || saving}
              onClick={handleSave}
              className="mt-auto w-full rounded-full bg-[#00B33C] hover:bg-[#00A334] disabled:bg-gray-300 text-white py-3 text-sm font-semibold transition"
            >
              {saving ? "Сохраняем..." : "Добавить запись"}
            </button>
          </div>

          {/* Достижения (справа) */}
          <div className="bg-white rounded-[24px] shadow-sm p-6 flex flex-col">
            <h2 className="text-lg font-semibold mb-4">Достижения</h2>

            {statsLoading && (
              <p className="text-sm text-gray-500">Загружаем достижения…</p>
            )}

            {!statsLoading && stats && (
              <div className="space-y-4 text-sm text-gray-800">
                <div className="bg-[#F7F8FA] rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                    Личные рекорды
                  </p>
                  {stats.first_entry_date ? (
                    <p>
                      вы впервые заполнили дневник{" "}
                      <span className="font-semibold">
                        {new Date(stats.first_entry_date).toLocaleDateString(
                          "ru-RU"
                        )}
                      </span>
                    </p>
                  ) : (
                    <p>пока нет записей</p>
                  )}
                </div>

                <div className="bg-[#F7F8FA] rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                    Награды
                  </p>
                  <p>
                    вы заполнили всего:{" "}
                    <span className="font-semibold">
                      {stats.total_days} дней
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Нижняя строка: стрик */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr_1fr] gap-6">
          <div className="bg-white rounded-[24px] shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-2">Стрик</h2>
            {stats ? (
              <p className="text-sm text-gray-800">
                Вы заполняете дневник подряд:{" "}
                <span className="font-semibold">
                  {stats.current_streak}{" "}
                  {stats.current_streak === 1 ? "день" : "дней"}
                </span>
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Заполните дневник, чтобы начать стрик.
              </p>
            )}
          </div>

          <div className="bg-transparent" />
          <div className="bg-transparent" />
        </div>
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<DiaryPageProps> = async (
  context
) => {
  if (!isAuthenticated(context)) {
    return {
      redirect: { destination: "/", permanent: false },
    };
  }

  const { _token } = parseNookies(context);

  try {
    const res = await api.get<User>("/users/me", {
      headers: { Authorization: `Bearer ${_token}` },
    });
    return { props: { currentUser: res.data } };
  } catch (e) {
    console.error("Error fetching user for diary:", e);
    return {
      redirect: { destination: "/", permanent: false },
    };
  }
};

export default DashboardDiary;

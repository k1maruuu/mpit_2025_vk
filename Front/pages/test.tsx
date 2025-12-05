// pages/test.tsx
import { NextPage, GetServerSideProps } from "next";
import { useState } from "react";
import { useRouter } from "next/router";
import api from "../lib/api";
import { parseCookies as parseNookies } from "nookies";
import { isAuthenticated } from "../lib/auth";
import { User } from "../lib/types";

interface TestPageProps {
  currentUser: User;
}

type Domain = "physical" | "emotional" | "cognitive";

interface Question {
  id: number;
  text: string;
  domain: Domain;
}

const QUESTIONS: Question[] = [
  // Физическое состояние
  {
    id: 1,
    text:
      "Я чувствую себя уставшим, когда встаю утром и должен идти на работу",
    domain: "physical",
  },
  {
    id: 2,
    text:
      "Я испытываю физические симптомы, такие как головные боли или мышечное напряжение",
    domain: "physical",
  },
  {
    id: 3,
    text: "Мне не хватает энергии для выполнения повседневных задач",
    domain: "physical",
  },
  {
    id: 4,
    text:
      "Я замечаю, что мой сон стал беспокойным и не приносит отдыха",
    domain: "physical",
  },
  // Эмоциональное состояние
  {
    id: 5,
    text: "Я чувствую себя эмоционально вымотанным",
    domain: "emotional",
  },
  {
    id: 6,
    text:
      "Я стал более раздражительным или вспыльчивым, чем обычно",
    domain: "emotional",
  },
  {
    id: 7,
    text: "Я чувствую себя подавленным или грустным",
    domain: "emotional",
  },
  {
    id: 8,
    text:
      "Я потерял интерес к вещам, которые раньше меня радовали",
    domain: "emotional",
  },
  {
    id: 9,
    text: "Мне трудно расслабиться и отвлечься от работы",
    domain: "emotional",
  },
  {
    id: 10,
    text: "Я постоянно беспокоюсь о будущем",
    domain: "emotional",
  },
  // Когнитивное состояние
  {
    id: 11,
    text:
      "Мне трудно сосредоточиться на работе или других задачах",
    domain: "cognitive",
  },
  {
    id: 12,
    text: "Я часто забываю важные вещи или детали",
    domain: "cognitive",
  },
  {
    id: 13,
    text:
      "Мне сложно принимать решения, даже по несложным вопросам",
    domain: "cognitive",
  },
  {
    id: 14,
    text:
      "Я часто отвлекаюсь и не могу долго удерживать внимание",
    domain: "cognitive",
  },
  {
    id: 15,
    text:
      "Я ощущаю, что мои мыслительные способности ухудшились",
    domain: "cognitive",
  },
  {
    id: 16,
    text:
      "Мне трудно переключаться между задачами и планировать работу",
    domain: "cognitive",
  },
];

interface ResultScores {
  physical: number;
  emotional: number;
  cognitive: number;
  total: number;
}

const getLevel = (domain: Domain | "total", score: number): string => {
  if (domain === "physical") {
    if (score <= 4) return "Низкий";
    if (score <= 8) return "Средний";
    if (score <= 12) return "Высокий";
    return "Очень высокий";
  }
  if (domain === "emotional" || domain === "cognitive") {
    if (score <= 6) return "Низкий";
    if (score <= 12) return "Средний";
    if (score <= 18) return "Высокий";
    return "Очень высокий";
  }
  // total
  if (score <= 16) return "Низкий";
  if (score <= 32) return "Средний";
  if (score <= 48) return "Высокий";
  return "Очень высокий";
};

const TestPage: NextPage<TestPageProps> = ({ currentUser }) => {
  const router = useRouter();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(QUESTIONS.length).fill(null)
  );

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scores, setScores] = useState<ResultScores | null>(null);
  const [testId, setTestId] = useState<number | null>(null);

  const [showExtra, setShowExtra] = useState(false);
  const [extra1, setExtra1] = useState("");
  const [extra2, setExtra2] = useState("");

  const getAuthConfig = () => {
    const { _token } = parseNookies();
    return _token
      ? { headers: { Authorization: `Bearer ${_token}` } }
      : undefined;
  };

  const handleAnswer = async (value: number) => {
    if (!started) setStarted(true);

    const updated = [...answers];
    updated[currentIndex] = value;
    setAnswers(updated);

    // если не последний вопрос — просто идём дальше
    if (currentIndex < QUESTIONS.length - 1) {
      setCurrentIndex((idx) => idx + 1);
      return;
    }

    // --- Завершение теста, считаем баллы ---
    const physical =
      (updated[0] || 0) +
      (updated[1] || 0) +
      (updated[2] || 0) +
      (updated[3] || 0);

    const emotional =
      (updated[4] || 0) +
      (updated[5] || 0) +
      (updated[6] || 0) +
      (updated[7] || 0) +
      (updated[8] || 0) +
      (updated[9] || 0);

    const cognitive =
      (updated[10] || 0) +
      (updated[11] || 0) +
      (updated[12] || 0) +
      (updated[13] || 0) +
      (updated[14] || 0) +
      (updated[15] || 0);

    const total = physical + emotional + cognitive;

    const result: ResultScores = { physical, emotional, cognitive, total };
    setScores(result);
    setFinished(true);

    // сохраняем результаты
    try {
      setSaving(true);
      setError(null);
      const res = await api.post(
        "/burnout-tests",
        {
          physical_score: physical,
          emotional_score: emotional,
          cognitive_score: cognitive,
          total_score: total,
        },
        getAuthConfig()
      );
      setTestId(res.data.id);
    } catch (e) {
      console.error(e);
      setError("Не удалось сохранить результаты теста");
    } finally {
      setSaving(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex === 0 || finished) return;
    setCurrentIndex((idx) => idx - 1);
  };

  const handleExtraSubmit = async (skip: boolean) => {
    if (skip || !testId) {
      router.push("/dashboard");
      return;
    }

    try {
      setSaving(true);
      await api.patch(
        `/burnout-tests/${testId}/comments`,
        {
          comment_work: extra1 || null,
          comment_factors: extra2 || null,
        },
        getAuthConfig()
      );
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
      router.push("/dashboard");
    }
  };

  const currentQuestion = QUESTIONS[currentIndex];
  const progress = Math.round(
    ((currentIndex + 1) / QUESTIONS.length) * 100
  );

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#F5F7FB] flex justify-center items-start pt-16 px-4">
      <div className="w-full max-w-4xl bg-white rounded-[32px] shadow-sm p-8 sm:p-10">
        {/* Заголовок */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">
            Добрый день,{" "}
            {currentUser.full_name || currentUser.email_corporate}
          </h1>
          {!started && !finished && (
            <p className="text-lg text-gray-600">
              Давайте пройдём короткий опрос, чтобы оценить уровень
              эмоционального выгорания.
            </p>
          )}
          {finished && scores && (
            <p className="text-lg font-semibold text-gray-800 mt-2">
              Ваши результаты теста:
            </p>
          )}
        </div>

        {!finished && (
          <>
            {/* Прогресс */}
            <div className="mb-6">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>
                  Вопрос {currentIndex + 1} из {QUESTIONS.length}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-[#005EFF] rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Вопрос */}
            <div className="mb-6">
              <p className="text-base font-medium text-gray-900 mb-4">
                {currentQuestion.text}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {[
                  { value: 0, label: "Никогда" },
                  { value: 1, label: "Редко" },
                  { value: 2, label: "Иногда" },
                  { value: 3, label: "Часто" },
                  { value: 4, label: "Очень часто" },
                ].map((opt) => {
                  const selected = answers[currentIndex] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleAnswer(opt.value)}
                      className={`w-full px-3 py-2 rounded-full border text-xs sm:text-sm font-medium transition ${
                        selected
                          ? "bg-[#005EFF] border-[#005EFF] text-white shadow-sm"
                          : "bg-white border-gray-200 text-gray-700 hover:border-[#005EFF33]"
                      }`}
                      disabled={saving}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-gray-400">
                0 – Никогда, 1 – Редко, 2 – Иногда, 3 – Часто, 4 – Очень
                часто
              </p>
            </div>

            {/* Навигация */}
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className="px-4 py-2 rounded-full border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                Назад
              </button>
            </div>
          </>
        )}

        {finished && scores && (
          <div className="space-y-6">
            {/* Основные результаты */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-[#F9FAFF] p-4 border border-[#E0E7FF]">
                <p className="text-sm text-gray-500 mb-1">
                  Физическое состояние
                </p>
                <p className="text-lg font-semibold">
                  {scores.physical} баллов{" "}
                  <span className="text-sm font-medium text-gray-500">
                    ({getLevel("physical", scores.physical)})
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-[#FFF7EB] p-4 border border-[#FED7AA]">
                <p className="text-sm text-gray-500 mb-1">
                  Эмоциональное состояние
                </p>
                <p className="text-lg font-semibold">
                  {scores.emotional} баллов{" "}
                  <span className="text-sm font-medium text-gray-500">
                    ({getLevel("emotional", scores.emotional)})
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-[#ECFEFF] p-4 border border-[#A5F3FC]">
                <p className="text-sm text-gray-500 mb-1">
                  Когнитивное состояние
                </p>
                <p className="text-lg font-semibold">
                  {scores.cognitive} баллов{" "}
                  <span className="text-sm font-medium text-gray-500">
                    ({getLevel("cognitive", scores.cognitive)})
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-[#E6FFF0] p-4 border border-[#00B33C]/30">
                <p className="text-sm text-gray-500 mb-1">
                  Общий уровень выгорания
                </p>
                <p className="text-xl font-bold">
                  {scores.total} баллов{" "}
                  <span className="text-sm font-semibold text-gray-500">
                    ({getLevel("total", scores.total)})
                  </span>
                </p>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 mb-4">{error}</p>
            )}

            {/* Дополнительные вопросы */}
            {!showExtra ? (
              <div className="flex flex-col md:flex-row gap-3 justify-between">
                <button
                  type="button"
                  onClick={() => setShowExtra(true)}
                  className="px-6 py-3 rounded-full bg-[#005EFF] text-white text-sm font-semibold hover:bg-[#0077FF] transition"
                  disabled={saving}
                >
                  Можете дополнительно ответить на 2 вопроса
                </button>
                <button
                  type="button"
                  onClick={() => handleExtraSubmit(true)}
                  className="px-6 py-3 rounded-full bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition"
                  disabled={saving}
                >
                  Продолжить без комментариев
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">
                    1. Как вы оцениваете свою текущую рабочую нагрузку?
                  </p>
                  <textarea
                    className="w-full min-h-[80px] rounded-2xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005EFF]"
                    placeholder="Опишите, что особенно нагружает вас в работе…"
                    value={extra1}
                    onChange={(e) => setExtra1(e.target.value)}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">
                    2. Какие факторы, на ваш взгляд, больше всего влияют на
                    ваше состояние?
                  </p>
                  <textarea
                    className="w-full min-h-[80px] rounded-2xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005EFF]"
                    placeholder="Например: переработки, конфликты, отсутствие отдыха…"
                    value={extra2}
                    onChange={(e) => setExtra2(e.target.value)}
                  />
                </div>

                <div className="flex flex-col md:flex-row gap-3 justify-between">
                  <button
                    type="button"
                    onClick={() => handleExtraSubmit(false)}
                    className="px-6 py-3 rounded-full bg-[#005EFF] text-white text-sm font-semibold hover:bg-[#0077FF] transition disabled:bg-gray-300"
                    disabled={saving}
                  >
                    Отправить ответы и перейти к дашборду
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExtraSubmit(true)}
                    className="px-6 py-3 rounded-full bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition"
                    disabled={saving}
                  >
                    Пропустить и перейти к дашборду
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TestPage;

// ---- SSR ----
export const getServerSideProps: GetServerSideProps<TestPageProps> = async (
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
    console.error("Error fetching user for test:", e);
    return {
      redirect: { destination: "/", permanent: false },
    };
  }
};

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
  { id: 1, text: "Я чувствую себя уставшим, когда встаю утром и должен идти на работу", domain: "physical" },
  { id: 2, text: "Я испытываю физические симптомы, такие как головные боли или мышечное напряжение", domain: "physical" },
  { id: 3, text: "Мне не хватает энергии для выполнения повседневных задач", domain: "physical" },
  { id: 4, text: "Я замечаю, что мой сон стал беспокойным и не приносит отдыха", domain: "physical" },
  // Эмоциональное состояние
  { id: 5, text: "Я чувствую себя эмоционально вымотанным", domain: "emotional" },
  { id: 6, text: "Я стал более раздражительным или вспыльчивым, чем обычно", domain: "emotional" },
  { id: 7, text: "Я чувствую себя подавленным или грустным", domain: "emotional" },
  { id: 8, text: "Я потерял интерес к вещам, которые раньше меня радовали", domain: "emotional" },
  { id: 9, text: "Мне трудно расслабиться и отвлечься от работы", domain: "emotional" },
  { id: 10, text: "Я постоянно беспокоюсь о будущем", domain: "emotional" },
  // Когнитивное состояние
  { id: 11, text: "Мне трудно сосредоточиться на работе или других задачах", domain: "cognitive" },
  { id: 12, text: "Я часто забываю важные вещи или детали", domain: "cognitive" },
  { id: 13, text: "Мне сложно принимать решения", domain: "cognitive" },
  { id: 14, text: "Я чувствую, что мой ум стал менее острым, чем раньше", domain: "cognitive" },
  { id: 15, text: "Я чувствую себя перегруженным объемом работы", domain: "cognitive" },
  { id: 16, text: "Я чувствую, что не справляюсь с требованиями своей работы", domain: "cognitive" },
];

const ANSWER_LABELS = ["Никогда", "Редко", "Иногда", "Часто", "Очень часто"];

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
  const [answers, setAnswers] = useState<(number | null)[]>(Array(QUESTIONS.length).fill(null));

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

    if (currentIndex < QUESTIONS.length - 1) {
      setCurrentIndex((idx) => idx + 1);
      return;
    }

    // Завершили тест
    const physical = (updated[0] || 0) + (updated[1] || 0) + (updated[2] || 0) + (updated[3] || 0);
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

    // сохраняем в БД
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
  const progress = Math.round(((currentIndex + 1) / QUESTIONS.length) * 100);

  return (
    <div className="min-h-[calc(100vh-96px)] bg-[#F5F7F9] flex justify-center items-start pt-16 px-4">
      <div className="w-full max-w-4xl bg-white rounded-[32px] shadow-sm p-10">
        {/* Заголовок */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">
            Добрый день, {currentUser.full_name || currentUser.email_corporate}
          </h1>
          {!started && !finished && (
            <p className="text-lg text-gray-600">
              Давай пройдём короткий опрос, чтобы оценить уровень выгорания.
            </p>
          )}
          {finished && scores && (
            <p className="text-lg font-semibold text-gray-800 mt-2">
              Ваши результаты теста:
            </p>
          )}
        </div>

        {/* Если тест завершён – блок с результатами */}
        {finished && scores ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="rounded-2xl bg-[#F7F8FA] p-4">
                <p className="text-sm text-gray-500 mb-1">Физическое состояние</p>
                <p className="text-xl font-bold">
                  {scores.physical} баллов{" "}
                  <span className="text-sm font-semibold text-gray-500">
                    ({getLevel("physical", scores.physical)})
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-[#F7F8FA] p-4">
                <p className="text-sm text-gray-500 mb-1">Эмоциональное состояние</p>
                <p className="text-xl font-bold">
                  {scores.emotional} баллов{" "}
                  <span className="text-sm font-semibold text-gray-500">
                    ({getLevel("emotional", scores.emotional)})
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-[#F7F8FA] p-4">
                <p className="text-sm text-gray-500 mb-1">Когнитивное состояние</p>
                <p className="text-xl font-bold">
                  {scores.cognitive} баллов{" "}
                  <span className="text-sm font-semibold text-gray-500">
                    ({getLevel("cognitive", scores.cognitive)})
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-[#E6FFF0] p-4 border border-[#00B33C]/30">
                <p className="text-sm text-gray-500 mb-1">Общий уровень выгорания</p>
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
                >
                  На главную
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div>
                  <p className="text-sm font-semibold mb-2">
                    1. Опишите в свободной форме, как вы чувствовали себя на работе
                    в течение последних двух недель. Что было наиболее сложным или
                    приятным?
                  </p>
                  <textarea
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#00B33C]/40"
                    rows={4}
                    value={extra1}
                    onChange={(e) => setExtra1(e.target.value)}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold mb-2">
                    2. Какие факторы (события, ситуации, взаимодействия) оказали
                    наибольшее влияние на ваше самочувствие в последнее время?
                  </p>
                  <textarea
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#00B33C]/40"
                    rows={4}
                    value={extra2}
                    onChange={(e) => setExtra2(e.target.value)}
                  />
                </div>

                <div className="flex flex-col md:flex-row gap-3 justify-end mt-4">
                  <button
                    type="button"
                    onClick={() => handleExtraSubmit(false)}
                    className="px-6 py-3 rounded-full bg-[#005EFF] text-white text-sm font-semibold hover:bg-[#0077FF] transition disabled:bg-gray-300"
                    disabled={saving}
                  >
                    {saving ? "Сохраняем..." : "Сохранить и на главную"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExtraSubmit(true)}
                    className="px-6 py-3 rounded-full bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition"
                  >
                    Пропустить и на главную
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Интерактивный тест, если ещё не завершён */}
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Вопрос {currentIndex + 1} из {QUESTIONS.length}
              </span>
              <div className="flex-1 ml-4 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0077FF] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="mb-6">
              <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-5 text-base">
                {currentQuestion.text}
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-3">Ответы</p>
            <div className="flex flex-wrap gap-3 mb-4">
              {ANSWER_LABELS.map((label, index) => {
                const value = index; // 0..4
                const selected = answers[currentIndex] === value;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleAnswer(value)}
                    className={[
                      "px-5 py-2.5 rounded-full border text-sm font-medium transition",
                      selected
                        ? "bg-[#005EFF] border-[#005EFF] text-white"
                        : "bg-white border-gray-200 text-gray-800 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-gray-400">
              0 – Никогда, 1 – Редко, 2 – Иногда, 3 – Часто, 4 – Очень часто
            </p>
          </>
        )}
      </div>
    </div>
  );
};

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

export default TestPage;

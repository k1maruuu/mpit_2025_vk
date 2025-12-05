// pages/notifications.tsx
import { GetServerSideProps } from "next";
import { useState } from "react";
import { parseCookies } from "nookies";
import api from "../lib/api";
import { isAuthenticated } from "../lib/auth";
import { User } from "../lib/types";
import Image from "next/image";

interface NotificationsProps {
  currentUser: User;
}

type Category = "general" | "articles" | "games";

interface Recommendation {
  id: number;
  category: Category;
  title: string;
  subtitle: string;
  imageUrl: string;
  content: string;
}

const RECS: Recommendation[] = [
  // ОБЩИЕ
  {
    id: 1,
    category: "general",
    title: "Сделайте перерыв",
    subtitle: "5–10 минут для восстановления",
    imageUrl: "/images/5244912623797603393.jpg",
    content:
      "Сделайте короткий перерыв от задач. Отойдите от рабочего места, посмотрите в окно или пройдитесь по офису. Важно полностью переключить внимание: не листайте рабочие чаты и соцсети. Перерывы каждые 60–90 минут помогают снизить уровень стресса и поддерживают концентрацию."
  },
  {
    id: 2,
    category: "general",
    title: "Дыхательные упражнения",
    subtitle: "Техника «4–6» для снижения напряжения",
    imageUrl: "/images/5244912623797603432.jpg",
    content:
      "Сядьте удобно. Вдохните через нос на 4 счёта, затем медленно выдохните через рот на 6 счётов. Повторите 8–10 раз. Такое дыхание помогает снизить уровень тревоги, нормализовать сердечный ритм и мягко переключиться из режима постоянного стресса."
  },
  {
    id: 3,
    category: "general",
    title: "Микроразминка для тела",
    subtitle: "2 минуты активности",
    imageUrl: "/images/5244912623797603396.jpg",
    content:
      "Встаньте, потянитесь вверх, сделайте круговые движения плечами, слегка разомните шею. Если есть возможность — пройдитесь по комнате. Даже 2–3 минуты движения уменьшают мышечное напряжение и помогают почувствовать больше энергии."
  },

  // СТАТЬИ
  {
    id: 4,
    category: "articles",
    title: "Польза прогулок",
    subtitle: "Почему важно выходить на улицу",
    imageUrl: "/images/5244912623797603396.jpg",
    content:
      "Даже короткая прогулка 10–20 минут снижает уровень стресса, улучшает концентрацию и качество сна. Постарайтесь хотя бы раз в день выйти на улицу в светлое время."
  },
  {
    id: 5,
    category: "articles",
    title: "Рабочие границы",
    subtitle: "Не тащить задачи домой",
    imageUrl: "/images/5244912623797603348.jpg",
    content:
      "Выгорание усиливается, когда работа заполняет всё личное время. Старайтесь обозначить для себя конец рабочего дня: закройте задачи, запишите планы на завтра и по возможности отключите рабочие уведомления."
  },
  {
    id: 6,
    category: "articles",
    title: "Сон и восстановление",
    subtitle: "Почему отдых — не роскошь",
    imageUrl: "/images/5244912623797603393.jpg",
    content:
      "Хронический недосып делает любые нагрузки тяжелее и усиливает эмоциональное выгорание. Постарайтесь ложиться спать примерно в одно и то же время, сократить использование гаджетов перед сном и давать себе чуть больше времени на отдых."
  },

  // ИГРА
  {
    id: 7,
    category: "games",
    title: "Визуальная новелла",
    subtitle: "Короткая история для переключения",
    imageUrl: "/images/image5.png",
    content:
      "Интерактивные истории помогают мягко отвлечься от рабочих мыслей, не проваливаясь в бесконечный скролл. Выберите небольшую визуальную новеллу или сюжетную игру и проходите её по главе в день."
  }
];

// ---------- ИГРА ----------

type StageId = "intro" | "physical" | "emotional" | "cognitive" | "final";

interface Choice {
  id: string;
  text: string;
  delta: number;
  resultText: string;
  nextStage: StageId;
}

interface Stage {
  id: StageId;
  title: string;
  subtitle?: string;
  description: string;
  bgImage: string;
  choices: Choice[];
}

const STAGES: Record<StageId, Stage> = {
  intro: {
    id: "intro",
    title: "Введение",
    subtitle: "Утро дня перезагрузки",
    description:
      "Звонок будильника смешивается с шумом города за окном. Ты открываешь глаза и понимаешь: усталость никуда не делась, хотя ночь прошла. Кажется, эта неделя выжала из тебя все соки. Сегодня ты решаешь устроить себе день перезагрузки и попробовать отнестись к себе чуть бережнее.",
    bgImage: "/images/novel/image5.png",
    choices: [
      {
        id: "intro-continue",
        text: "Начать квест по заботе о себе",
        delta: 0,
        resultText:
          "Ты решаешь пройти небольшой квест и посмотреть, что поможет почувствовать себя лучше.",
        nextStage: "physical"
      }
    ]
  },
  physical: {
    id: "physical",
    title: "Уровень 1: Физическое состояние",
    subtitle: "Первые действия после пробуждения",
    description:
      "Сон не принёс полного отдыха, тело чувствует общую вялость и лёгкую ломоту. Именно с физики начинается твой день перезагрузки — от того, как ты позаботишься о теле утром, зависит, каким получится остаток дня.",
    bgImage: "/images/novel/image5.png",
    choices: [
      {
        id: "ignore",
        text: "Проигнорировать состояние и сразу взяться за дела",
        delta: -1,
        resultText:
          "Ты делаешь вид, что всё нормально, и просто приступаешь к задачам. К концу утра усталость только усиливается.",
        nextStage: "emotional"
      },
      {
        id: "exercise",
        text: "Сделать лёгкую зарядку и подышать",
        delta: 1,
        resultText:
          "Пара простых упражнений и глубокое дыхание приносят ощущение свежести. Тело благодарно откликается.",
        nextStage: "emotional"
      },
      {
        id: "breakfast",
        text: "Приготовить себе нормальный завтрак",
        delta: 1,
        resultText:
          "Ты выбираешь полноценный завтрак вместо перекуса на бегу. С каждым кусочком энергии становится чуть больше.",
        nextStage: "emotional"
      },
      {
        id: "walk",
        text: "Выйти на короткую прогулку",
        delta: 1,
        resultText:
          "Короткая прогулка и свежий воздух помогают телу окончательно проснуться и встряхнуться.",
        nextStage: "emotional"
      }
    ]
  },
  emotional: {
    id: "emotional",
    title: "Уровень 2: Эмоциональное состояние",
    subtitle: "Днём накрывают чувства",
    description:
      "Ближе к середине дня на поверхность выходят эмоции: раздражение, тревога, усталость. Энергии на переживания почти нет, но игнорировать их тоже тяжело. Ты выбираешь, как с ними обходиться.",
    bgImage: "/images/novel/image7.png",
    choices: [
      {
        id: "close",
        text: "Сделать вид, что всё в порядке, и замкнуться в себе",
        delta: -1,
        resultText:
          "Ты прячешь чувства внутри. На время становится тише, но внутреннее напряжение только копится.",
        nextStage: "cognitive"
      },
      {
        id: "share",
        text: "Написать или поговорить с близким человеком",
        delta: 1,
        resultText:
          "Разговор с человеком, которому ты доверяешь, приносит облегчение. Появляется ощущение поддержки и некой опоры.",
        nextStage: "cognitive"
      },
      {
        id: "hobby",
        text: "Выделить время на любимое хобби",
        delta: 1,
        resultText:
          "Ты погружаешься в занятие, которое давно приносило удовольствие. Мир ненадолго сужается до приятной активности.",
        nextStage: "cognitive"
      },
      {
        id: "mindfulness",
        text: "Сделать паузу и подышать осознанно",
        delta: 1,
        resultText:
          "Ты находишь тихое место и пару минут наблюдаешь за дыханием. Мысли немного успокаиваются, эмоции становятся понятнее.",
        nextStage: "cognitive"
      }
    ]
  },
  cognitive: {
    id: "cognitive",
    title: "Уровень 3: Когнитивное состояние",
    subtitle: "Вечер и мысли о задачах",
    description:
      "К вечеру накапливается ощущение, что задач много, а концентрации мало. Мозг устал, но дела сами себя не сделают. Важно, как именно ты подойдёшь к планированию и нагрузке.",
    bgImage: "/images/novel/image6.png",
    choices: [
      {
        id: "force",
        text: "Игнорировать усталость и заставить себя работать",
        delta: -1,
        resultText:
          "Ты садишься за задачи на чистой силе воли. Через час чувствуешь себя ещё более выжатым и разбитым.",
        nextStage: "final"
      },
      {
        id: "detox",
        text: "Устроить цифровую детоксикацию",
        delta: 1,
        resultText:
          "Ты откладываешь телефон, закрываешь лишние вкладки и убираешь уведомления. Мозг благодарен за отсутствие шума.",
        nextStage: "final"
      },
      {
        id: "games",
        text: "Поиграть в простую развивающую игру или головоломку",
        delta: 1,
        resultText:
          "Небольшая умственная нагрузка в формате игры помогает мозгу перезагрузиться и включиться по-новому.",
        nextStage: "final"
      },
      {
        id: "plan",
        text: "Составить план и расставить приоритеты",
        delta: 1,
        resultText:
          "Ты выписываешь задачи и делишь их на шаги. Хаос в голове постепенно превращается в понятный план.",
        nextStage: "final"
      }
    ]
  },
  final: {
    id: "final",
    title: "Итоги дня перезагрузки",
    subtitle: "Как изменилось выгорание за день",
    description:
      "Вечером ты оглядываешься на свой день. Какие-то решения помогли, какие-то, возможно, усилили усталость. Главное — ты заметил своё состояние и попробовал о себе позаботиться. Это уже важный шаг.",
    bgImage: "/images/novel/image5.png",
    choices: []
  }
};

const getBurnoutStatusText = (level: number) => {
  if (level <= 1) {
    return "Высокий уровень выгорания. Сейчас особенно важно бережно относиться к себе и не стесняться просить поддержки — у коллег, друзей, специалистов.";
  }
  if (level === 2) {
    return "Средний уровень выгорания. Ты уже делаешь шаги навстречу себе — продолжай добавлять маленькие привычки восстановления в обычные дни.";
  }
  if (level === 3) {
    return "Уровень выгорания снижается. Осознанные паузы, отдых и забота о теле начинают работать на тебя и делать нагрузки более посильными.";
  }
  return "Твой ресурс заметно восстановился. Главное — не ждать полного истощения и продолжать поддерживать себя каждый день небольшими действиями.";
};

const getBurnoutLabel = (level: number) => {
  if (level <= 1) return "выгорание высокое";
  if (level === 2) return "выгорание среднее";
  return "выгорание уменьшается";
};

const getCharacterImageByLevel = (level: number) => {
  if (level <= 0) return "/images/novel/tilt.png"; // самое тяжёлое состояние
  if (level === 1) return "/images/novel/sad.png";
  if (level === 2) return "/images/novel/default.png";
  return "/images/novel/happy.png"; // лучшее состояние
};

const EnergyBar: React.FC<{ level: number }> = ({ level }) => {
  const steps = 5;
  const fillRatio = ((level + 1) / steps) * 100;

  return (
    <div className="w-8 h-32 sm:w-10 sm:h-40 rounded-full bg-gray-300 overflow-hidden flex flex-col justify-end">
      <div
        className="w-full"
        style={{
          height: `${fillRatio}%`,
          background: "linear-gradient(to top, #ff6b6b, #ffd93d, #9afc6a)"
        }}
      />
    </div>
  );
};

interface VisualNovelGameProps {
  onClose: () => void;
}

const VisualNovelGame: React.FC<VisualNovelGameProps> = ({ onClose }) => {
  const [burnoutLevel, setBurnoutLevel] = useState<number>(2);
  const [stageId, setStageId] = useState<StageId>("intro");
  const [lastResult, setLastResult] = useState<string | null>(null);

  const stage = STAGES[stageId];
  const characterSrc = getCharacterImageByLevel(burnoutLevel);

  const handleChoiceClick = (choice: Choice) => {
    setBurnoutLevel((prev) => Math.min(4, Math.max(0, prev + choice.delta)));
    setLastResult(choice.resultText);
    setStageId(choice.nextStage);
  };

  const handleRestart = () => {
    setBurnoutLevel(2);
    setStageId("intro");
    setLastResult(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center px-1 sm:px-3"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[1200px] h-[88vh] sm:h-[92vh] rounded-[28px] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Фон сцены */}
        <div
          className="w-full h-full flex flex-col"
          style={{
            backgroundImage: `url(${stage.bgImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundColor: "#f4efe6"
          }}
        >
          <div className="relative flex-1 bg-black/10">
            {/* Кнопка закрытия */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-4 z-30 text-white/80 hover:text-white text-2xl leading-none drop-shadow-md"
            >
              ×
            </button>

            {/* Персонаж в левом нижнем углу */}
            <div className="pointer-events-none select-none absolute left-1 sm:left-4 bottom-[72px] sm:bottom-[88px] md:bottom-[96px] z-10">
              <Image
                src={characterSrc}
                alt="Персонаж"
                width={320}
                height={200}
                className="w-28 h-auto sm:w-36 md:w-40 lg:w-44 object-contain drop-shadow-lg"
              />
            </div>

            {/* Основной контент */}
            <div className="relative flex flex-col md:flex-row gap-3 sm:gap-5 md:gap-7 p-3 sm:p-5 md:p-8 h-full">
              {/* Левая часть: шкала и подпись */}
              <div className="flex md:flex-col gap-3 md:gap-6 md:w-1/3 items-start z-20">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="flex flex-col gap-1 max-w-[170px]">
                    <span className="text-[11px] sm:text-xs text-white/85 drop-shadow text-left">
                      Текущее состояние:
                    </span>
                    <span className="text-xs sm:text-sm text-white font-semibold drop-shadow text-left">
                      {getBurnoutLabel(burnoutLevel)}
                    </span>
                  </div>
                  <EnergyBar level={burnoutLevel} />
                </div>
              </div>

              {/* Правая часть: заголовок + ответы */}
              <div className="flex-1 flex flex-col h-full gap-3 sm:gap-4 z-20">
                <div className="text-white drop-shadow max-w-xl">
                  <p className="text-xs sm:text-sm text-white/80">
                    {stage.subtitle}
                  </p>
                  <h3 className="text-lg sm:text-xl font-semibold">
                    {stage.title}
                  </h3>
                </div>

                {stageId !== "final" ? (
                  <>
                    {lastResult && (
                      <div className="bg-white/25 backdrop-blur-md border border-white/40 rounded-2xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-white shadow-md">
                        {lastResult}
                      </div>
                    )}

                    {/* ОТВЕТЫ — подняты выше, большой отступ от низа */}
                    <div className="mt-auto mb-24 sm:mb-28 md:mb-32">
                      <div className="grid gap-2 sm:gap-3 grid-cols-1 md:grid-cols-2 md:max-w-xl md:mx-auto">
                        {stage.choices.map((choice) => (
                          <button
                            key={choice.id}
                            type="button"
                            onClick={() => handleChoiceClick(choice)}
                            className="w-full rounded-[16px] bg-white/95 hover:bg-white text-xs sm:text-sm md:text-base px-3 sm:px-4 py-2.5 sm:py-3 text-gray-900 shadow-sm transition"
                          >
                            {choice.text}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-auto mb-24 sm:mb-28 md:mb-32 space-y-3 sm:space-y-4 md:max-w-xl md:mx-auto">
                    <div className="bg-white/25 backdrop-blur-md border border-white/40 rounded-2xl px-3 py-3 sm:px-4 sm:py-4 text-sm sm:text-base text-white shadow-md">
                      {getBurnoutStatusText(burnoutLevel)}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={handleRestart}
                        className="flex-1 rounded-[16px] bg-white/95 hover:bg-white text-sm sm:text-base px-4 py-3 text-gray-900 shadow-sm"
                      >
                        Пройти ещё раз
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-[16px] bg-[#2BBF5C] hover:bg-[#23a74f] text-sm sm:text-base px-4 py-3 text-white shadow-sm"
                      >
                        Завершить игру
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Описание сцены на блюре внизу */}
            <div className="absolute inset-x-2 sm:inset-x-4 md:inset-x-6 bottom-2 sm:bottom-3 md:bottom-5 z-10">
              <div className="bg-white/20 backdrop-blur-md border border-white/40 rounded-2xl px-3 py-3 sm:px-5 sm:py-4 text-[11px] sm:text-sm md:text-base text-white shadow-md">
                {stage.description}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- СТРАНИЦА НОТИФИКАЦИЙ ----------

const NotificationsPage: React.FC<NotificationsProps> = () => {
  const [active, setActive] = useState<Recommendation | null>(null);
  const [isGameOpen, setIsGameOpen] = useState(false);

  const general = RECS.filter((r) => r.category === "general");
  const articles = RECS.filter((r) => r.category === "articles");
  const games = RECS.filter((r) => r.category === "games");

  const renderSection = (
    title: string,
    items: Recommendation[],
    extraClass = ""
  ) => (
    <section className={extraClass}>
      {title && (
        <h2 className="text-base sm:text-lg font-semibold mb-3">{title}</h2>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map((rec) => (
          <button
            key={rec.id}
            type="button"
            onClick={() => {
              if (rec.category === "games") {
                setIsGameOpen(true);
              } else {
                setActive(rec);
              }
            }}
            className="group text-left bg-white rounded-[16px] overflow-hidden shadow-sm hover:shadow-md transition"
          >
            <div className="h-32 sm:h-40 bg-gray-200 overflow-hidden">
              <Image
                src={rec.imageUrl}
                alt={rec.title}
                width={320}
                height={200}
                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
              />
            </div>
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-gray-900">{rec.title}</p>
              <p className="text-xs text-gray-500 mt-1">{rec.subtitle}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <div className="max-w-[90%] mx-auto py-8 sm:py-10 px-4 space-y-8">
        {renderSection("Общие", general)}
        {renderSection("Статьи", articles, "mt-4")}
        <section className="mt-4">
          <h2 className="text-base sm:text-lg font-semibold mb-3">Игры</h2>
          <div className="max-w">{renderSection("", games)}</div>
        </section>
      </div>

      {/* Модалка с текстовой рекомендацией */}
      {active && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-3"
          onClick={() => setActive(null)}
        >
          <div
            className="bg-white rounded-[24px] w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6 sm:p-8 relative shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActive(null)}
              className="absolute top-4 right-5 text-gray-500 hover:text-black text-xl"
            >
              ×
            </button>

            <h3 className="text-lg sm:text-xl font-semibold mb-2">
              {active.title}
            </h3>
            <p className="text-sm text-gray-500 mb-4">{active.subtitle}</p>
            <p className="text-sm sm:text-base text-gray-800 whitespace-pre-line">
              {active.content}
            </p>
          </div>
        </div>
      )}

      {/* Модалка с игрой */}
      {isGameOpen && <VisualNovelGame onClose={() => setIsGameOpen(false)} />}
    </div>
  );
};

export default NotificationsPage;

export const getServerSideProps: GetServerSideProps<
  NotificationsProps
> = async (context) => {
  if (!isAuthenticated(context)) {
    return {
      redirect: { destination: "/", permanent: false }
    };
  }

  const { _token } = parseCookies(context);

  try {
    const response = await api.get<User>("/users/me", {
      headers: { Authorization: `Bearer ${_token}` }
    });

    return {
      props: {
        currentUser: response.data
      }
    };
  } catch (error) {
    console.error("Error fetching user for notifications:", error);
    return {
      redirect: { destination: "/", permanent: false }
    };
  }
};

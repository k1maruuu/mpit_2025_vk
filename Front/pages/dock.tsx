// pages/dock.tsx
import { GetServerSideProps } from "next";
import { useEffect, useState, KeyboardEvent } from "react";
import { parseCookies as parseNookies } from "nookies";
import api from "../lib/api";
import { User } from "../lib/types";
import { isAuthenticated } from "../lib/auth";

interface DockProps {
  currentUser: User;
}

type Role = "user" | "assistant" | "system";

interface ChatSession {
  id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id?: number;
  session_id?: number;
  user_id?: number;
  role: Role;
  content: string;
  created_at?: string;
}

// Базовый URL для fetch (для стриминга)
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://111.88.142.33:8000";

export default function Dock({ currentUser }: DockProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstName =
    currentUser.full_name?.trim().split(/\s+/)[0] || "вы";

  // ---- Загрузка списка сессий ----
  const fetchSessions = async () => {
    setLoadingSessions(true);
    setError(null);
    try {
      const res = await api.get<ChatSession[]>("/ai/sessions");
      const data = res.data;
      setSessions(data);

      // если нет активной сессии — выбираем последнюю
      if (!currentSessionId && data.length > 0) {
        const firstId = data[0].id;
        setCurrentSessionId(firstId);
        fetchMessages(firstId);
      }
    } catch (e) {
      console.error("Не удалось загрузить сессии", e);
      setError("Не удалось загрузить список диалогов");
    } finally {
      setLoadingSessions(false);
    }
  };

  // ---- Загрузка сообщений конкретной сессии ----
  const fetchMessages = async (sessionId: number) => {
    setLoadingMessages(true);
    setError(null);
    try {
      const res = await api.get<ChatMessage[]>(
        `/ai/sessions/${sessionId}/messages`
      );
      setMessages(res.data);
    } catch (e) {
      console.error("Не удалось загрузить сообщения", e);
      setError("Не удалось загрузить сообщения диалога");
    } finally {
      setLoadingMessages(false);
    }
  };

  // ---- Создать новую сессию ----
  const handleNewSession = async () => {
    setError(null);
    try {
      const res = await api.post<ChatSession>("/ai/sessions", {
        title: null,
      });
      const newSession = res.data;
      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      setMessages([]);
    } catch (e) {
      console.error("Не удалось создать диалог", e);
      setError("Не удалось создать новый диалог");
    }
  };

  // ---- Переключение сессии ----
  const handleSelectSession = (id: number) => {
    if (sending) return;
    setCurrentSessionId(id);
    fetchMessages(id);
  };

  // ---- Отправка сообщения + стриминг ответа ----
  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!currentSessionId) {
      setError("Сначала создайте новый диалог");
      return;
    }

    setSending(true);
    setError(null);
    setInput("");

    // Добавляем в локальный стейт сообщение пользователя и пустой ответ ассистента
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);

    try {
      const cookies = parseNookies();
      const token = cookies._token;

      const url = `${API_BASE}/ai/chat`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model: "gemma3:4b", // должен совпадать с OLLAMA_MODEL
          messages: [{ role: "user", content: text }],
          session_id: currentSessionId,
        }),
      });

      if (!response.ok || !response.body) {
        console.error("Ошибка ответа чата:", response.status);
        setError("Не удалось получить ответ от модели");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (!value) continue;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.replace(/^data:\s*/, "");

          if (data === "[DONE]") {
            done = true;
            break;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              const delta: string = parsed.content;
              // обновляем последнее сообщение ассистента
              setMessages((prev) => {
                const copy = [...prev];
                const lastIndex = copy.length - 1;
                if (
                  lastIndex >= 0 &&
                  copy[lastIndex].role === "assistant"
                ) {
                  copy[lastIndex] = {
                    ...copy[lastIndex],
                    content: (copy[lastIndex].content || "") + delta,
                  };
                }
                return copy;
              });
            } else if (parsed.error) {
              setError(parsed.error as string);
            }
          } catch (e) {
            console.error("Ошибка парсинга чанка", e, data);
          }
        }
      }
    } catch (e) {
      console.error("Ошибка при отправке сообщения", e);
      setError("Не удалось отправить сообщение ассистенту");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#F5F7FB]">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-8 space-y-6">
        {/* Заголовок */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#111827]">
              Ассистент по выгоранию
            </h1>
            <p className="mt-1 text-sm text-[#6B7280] max-w-2xl">
              Привет, {firstName}! Опишите своё состояние, нагрузку или рабочую
              ситуацию — ассистент подскажет, как снизить уровень стресса и
              выгорания.
            </p>
          </div>
          <button
            type="button"
            onClick={handleNewSession}
            disabled={sending}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-full bg-[#005EFF] text-white text-sm font-semibold hover:bg-[#0050D6] disabled:bg-gray-300 disabled:cursor-not-allowed transition shadow-[0_14px_32px_rgba(0,95,255,0.34)]"
          >
            + Новый диалог
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[320px,minmax(0,1fr)] gap-6">
          {/* Левая колонка: список диалогов */}
          <div className="bg-white rounded-[24px] border border-[#E4E7F2] shadow-sm p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#111827]">
                Диалоги
              </h2>
              {loadingSessions && (
                <span className="text-[11px] text-gray-400">
                  обновление…
                </span>
              )}
            </div>

            <div className="flex-1 border border-gray-100 rounded-2xl overflow-hidden bg-[#F8FAFC]">
              {loadingSessions ? (
                <div className="p-4 text-sm text-gray-500">Загрузка...</div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">
                  Диалогов пока нет. Нажмите «Новый диалог», чтобы начать.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                  {sessions.map((s) => (
                    <li
                      key={s.id}
                      className={`px-4 py-3 text-sm cursor-pointer hover:bg-white ${
                        currentSessionId === s.id
                          ? "bg-white border-l-4 border-[#005EFF]"
                          : ""
                      }`}
                      onClick={() => handleSelectSession(s.id)}
                    >
                      <div className="font-medium truncate">
                        {s.title || `Чат #${s.id}`}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1">
                        {new Date(s.created_at).toLocaleString("ru-RU")}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Правая колонка: чат */}
          <div className="bg-white rounded-[24px] border border-[#E4E7F2] shadow-sm p-4 sm:p-6 flex flex-col min-h-[480px]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-[#111827]">
                  Диалог с ассистентом
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {currentSession
                    ? currentSession.title || `Чат #${currentSession.id}`
                    : "Новый диалог"}
                </p>
              </div>
            </div>

            <div className="flex-1 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-3 sm:px-4 sm:py-4 overflow-y-auto space-y-3">
              {loadingMessages ? (
                <div className="text-sm text-gray-500">
                  Загрузка сообщений…
                </div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-gray-500">
                  Напишите первое сообщение, чтобы начать диалог.
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 whitespace-pre-wrap text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#005EFF] text-white rounded-br-sm font-medium shadow-sm"
                          : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            {error && (
              <p className="mt-2 text-xs text-red-500">{error}</p>
            )}

            {/* input */}
            <div className="mt-3 border-t border-[#E5E7EB] pt-3">
              <div className="flex items-end gap-2">
                <textarea
                  rows={2}
                  className="flex-1 text-sm resize-none rounded-2xl border border-[#E5E7EB] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#005EFF] focus:border-transparent bg-white"
                  placeholder="Опишите ситуацию, симптомы или вопрос…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="h-10 px-4 rounded-full bg-[#005EFF] text-white text-sm font-semibold hover:bg-[#0050D6] disabled:bg-gray-300 disabled:cursor-not-allowed transition shadow-[0_10px_24px_rgba(0,95,255,0.35)]"
                >
                  {sending ? "Отправка..." : "Отправить"}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                Нажмите Enter, чтобы отправить. Shift+Enter — перенос строки.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- SSR ----
export const getServerSideProps: GetServerSideProps<DockProps> = async (
  context
) => {
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

    return {
      props: {
        currentUser: response.data,
      },
    };
  } catch (error) {
    console.error("Error fetching user for dock:", error);
    return {
      redirect: { destination: "/", permanent: false },
    };
  }
};

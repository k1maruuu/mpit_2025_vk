// pages/dock.tsx
import { GetServerSideProps } from "next";
import { useEffect, useState } from "react";
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

// Базовый URL для fetch (для SSE запросов)
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";


export default function Dock({ currentUser }: DockProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- загрузка списка сессий ----
  const fetchSessions = async () => {
    setLoadingSessions(true);
    setError(null);
    try {
      const res = await api.get<ChatSession[]>("/ai/sessions");
      const data = res.data;
      setSessions(data);

      // если нет текущей сессии — выберем последнюю
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

  // ---- загрузка сообщений выбранной сессии ----
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
      setError("Не удалось загрузить сообщения чата");
    } finally {
      setLoadingMessages(false);
    }
  };

  // при первом рендере — подгружаем сессии
  useEffect(() => {
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- переключение сессии ----
  const handleSelectSession = (sessionId: number) => {
    setCurrentSessionId(sessionId);
    fetchMessages(sessionId);
  };

  // ---- создание новой сессии через /ai/sessions ----
  const handleNewSession = async () => {
    setError(null);
    try {
      const res = await api.post<ChatSession>("/ai/sessions", {
        title: "Новый диалог",
      });
      const newSession = res.data;
      // подгружаем список (чтобы порядок/названия обновились)
      await fetchSessions();
      setCurrentSessionId(newSession.id);
      setMessages([]);
    } catch (e) {
      console.error("Не удалось создать новую сессию", e);
      setError("Не удалось создать новый диалог");
    }
  };

  // ---- отправка сообщения + стриминг ответа ----
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

    // добавляем в локальный стейт сообщение пользователя и пустой ответ ассистента
    let assistantIndex = -1;
    setMessages((prev) => {
      const userMsg: ChatMessage = { role: "user", content: text };
      const msgs = [...prev, userMsg, { role: "assistant", content: "" }];
      assistantIndex = msgs.length - 1;
      return msgs;
    });

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
          model: "gemma3:4b", // должен совпадать с OLLAMA_MODEL на бэке
          messages: [{ role: "user", content: text }],
          session_id: currentSessionId,
        }),
      });

      if (!response.ok || !response.body) {
        console.error("Ошибка ответа чата:", response.status);
        setError("Не удалось получить ответ от модели");
        setSending(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let assistantText = "";

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
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
                assistantText += parsed.content;
                // обновляем последнее сообщение ассистента
                setMessages((prev) => {
                  const copy = [...prev];
                  if (
                    assistantIndex >= 0 &&
                    assistantIndex < copy.length &&
                    copy[assistantIndex].role === "assistant"
                  ) {
                    copy[assistantIndex] = {
                      ...copy[assistantIndex],
                      content: assistantText,
                    };
                  }
                  return copy;
                });
              } else if (parsed.error) {
                setError(parsed.error as string);
              }
            } catch {
              // игнорим сломанные чанки
            }
          }
        }
      }

      // если сервер в заголовке вернул X-Session-ID (например, при новой сессии) — обновим
      const headerSession = response.headers.get("X-Session-ID");
      if (headerSession) {
        const sessionIdNum = Number(headerSession);
        if (!Number.isNaN(sessionIdNum)) {
          setCurrentSessionId(sessionIdNum);
          // обновим список сессий
          fetchSessions();
        }
      }
    } catch (e) {
      console.error("Ошибка при отправке сообщения", e);
      setError("Ошибка при отправке сообщения");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-[70vh] bg-[#F5F7FB] flex justify-center items-start pt-20 px-4">
      <div className="w-full max-w-6xl bg-white rounded-[24px] shadow-sm p-6 mt-6 flex flex-col md:flex-row gap-6">
        {/* Левая колонка — список диалогов */}
        <div className="w-full md:w-1/3 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Диалоги</h2>
            <button
              type="button"
              onClick={handleNewSession}
              className="px-3 py-1.5 text-xs rounded-full bg-[#0077FF] text-white transition"
            >
              Новый диалог
            </button>
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
                        ? "bg-white border-l-4 border-[#6F16AA]"
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

        {/* Правая колонка — чат */}
        <div className="w-full md:w-2/3 flex flex-col">
          <div className="mb-2">
            <h1 className="text-xl font-semibold">
              Чат-бот поддержки
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Что вас беспокоит{" "}
              <span className="font-medium">
                {currentUser.full_name}
              </span>
              
            </p>
          </div>

          <div className="flex-1 border border-gray-100 rounded-2xl bg-[#F8FAFC] flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
              {loadingMessages && (
                <div className="text-gray-500 text-sm">
                  Загрузка сообщений...
                </div>
              )}

              {!loadingMessages && messages.length === 0 && (
                <div className="text-gray-400 text-sm">
                  Пока нет сообщений. Напишите что-нибудь, чтобы начать
                  диалог.
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-[#7CEDF8] text-[#00000] rounded-br-sm font-semibold "
                        : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className="px-4 pb-1 text-xs text-red-500">{error}</div>
            )}

            <div className="border-t border-gray-100 px-4 py-3 bg-white">
              <div className="flex items-end gap-2">
                <textarea
                  className="flex-1 rounded-2xl border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 bg-[#F9FAFB]"
                  rows={2}
                  placeholder="Напишите ваш вопрос или опишите ситуацию..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="h-10 px-4 rounded-full bg-[#0077FF] text-white text-sm font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                >
                  {sending ? "Отправка..." : "Отправить"}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                Нажмите Enter для отправки, Shift+Enter — новая строка.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// SSR — как было
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

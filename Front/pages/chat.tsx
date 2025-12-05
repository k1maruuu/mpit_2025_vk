// pages/chat.tsx
import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { NextPage, GetServerSideProps } from "next";
import { parseCookies } from "nookies";
import { ChatMessage, User } from "../lib/types";
import { isAuthenticated } from "../lib/auth";
type ChatPageProps = {
  currentUser: User;
};

const ChatPage: NextPage<ChatPageProps> = ({ currentUser }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = currentUser.role === "admin";

  const getAuthConfig = () => {
    if (typeof window === "undefined") return {};
    const cookies = parseCookies();
    const token = cookies._token;
    return token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : {};
  };

  const fetchMessages = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get<ChatMessage[]>("/chat/messages", getAuthConfig());
      setMessages(res.data);
    } catch (e) {
      console.error(e);
      setError("Не удалось загрузить сообщения");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));

    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await api.post(
        "/chat/messages",
        { content: newMessage.trim() },
        getAuthConfig()
      );
      setNewMessage("");
      await fetchMessages();
    } catch (e) {
      console.error(e);
      setError("Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!isAdmin) return;
    try {
      await api.delete(`/chat/messages/${id}`, getAuthConfig());
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.error(e);
      setError("Не удалось удалить сообщение");
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatShortName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0];
    const lastName = parts[0];
    const initials = parts
      .slice(1)
      .map((p) => `${p[0].toUpperCase()}.`)
      .join(" ");
    return `${lastName} ${initials}`;
  };

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[#F5F7F9] flex justify-center items-stretch pt-4 sm:pt-10 px-2 sm:px-4">
      <div className="w-full max-w-5xl bg-white rounded-none sm:rounded-[32px] shadow-none sm:shadow-md flex flex-col h-[calc(100vh-160px)] sm:h-[70vh] px-3 sm:px-8 py-4 sm:py-6">
        {/* верхняя панель чата */}
        <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-xs sm:text-sm text-gray-500">
            Сообщество
            <div className="text-sm sm:text-base font-semibold mt-1">
              Общий чат сотрудников
            </div>
          </div>
          <div className="text-xs sm:text-sm text-gray-500">
            Вы:&nbsp;
            <span className="font-semibold">
              {formatShortName(currentUser.full_name)}
            </span>
          </div>
        </div>

        {/* область сообщений */}
        <div className="flex-1 bg-[#F8FAFC] rounded-2xl sm:rounded-3xl px-3 sm:px-6 py-3 sm:py-4 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="text-gray-500 text-sm">Загрузка сообщений...</div>
          ) : messages.length === 0 ? (
            <div className="text-gray-400 text-sm">
              Сообщений пока нет. Напишите первое сообщение.
            </div>
          ) : (
            <ul className="space-y-3">
              {messages.map((msg) => {
                const isOwn = msg.user?.id === currentUser.id;

                return(
                  <li
                    key={msg.id}
                    className={`flex w-full ${
                      isOwn ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] flex flex-col ${
                        isOwn ? "items-end" : "items-start"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] sm:text-xs text-gray-500">
                          {isOwn ? "Вы" : formatShortName(msg.user.full_name)}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(msg.created_at).toLocaleTimeString(
                            "ru-RU",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </span>
                      </div>
                      <div
                        className={`rounded-2xl px-3 sm:px-4 py-2 text-xs sm:text-sm whitespace-pre-wrap break-words shadow-sm ${
                          isOwn
                            ? "bg-[#00B33C] text-white"
                            : "bg-white text-gray-900 border border-gray-100"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="ml-2 self-center text-[10px] text-red-400 hover:text-red-600"
                      >
                        удалить
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <div className="mt-2 sm:mt-3 text-xs sm:text-sm text-red-500">
            {error}
          </div>
        )}

        {/* поле ввода */}
        <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
          <textarea
            className="flex-1 min-h-[44px] sm:h-12 rounded-2xl border border-gray-200 bg-[#F5F7F9] px-3 sm:px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#00B33C]/40"
            rows={1}
            placeholder="Напишите сообщение..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={handleSend}
            disabled={sending || !newMessage.trim()}
            className="w-full sm:w-auto px-6 sm:px-10 py-3 rounded-2xl text-sm font-semibold bg-[#00B33C] text-white disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm"
          >
            {sending ? "Отправка..." : "Отправить"}
          </button>
        </div>
      </div>
    </div>
  );
};
export const getServerSideProps: GetServerSideProps<ChatPageProps> = async (
  context
) => {
  // если нет токена – отправляем на логин
  if (!isAuthenticated(context)) {
    return {
      redirect: { destination: "/", permanent: false },
    };
  }

  const { _token } = parseCookies(context);

  try {
    const res = await api.get<User>("/users/me", {
      headers: { Authorization: `Bearer ${_token}` },
    });

    return {
      props: {
        currentUser: res.data,
      },
    };
  } catch (error) {
    console.error("Error fetching user for chat:", error);
    return {
      redirect: { destination: "/", permanent: false },
    };
  }
};
export default ChatPage;

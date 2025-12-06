import { useRouter } from "next/router";
import { useState } from "react";
import { User } from "../lib/types";
import { logout } from "../lib/auth";
import Image from "next/image";

interface HeaderProps {
  currentUser: User | null;
}

const Header: React.FC<HeaderProps> = ({ currentUser }) => {
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!currentUser) return null;

  const path = router.pathname;

  // старый helper для текста (используется в моб. меню)
  const isActive = (route: string) =>
    path === route ? "text-[#005EFF]" : "text-black";

  // булевый helper для NavItem
  const isRouteActive = (route: string) => path === route;

  // ---- Навигация ----
  const goDashboard = () => router.push("/news");
  const goChatBot = () =>
    currentUser.role === "user" && router.push("/dock");
  const goDiary = () =>
    currentUser.role === "user" && router.push("/dashboard");
  const goTest = () =>
    currentUser.role === "user" && router.push("/test");
  const goRecs = () =>
    currentUser.role === "user" && router.push("/notifications");
  const goCreateUser = () =>
    (currentUser.role === "admin" || currentUser.role === "manager") &&
    router.push("/moderstor");
  const goHome = () => router.push("/news");

  const handleLogout = () => {
    if (!currentUser) return;
    logout();
    router.push("/");
  };

  const openProfile = () => setIsProfileOpen(true);
  const closeProfile = () => setIsProfileOpen(false);
  const toggleMenu = () => setIsMenuOpen((v) => !v);

  const formatShortName = (fullName?: string | null) => {
    if (!fullName || typeof fullName !== "string") return "";
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    const lastName = parts[0];
    const initials = parts
      .slice(1)
      .map((p) => (p ? `${p[0].toUpperCase()}.` : ""))
      .join("");
    return `${lastName} ${initials}`;
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "N/A";
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("ru-RU");
  };

  const burnoutLabel =
    currentUser.burn_out_score == null
      ? "нет данных"
      : `${currentUser.burn_out_score} баллов`;

  return (
    <header className="bg-white shadow-md">
      {/* Верхняя панель */}
      <div className="max-w-[90%] mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Лого + десктоп-навигация */}
        <div className="flex items-center gap-6 flex-1">
          <button
            onClick={goHome}
            className="flex items-center justify-center rounded focus:outline-none"
          >
            <Image
              src="https://logo-teka.com/wp-content/uploads/2025/06/vk-logo.svg"
              alt="VK"
              width={40}
              height={40}
              priority
            />
          </button>

          {/* Десктоп-меню по центру */}
          <nav className="hidden md:flex items-center gap-4 text-sm lg:text-base mx-auto">
            {currentUser.role === "user" && (
              <>
                <NavItem
                  text="Дэшборд"
                  onClick={goDashboard}
                  active={isRouteActive("/news")}
                />
                <NavItem
                  text="Чат-бот"
                  onClick={goChatBot}
                  active={isRouteActive("/dock")}
                />
                <NavItem
                  text="Дневник"
                  onClick={goDiary}
                  active={isRouteActive("/dashboard")}
                />
                <NavItem
                  text="Рекомендации"
                  onClick={goRecs}
                  active={isRouteActive("/notifications")}
                />
                <NavItem
                  text="Опрос"
                  onClick={goTest}
                  active={isRouteActive("/test")}
                />
              </>
            )}

            {currentUser.role === "admin" && (
              <>
                <NavItem
                  text="Дэшборд"
                  onClick={goCreateUser}
                  active={isRouteActive("/mail")}
                />
                <NavItem
                  text="Чат-бот"
                  onClick={goChatBot}
                  active={isRouteActive("/dock")}
                />
                <NavItem
                  text="Дневник"
                  onClick={goDiary}
                  active={isRouteActive("/dashboard")}
                />
                <NavItem
                  text="Рекомендации"
                  onClick={goRecs}
                  active={isRouteActive("/notifications")}
                />
                <NavItem
                  text="Опрос"
                  onClick={goTest}
                  active={isRouteActive("/test")}
                />
              </>
            )}

            {currentUser.role === "manager" && (
              <>
                <NavItem
                  text="Дэшборд"
                  onClick={goCreateUser}
                  active={isRouteActive("/mail")}
                />
                <NavItem
                  text="Чат-бот"
                  onClick={goChatBot}
                  active={isRouteActive("/dock")}
                />
                <NavItem
                  text="Дневник"
                  onClick={goDiary}
                  active={isRouteActive("/dashboard")}
                />
                <NavItem
                  text="Рекомендации"
                  onClick={goRecs}
                  active={isRouteActive("/notifications")}
                />
                <NavItem
                  text="Опрос"
                  onClick={goTest}
                  active={isRouteActive("/test")}
                />
              </>
            )}
          </nav>
        </div>

        {/* Правый блок: имя, аватар, бургер */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium hidden xs:inline">
            {formatShortName(currentUser?.full_name)}
          </span>

          <button
            onClick={openProfile}
            className="h-10 w-10 rounded-full bg-blue-200 flex items-center justify-center text-sm font-semibold"
          >
            {currentUser.full_name?.[0] || "U"}
          </button>

          {/* Бургер-меню на узких экранах */}
          <button
            className="md:hidden flex flex-col justify-center gap-[4px]"
            onClick={toggleMenu}
            aria-label="Открыть меню"
          >
            <span className="w-6 h-[2px] bg-gray-800 rounded-full" />
            <span className="w-6 h-[2px] bg-gray-800 rounded-full" />
          </button>
        </div>
      </div>

      {/* Мобильное меню */}
      {isMenuOpen && (
        <div className="md:hidden border-t bg-white">
          <nav className="max-w-[90%] mx-auto py-3 flex flex-col gap-2 text-sm">
            {currentUser.role === "user" && (
              <>
                <button
                  onClick={() => {
                    goDashboard();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/news")}`}
                >
                  Дэшборд
                </button>
                <button
                  onClick={() => {
                    goChatBot();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/dock")}`}
                >
                  Чат-бот
                </button>
                <button
                  onClick={() => {
                    goDiary();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/dashboard")}`}
                >
                  Дневник
                </button>
                <button
                  onClick={() => {
                    goRecs();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/notifications")}`}
                >
                  Рекомендации
                </button>
                <button
                  onClick={() => {
                    goTest();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/test")}`}
                >
                  Опрос
                </button>
              </>
            )}

            {currentUser.role === "admin" && (
              <>
                <button
                  onClick={() => {
                    goCreateUser();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/mail")}`}
                >
                  Дэшборд
                </button>
                <button
                  onClick={() => {
                    goChatBot();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/dock")}`}
                >
                  Чат-бот
                </button>
                <button
                  onClick={() => {
                    goDiary();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/dashboard")}`}
                >
                  Дневник
                </button>
                <button
                  onClick={() => {
                    goRecs();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/notifications")}`}
                >
                  Рекомендации
                </button>
                <button
                  onClick={() => {
                    goTest();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/test")}`}
                >
                  Опрос
                </button>
              </>
            )}

            {currentUser.role === "manager" && (
              <>
                <button
                  onClick={() => {
                    goCreateUser();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/mail")}`}
                >
                  Дэшборд
                </button>
                <button
                  onClick={() => {
                    goChatBot();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/dock")}`}
                >
                  Чат-бот
                </button>
                <button
                  onClick={() => {
                    goDiary();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/dashboard")}`}
                >
                  Дневник
                </button>
                <button
                  onClick={() => {
                    goRecs();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/notifications")}`}
                >
                  Рекомендации
                </button>
                <button
                  onClick={() => {
                    goTest();
                    setIsMenuOpen(false);
                  }}
                  className={`text-left py-1 ${isActive("/test")}`}
                >
                  Опрос
                </button>
              </>
            )}
          </nav>
        </div>
      )}

      {/* Модалка профиля */}
      {isProfileOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-3"
          onClick={closeProfile}
        >
          <div
            className="bg-white rounded-[24px] w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeProfile}
              className="absolute top-4 right-5 text-gray-500 hover:text-black text-xl"
            >
              ×
            </button>

            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-6">
              <div className="flex-shrink-0 flex justify-center sm:justify-start">
                <div className="h-20 w-20 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-semibold">
                  {currentUser.full_name?.[0] || "U"}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-lg font-semibold mb-1">
                  {currentUser.full_name}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  {currentUser.position_employee || "Должность не указана"}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  {currentUser.email_corporate ||
                    currentUser.email_user ||
                    "Email не указан"}
                </p>
                <p className="mt-2 text-sm">
                  Уровень выгорания:{" "}
                  <span className="font-medium">{burnoutLabel}</span>
                </p>
              </div>
              <div className="flex sm:flex-col items-end gap-2">
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-full bg-red-500 text-white text-sm hover:bg-red-600"
                >
                  Выйти
                </button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-gray-500">Личная почта</p>
                <p className="font-medium break-all">
                  {currentUser.email_user || "N/A"}
                </p>

                <p className="text-gray-500 mt-3">Телефон</p>
                <p className="font-medium">
                  {currentUser.phone_number || "N/A"}
                </p>

                <p className="text-gray-500 mt-3">Дата рождения</p>
                <p className="font-medium">
                  {formatDate(currentUser.birthday)}
                </p>

                <p className="text-gray-500 mt-3">Пол</p>
                <p className="font-medium">{currentUser.sex || "N/A"}</p>
              </div>

              <div className="space-y-1">
                <p className="text-gray-500 mt-3">Telegram</p>
                <p className="font-medium break-all">
                  {currentUser.tg_name || "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

interface NavItemProps {
  text: string;
  onClick: () => void;
  active: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ text, onClick, active }) => {
  return (
    <button
      onClick={onClick}
      className={`
        relative inline-flex items-center justify-center
        px-3 py-1.5
        text-sm font-medium
        transition-all duration-200 ease-out
        ${active ? "text-[#005EFF]" : "text-black"}
        hover:scale-[1.03] hover:-translate-y-[1px]
        active:scale-95
      `}
    >
      <span
        className={`
          relative inline-block
          after:absolute after:left-0 after:-bottom-[3px]
          after:h-[1px] after:w-full
          after:bg-[#A0A0A0]
          after:transition-transform after:duration-300 after:ease-out
          ${
            active
              ? "after:scale-x-100 after:origin-left"
              : "after:scale-x-0 after:origin-right hover:after:scale-x-100 hover:after:origin-left"
          }
        `}
      >
        {text}
      </span>
    </button>
  );
};

export default Header;

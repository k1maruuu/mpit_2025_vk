// pages/_app.tsx
import "../styles/globals.css";
import type { AppProps } from "next/app";
import Header from "../components/Header";
import { User } from "../lib/types";

function MyApp(props: AppProps & { currentUser?: User }) {
  const { Component, pageProps } = props;

  // Определяем, что это страница логина
  const isLoginPage = Component.name === "Home";

  // currentUser всегда берём из pageProps (его отдал getServerSideProps)
  const currentUser =
    (pageProps as { currentUser?: User }).currentUser ?? null;

  // Для страницы логина — вообще без шапки
  if (isLoginPage) {
    return <Component {...pageProps} />;
  }

  // Для всех остальных — шапка + страница
  return (
    <div>
      {currentUser && <Header currentUser={currentUser} />}
      <main>
        {/* пробрасываем currentUser дальше в страницы */}
        <Component {...pageProps} currentUser={currentUser} />
      </main>
    </div>
  );
}

export default MyApp;

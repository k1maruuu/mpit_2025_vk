from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.routers import (
    auth_main,
    users,
    news,
    chat,
    diary,
    burnout_test,
    ai,
    burnout_analyser,
)
from app.database import engine
from app import models
from app.logging_config import logger
from dotenv import load_dotenv
from contextlib import asynccontextmanager
import os

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL")
limiter = Limiter(key_func=get_remote_address, default_limits=["100 per minute"])

models.Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- startup ----
    try:
        logger.info("Warming up LLM model on startup...")
        from app.routers import ai as ai_router

        ai_router.client.chat(
            model=ai_router.OLLAMA_MODEL,
            messages=[{"role": "user", "content": "ping"}],
            stream=False,
        )
        logger.info("Warmup finished successfully")
    except Exception as e:
        logger.error(f"Warmup failed: {e}")

    # отдаем управление приложению
    yield

    # ---- shutdown (если нужно что-то почистить) ----
    # например, закрыть какие-то пулы/соединения
    # сейчас можно оставить пустым


app = FastAPI(lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Роутеры
app.include_router(auth_main.router)
app.include_router(users.router)
app.include_router(news.router)
app.include_router(chat.router)
app.include_router(diary.router)
app.include_router(burnout_test.router)
app.include_router(ai.router)
app.include_router(burnout_analyser.router)

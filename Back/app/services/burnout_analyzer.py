import json
import os
from datetime import datetime, timedelta, date
from statistics import mean
from typing import List, Optional, Dict, Any

from sqlalchemy.orm import Session
from ollama import Client
from pydantic import ValidationError

from app import models, schemas
from app.logging_config import logger

# Настройки Ollama
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://ollama:11434")
OLLAMA_ANALYSIS_MODEL = os.getenv(
    "OLLAMA_ANALYSIS_MODEL",
    os.getenv("OLLAMA_MODEL", "gemma3:4b"),
)

client = Client(host=OLLAMA_HOST)


# ----------------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ -----------------


def _classify_risk(score: Optional[int]) -> schemas.RiskLevel:
    """Классифицируем уровень риска по баллу выгорания."""
    if score is None:
        return schemas.RiskLevel.LOW  # по умолчанию считаем низким

    if score <= 25:
        return schemas.RiskLevel.LOW
    if score <= 40:
        return schemas.RiskLevel.MEDIUM
    if score <= 55:
        return schemas.RiskLevel.HIGH
    return schemas.RiskLevel.CRITICAL


def _safe_json_from_content(content: str) -> Dict[str, Any]:
    """
    Вытаскиваем JSON из ответа модели:
    берём первый блок между фигурными скобками.
    """
    try:
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("No JSON object found in content")
        json_str = content[start : end + 1]
        return json.loads(json_str)
    except Exception as e:
        logger.error(
            f"Не удалось распарсить JSON от LLM: {e}. Content start: {content[:400]!r}"
        )
        raise ValueError("Модель вернула некорректный JSON")


def _calc_age(bday: Optional[date]) -> Optional[int]:
    if not bday:
        return None
    today = datetime.utcnow().date()
    years = today.year - bday.year
    if (today.month, today.day) < (bday.month, bday.day):
        years -= 1
    return max(years, 0)


# ----------------- ПЕРСОНАЛЬНЫЙ АНАЛИЗ -----------------


def generate_burnout_recommendations(
    db: Session, user_id: int
) -> schemas.BurnoutAnalysisResponse:
    """
    Персонализированный анализ выгорания для одного пользователя.
    """
    user: Optional[models.User] = (
        db.query(models.User).filter(models.User.id == user_id).first()
    )
    if not user:
        raise ValueError("Пользователь не найден")

    # Последний тест выгорания, если есть такая модель
    latest_test = None
    if hasattr(models, "BurnoutTest"):
        latest_test = (
            db.query(models.BurnoutTest)
            .filter(models.BurnoutTest.user_id == user_id)
            .order_by(models.BurnoutTest.created_at.desc())
            .first()
        )

    avg_mood_30d: Optional[float] = None
    if hasattr(models, "MoodEntry"):
        since_date = datetime.utcnow().date() - timedelta(days=30)
        mood_entries = (
            db.query(models.MoodEntry)
            .filter(
                models.MoodEntry.user_id == user_id,
                models.MoodEntry.date >= since_date,
            )
            .all()
        )
        if mood_entries:
            avg_mood_30d = mean(int(e.mood) for e in mood_entries)

    base_payload: Dict[str, Any] = {
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "position": user.position_employee,
            "company": user.company,
            "city": user.city,
            "work_experience": user.work_experience,
            "burn_out_score": user.burn_out_score,
        },
        "latest_test": None,
        "avg_mood_last_30d": avg_mood_30d,
    }

    if latest_test:
        base_payload["latest_test"] = {
            "physical_score": latest_test.physical_score,
            "emotional_score": latest_test.emotional_score,
            "cognitive_score": latest_test.cognitive_score,
            "total_score": latest_test.total_score,
            "created_at": latest_test.created_at.isoformat(),
        }

    system_prompt = (
        "Ты - эксперт по выгоранию сотрудников. Тебе даются данные о сотруднике, его балле выгорания, "
        "результатах теста и среднем настроении за 30 дней.\n\n"
        "Твоя задача - кратко проанализировать ситуацию и выдать структурированные рекомендации.\n\n"
        "ФОРМАТ ОТВЕТА: строго JSON со структурой:\n"
        "{\n"
        '  \"analysis_date\": \"ISO-8601 datetime\",\n'
        '  \"risk_level\": \"low\" | \"medium\" | \"high\" | \"critical\",\n'
        '  \"summary\": \"1-3 абзаца краткого анализа\",\n'
        '  \"key_factors\": [\"фактор 1\", \"фактор 2\", ...],\n'
        '  \"recommendations\": [\n'
        "    {\n"
        '      \"category\": \"workload\" | \"rest\" | \"support\" | \"development\" | \"health\",\n'
        '      \"priority\": \"high\" | \"medium\" | \"low\",\n'
        '      \"text\": \"описание рекомендации\",\n'
        '      \"action_items\": [\"конкретный шаг 1\", \"конкретный шаг 2\", ...]\n'
        "    }, ...\n"
        "  ],\n"
        '  \"suggested_actions\": [\"краткий список шагов для самого сотрудника\"]\n'
        "}\n\n"
        "ВАЖНО:\n"
        "- 'category' — одно слово, без скобок и дополнительных пояснений.\n"
        "- 'priority' только 'high', 'medium' или 'low'.\n"
        "- Ответ — только JSON, без текста вокруг."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": json.dumps(base_payload, ensure_ascii=False),
        },
    ]

    logger.info(f"Запрос персонального анализа выгорания в LLM для user_id={user_id}")
    response = client.chat(model=OLLAMA_ANALYSIS_MODEL, messages=messages)
    content = response["message"]["content"]

    raw = _safe_json_from_content(content)

    raw.setdefault("user_id", user.id)
    raw.setdefault("analysis_date", datetime.utcnow().isoformat())

    try:
        analysis = schemas.BurnoutAnalysisResponse.model_validate(raw)
    except ValidationError as ve:
        logger.error(f"Ошибка валидации BurnoutAnalysisResponse: {ve}")
        raise ValueError("Ответ модели не прошёл валидацию структуры")

    return analysis


# ----------------- ГРУППОВОЙ АНАЛИЗ (Только агрегаты, без персоналий) -----------------


def generate_group_burnout_analysis(
    db: Session, company: Optional[str], city: Optional[str]
) -> schemas.GroupBurnoutAnalysisResponse:
    """
    Групповой анализ по компании или городу.
    - Никаких персональных данных в ответе.
    - Модель видит только агрегаты и обезличенные данные.
    - Фронт получает один общий анализ, без выделения отдельного сотрудника.
    """
    # 1. Выбираем сотрудников по фильтру
    query = db.query(models.User).filter(models.User.role == models.UserRole.USER)

    if company:
        query = query.filter(models.User.company == company)
        filter_type = "company"
        filter_value = company
    elif city:
        query = query.filter(models.User.city == city)
        filter_type = "city"
        filter_value = city
    else:
        raise ValueError("Необходимо указать company или city")

    employees: List[models.User] = query.all()
    if not employees:
        raise ValueError("По заданному фильтру не найдено сотрудников")

    total_employees = len(employees)

    # 2. Базовые метрики по группе
    burnout_scores = [
        u.burn_out_score for u in employees if u.burn_out_score is not None
    ]
    employees_with_tests = len(burnout_scores)
    avg_burnout_score: Optional[float] = (
        mean(burnout_scores) if burnout_scores else None
    )

    work_exps = [
        u.work_experience for u in employees if u.work_experience is not None
    ]
    avg_work_experience: Optional[float] = (
        mean(work_exps) if work_exps else None
    )

    # Распределение по рискам
    low_risk = medium_risk = high_risk = critical_risk = 0
    for u in employees:
        risk = _classify_risk(u.burn_out_score)
        if risk == schemas.RiskLevel.LOW:
            low_risk += 1
        elif risk == schemas.RiskLevel.MEDIUM:
            medium_risk += 1
        elif risk == schemas.RiskLevel.HIGH:
            high_risk += 1
        else:
            critical_risk += 1

    # Пол / возраст (агрегировано)
    ages: List[int] = []
    sex_counts: Dict[str, int] = {"male": 0, "female": 0, "other": 0}
    for u in employees:
        age = _calc_age(u.birthday)
        if age is not None:
            ages.append(age)

        sex_val = (u.sex or "").strip().lower()
        if sex_val.startswith("м"):
            sex_counts["male"] += 1
        elif sex_val.startswith("ж"):
            sex_counts["female"] += 1
        else:
            sex_counts["other"] += 1

    avg_age = mean(ages) if ages else None
    min_age = min(ages) if ages else None
    max_age = max(ages) if ages else None

    # >6 месяцев без отпуска – без реальных дат ставим пока 0
    long_vacation_gap_count = 0

    # Среднее настроение за 30 дней по группе
    avg_mood_last_30d: Optional[float] = None
    if hasattr(models, "MoodEntry"):
        since_date = datetime.utcnow().date() - timedelta(days=30)
        ids = [u.id for u in employees]
        mood_q = (
            db.query(models.MoodEntry)
            .filter(
                models.MoodEntry.user_id.in_(ids),
                models.MoodEntry.date >= since_date,
            )
            .all()
        )
        if mood_q:
            avg_mood_last_30d = mean(int(e.mood) for e in mood_q)

    # 3. Агрегаты по типам выгорания (физическое / эмоциональное / когнитивное / суммарный балл)
    burnout_dim_stats: Dict[str, Dict[str, Optional[float]]] = {
        "physical": {"avg_score": None},
        "emotional": {"avg_score": None},
        "cognitive": {"avg_score": None},
        "total": {"avg_score": None},
    }

    if hasattr(models, "BurnoutTest"):
        # Берём последние тесты по каждому пользователю
        ids = [u.id for u in employees]
        tests = (
            db.query(models.BurnoutTest)
            .filter(models.BurnoutTest.user_id.in_(ids))
            .order_by(
                models.BurnoutTest.user_id, models.BurnoutTest.created_at.desc()
            )
            .all()
        )

        latest_by_user: Dict[int, models.BurnoutTest] = {}
        for t in tests:
            if t.user_id not in latest_by_user:
                latest_by_user[t.user_id] = t

        phys_list: List[int] = []
        emot_list: List[int] = []
        cog_list: List[int] = []
        total_list: List[int] = []

        for t in latest_by_user.values():
            phys_list.append(t.physical_score)
            emot_list.append(t.emotional_score)
            cog_list.append(t.cognitive_score)
            total_list.append(t.total_score)

        if phys_list:
            burnout_dim_stats["physical"]["avg_score"] = mean(phys_list)
        if emot_list:
            burnout_dim_stats["emotional"]["avg_score"] = mean(emot_list)
        if cog_list:
            burnout_dim_stats["cognitive"]["avg_score"] = mean(cog_list)
        if total_list:
            burnout_dim_stats["total"]["avg_score"] = mean(total_list)

    group_stats = schemas.EmployeeGroupStats(
        total_employees=total_employees,
        employees_with_tests=employees_with_tests,
        avg_burnout_score=avg_burnout_score,
        high_risk_count=high_risk,
        medium_risk_count=medium_risk,
        low_risk_count=low_risk,
        critical_risk_count=critical_risk,
        avg_work_experience=avg_work_experience,
        long_vacation_gap_count=long_vacation_gap_count,
        avg_mood_last_30d=avg_mood_last_30d,
    )

    # 4. Для LLM – только агрегированная информация, без персональных строк
    llm_input = {
        "filter_type": filter_type,
        "filter_value": filter_value,
        "group_stats": group_stats.model_dump(),
        "sex_distribution": sex_counts,
        "age_distribution": {
            "avg_age": avg_age,
            "min_age": min_age,
            "max_age": max_age,
        },
        "burnout_dimensions": burnout_dim_stats,
    }

    system_prompt = (
        "Ты — аналитик по эмоциональному выгоранию сотрудников. Тебе даются только агрегированные "
        "данные по группе (компания или город): количество людей, распределение по уровню риска, "
        "распределение по полу, средний возраст и средние баллы по видам выгорания.\n\n"
        "В ответе НЕЛЬЗЯ выделять конкретных людей. Никаких примеров 'у одного сотрудника...'. "
        "Только описание группы в целом.\n\n"
        "Твоя задача:\n"
        "- Кратко описать общую ситуацию (summary, 1–3 абзаца).\n"
        "- Выделить 3–7 ключевых трендов (key_trends), например:\n"
        "  * какие зоны риска доминируют,\n"
        "  * отличается ли состояние мужчин и женщин,\n"
        "  * есть ли особенности по возрасту,\n"
        "  * что видно по видам выгорания: физическое, эмоциональное, когнитивное, суммарное.\n"
        "- Сформировать 3–6 рекомендаций (recommendations) по категориям:\n"
        "  * workload — нагрузка и переработки,\n"
        "  * rest — отдых, отпуска, режим дня,\n"
        "  * support — поддержка руководства и команды,\n"
        "  * development — развитие и мотивация,\n"
        "  * health — здоровье, стресс-менеджмент.\n"
        "- Дать 3–7 приоритетных шагов (priority_actions) для HR/руководства.\n\n"
        "ФОРМАТ ОТВЕТА: строго JSON:\n"
        "{\n"
        "  \"summary\": \"текст\",\n"
        "  \"key_trends\": [\"строка 1\", \"строка 2\", ...],\n"
        "  \"recommendations\": [\n"
        "    {\n"
        "      \"category\": \"workload\" | \"rest\" | \"support\" | \"development\" | \"health\",\n"
        "      \"priority\": \"high\" | \"medium\" | \"low\",\n"
        "      \"text\": \"описание рекомендации\",\n"
        "      \"action_items\": [\"конкретный шаг 1\", \"конкретный шаг 2\", ...]\n"
        "    }, ...\n"
        "  ],\n"
        "  \"priority_actions\": [\"строка 1\", \"строка 2\", ...]\n"
        "}\n\n"
        "ВАЖНО:\n"
        "- 'category' — одно слово, без скобок и лишнего текста.\n"
        "- 'priority' только 'high', 'medium' или 'low'.\n"
        "- Никаких упоминаний отдельных сотрудников. Только 'группа', 'часть сотрудников', 'работники с высоким риском' и т.п.\n"
        "- Ответ — только JSON, без текста вокруг."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(llm_input, ensure_ascii=False)},
    ]

    logger.info(
        f"Генерация группового анализа: {filter_type}={filter_value}, employees={total_employees}"
    )

    response = client.chat(model=OLLAMA_ANALYSIS_MODEL, messages=messages)
    content = response["message"]["content"]
    raw = _safe_json_from_content(content)

    summary = raw.get("summary", "")
    key_trends = raw.get("key_trends") or []
    priority_actions = raw.get("priority_actions") or []
    recs_raw = raw.get("recommendations") or []

    recommendations: List[schemas.Recommendation] = []
    for r in recs_raw:
        try:
            rec = schemas.Recommendation.model_validate(r)
            recommendations.append(rec)
        except ValidationError as ve:
            logger.warning(
                f"Пропускаем рекомендацию из-за ошибки валидации: {ve}; raw={r}"
            )

    # employee_breakdown: чтобы не ломать фронт — отдаём пустой список или
    # при желании можно сюда положить агрегированные строки, а не персональные.
    employee_breakdown: List[Dict[str, Any]] = []

    analysis = schemas.GroupBurnoutAnalysisResponse(
        analysis_date=datetime.utcnow(),
        filter_type=filter_type,
        filter_value=filter_value,
        group_stats=group_stats,
        summary=summary,
        key_trends=key_trends,
        recommendations=recommendations,
        priority_actions=priority_actions,
        employee_breakdown=employee_breakdown,
    )

    return analysis

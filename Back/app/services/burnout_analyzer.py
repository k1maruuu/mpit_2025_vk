from sqlalchemy.orm import Session
from typing import List, Dict, Optional, Any
from app import models, schemas
from app.logging_config import logger
from ollama import Client
import os
from dotenv import load_dotenv
from datetime import date, timedelta, datetime, timezone
import json
import re  # ✅ ДОБАВЛЕН ИМПОРТ

load_dotenv()

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_ANALYSIS_MODEL = os.getenv("OLLAMA_ANALYSIS_MODEL", "gemma3:4b")
client = Client(host=OLLAMA_HOST)

def parse_vacation_date(vacation_str: Optional[str]) -> Optional[date]:
    """Парсит дату отпуска из строки. При любом некорректном значении возвращает None."""
    if not vacation_str or vacation_str.strip() == '':
        return None
    
    # Быстрая проверка: если строка не содержит цифр или слишком короткая - это не дата
    cleaned = vacation_str.strip().lower()
    if not any(char.isdigit() for char in cleaned) or len(cleaned) < 6:
        return None
    
    try:
        # Пробуем разные стандартные форматы
        for fmt in ["%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"]:
            try:
                return datetime.strptime(vacation_str.strip(), fmt).date()
            except:
                continue
        
        # Если не получилось, ищем дату в тексте через регулярное выражение
        match = re.search(r'\d{1,2}[./-]\d{1,2}[./-]\d{4}', vacation_str)
        if match:
            return parse_vacation_date(match.group())
        
        return None
    except Exception:
        # Любая ошибка парсинга = некорректные данные = считаем что отпуска не было
        return None

def collect_group_data(db: Session, company: Optional[str] = None, city: Optional[str] = None) -> Dict[str, Any]:
    """Собирает данные всех сотрудников группы (по company или city)"""
    if not company and not city:
        raise ValueError("Необходимо указать company или city")
    
    query = db.query(models.User).filter(models.User.is_active == True)
    
    if company:
        query = query.filter(models.User.company.ilike(f"%{company}%"))
        filter_type = "company"
        filter_value = company
    else:
        query = query.filter(models.User.city.ilike(f"%{city}%"))
        filter_type = "city"
        filter_value = city
    
    employees = query.all()
    
    if not employees:
        raise ValueError(f"Сотрудники не найдены для {filter_type}={filter_value}")
    
    employees_data = []
    today = date.today()
    
    for user in employees:
        # Тесты выгорания
        burnout_tests = db.query(models.BurnoutTestResult)\
            .filter(models.BurnoutTestResult.user_id == user.id)\
            .order_by(models.BurnoutTestResult.created_at.desc())\
            .all()
        
        # Дневник настроения за 30 дней
        thirty_days_ago = today - timedelta(days=30)
        mood_entries = db.query(models.MoodEntry)\
            .filter(
                models.MoodEntry.user_id == user.id,
                models.MoodEntry.date >= thirty_days_ago
            )\
            .all()
        
        # Данные отпуска (теперь без ошибок при некорректных данных)
        last_vacation = parse_vacation_date(user.vacation)
        vacation_days_ago = (today - last_vacation).days if last_vacation else None
        
        employees_data.append({
            "user": user,
            "burnout_tests": burnout_tests,
            "recent_mood": mood_entries,
            "last_vacation_days_ago": vacation_days_ago,
            "kpi_history": {
                "june": user.june, "july": user.july, "august": user.august,
                "september": user.september, "october": user.october
            }
        })
    
    return {
        "filter_type": filter_type,
        "filter_value": filter_value,
        "employees_data": employees_data,
        "total_count": len(employees)
    }

def build_group_analysis_prompt(group_data: Dict[str, Any]) -> str:
    """Создает промпт для группового анализа"""
    filter_type = group_data["filter_type"]
    filter_value = group_data["filter_value"]
    employees_data = group_data["employees_data"]
    
    prompt = f"""Ты — эксперт по профилактике выгорания сотрудников с 10-летним опытом в HR и психологии.
Проанализируй данные группы сотрудников и дай СТРАТЕГИЧЕСКИЕ рекомендации.

ПАРАМЕТРЫ ГРУППЫ:
- Фильтр: {filter_type} = {filter_value}
- Всего сотрудников: {len(employees_data)}

ДАННЫЕ ПО СОТРУДНИКАМ:
"""
    
    stats = {
        "total": len(employees_data),
        "with_tests": 0,
        "scores": [],
        "vacation_gaps": 0,
        "work_experiences": [],
        "moods": []
    }
    
    for i, emp_data in enumerate(employees_data, 1):
        user = emp_data["user"]
        tests = emp_data["burnout_tests"]
        tests_count = len(tests)
        if tests_count > 0:
            stats["with_tests"] += 1
            latest_score = tests[0].total_score
            stats["scores"].append(latest_score)
        
        vacation_gap = emp_data["last_vacation_days_ago"]
        if vacation_gap and vacation_gap > 180:  # >6 месяцев
            stats["vacation_gaps"] += 1
        
        if user.work_experience:
            stats["work_experiences"].append(user.work_experience)
        
        moods = emp_data["recent_mood"]
        if moods:
            avg_mood = sum(m.mood for m in moods) / len(moods)
            stats["moods"].append(avg_mood)
        
        prompt += f"""

СОТРУДНИК #{i}: {user.full_name}
- Должность: {user.position_employee}
- Стаж: {user.work_experience} мес.
- Последний отпуск: {vacation_gap} дн. назад
- KPI (5 мес.): {user.june}, {user.july}, {user.august}, {user.september}, {user.october}
- Тестов выгорания: {tests_count}
{"- Последний тест: " + str(tests[0].total_score) + " баллов" if tests_count > 0 else ""}
{"- Среднее настроение (30д): " + str(round(sum(m.mood for m in moods) / len(moods), 1)) if moods else ""}
- Комментарии к работе: "{tests[0].comment_work if tests_count > 0 and tests[0].comment_work else 'Нет'}"
- Факторы риска: "{tests[0].comment_factors if tests_count > 0 and tests[0].comment_factors else 'Нет'}"
"""
    
    # Добавляем статистику
    avg_score = sum(stats["scores"]) / len(stats["scores"]) if stats["scores"] else 0
    avg_exp = sum(stats["work_experiences"]) / len(stats["work_experiences"]) if stats["work_experiences"] else 0
    avg_mood = sum(stats["moods"]) / len(stats["moods"]) if stats["moods"] else 0
    
    prompt += f"""

ОБЩАЯ СТАТИСТИКА ГРУППЫ:
- Сотрудников с тестами: {stats["with_tests"]}/{stats["total"]}
- Средний балл выгорания: {avg_score:.1f}/60
- Без отпуска >6 мес: {stats["vacation_gaps"]} чел.
- Средний стаж: {avg_exp:.1f} мес.
- Среднее настроение: {avg_mood:.1f}/5.0

ЗАДАЧА:
1. Определи общий уровень риска выгорания группы (low/medium/high/critical)
2. Выдели 3-5 ключевых трендов и проблем
3. Дай СТРАТЕГИЧЕСКИЕ рекомендации в 4 категориях:
   - workload (оптимизация нагрузки)
   - rest (политика отпусков)
   - support (поддержка коллектива)
   - development (развитие и мотивация)
4. Предложи конкретный план действий на 1 месяц для руководства

ФОРМАТ ОТВЕТА (JSON):
{{
  "summary": "Краткий итог в 3-5 предложений",
  "key_trends": ["тренд1", "тренд2", "тренд3"],
  "recommendations": [
    {{
      "category": "workload",
      "priority": "high",
      "text": "Рекомендация",
      "action_items": ["конкретное действие 1", "конкретное действие 2"]
    }}
  ],
  "priority_actions": ["Действие 1", "Действие 2", "Действие 3"]
}}

ТРЕБОВАНИЯ:
- Будь конкретным и практичным
- Учитывай KPI и стаж сотрудников
- Анализируй причины долгого отпуска
- Пиши на русском языке
- Не используй общие фразы"""

    return prompt

def parse_group_ai_response(response_text: str) -> Optional[Dict[str, Any]]:
    """Парсит JSON-ответ от ИИ для группового анализа"""
    try:
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        return json.loads(response_text)
    except Exception as e:
        logger.error(f"Ошибка парсинга группового ответа ИИ: {e}")
        return None

def generate_group_burnout_analysis(db: Session, company: Optional[str] = None, city: Optional[str] = None) -> schemas.GroupBurnoutAnalysisResponse:
    """Генерирует групповой анализ выгорания"""
    logger.info(f"Генерация группового анализа: company={company}, city={city}")
    
    # 1. Сбор данных
    group_data = collect_group_data(db, company, city)
    
    # 2. Вычисляем статистику
    employees_data = group_data["employees_data"]
    today = date.today()
    
    total_employees = len(employees_data)
    employees_with_tests = sum(1 for emp in employees_data if emp["burnout_tests"])
    burnout_scores = [emp["burnout_tests"][0].total_score for emp in employees_data if emp["burnout_tests"]]
    avg_burnout_score = sum(burnout_scores) / len(burnout_scores) if burnout_scores else None
    
    # Риски
    high_risk = sum(1 for s in burnout_scores if 41 <= s <= 55)
    critical_risk = sum(1 for s in burnout_scores if 56 <= s <= 60)
    medium_risk = sum(1 for s in burnout_scores if 26 <= s <= 40)
    low_risk = sum(1 for s in burnout_scores if 10 <= s <= 25)
    
    # Отпуск
    long_vacation_gap = sum(1 for emp in employees_data 
                           if emp["last_vacation_days_ago"] and emp["last_vacation_days_ago"] > 180)
    
    # Стаж
    work_experiences = [emp["user"].work_experience for emp in employees_data if emp["user"].work_experience]
    avg_work_experience = sum(work_experiences) / len(work_experiences) if work_experiences else None
    
    # Настроение
    all_moods = []
    for emp in employees_data:
        if emp["recent_mood"]:
            avg_mood = sum(m.mood for m in emp["recent_mood"]) / len(emp["recent_mood"])
            all_moods.append(avg_mood)
    avg_mood_last_30d = sum(all_moods) / len(all_moods) if all_moods else None
    
    # 3. Формирование промпта
    prompt = build_group_analysis_prompt(group_data)
    
    # 4. Вызов ИИ
    try:
        response = client.chat(
            model=OLLAMA_ANALYSIS_MODEL,
            messages=[{"role": "user", "content": prompt}],
            stream=False
        )
        
        ai_content = response['message']['content']
        parsed_data = parse_group_ai_response(ai_content)
        
        if not parsed_data:
            raise ValueError("Не удалось разобрать ответ ИИ")
        
        employee_breakdown = []
        for emp in employees_data[:10]:  # Ограничиваем, чтобы не перегружать ответ
            user = emp["user"]
            emp_test = emp["burnout_tests"][0] if emp["burnout_tests"] else None
            employee_breakdown.append({
                "user_id": user.id,
                "full_name": user.full_name,
                "position": user.position_employee,
                "burnout_score": emp_test.total_score if emp_test else None,
                "vacation_gap_days": emp["last_vacation_days_ago"],
                "work_experience": user.work_experience
            })
        
        return schemas.GroupBurnoutAnalysisResponse(
            analysis_date=datetime.now(timezone.utc),
            filter_type=group_data["filter_type"],
            filter_value=group_data["filter_value"],
            group_stats=schemas.EmployeeGroupStats(
                total_employees=total_employees,
                employees_with_tests=employees_with_tests,
                avg_burnout_score=avg_burnout_score,
                high_risk_count=high_risk,
                medium_risk_count=medium_risk,
                low_risk_count=low_risk,
                critical_risk_count=critical_risk,
                avg_work_experience=avg_work_experience,
                long_vacation_gap_count=long_vacation_gap,
                avg_mood_last_30d=avg_mood_last_30d
            ),
            summary=parsed_data.get("summary", "Анализ завершен"),
            key_trends=parsed_data.get("key_trends", []),
            recommendations=parsed_data.get("recommendations", []),
            priority_actions=parsed_data.get("priority_actions", []),
            employee_breakdown=employee_breakdown
        )
        
    except Exception as e:
        logger.error(f"Ошибка группового анализа: {e}")
        raise

# Сохраняем исходную функцию для индивидуального анализа (оставьте как есть)
def collect_user_data(db: Session, user_id: int) -> Dict:
    """Собирает полную информацию о пользователе для анализа"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        return None
    
    burnout_tests = db.query(models.BurnoutTestResult)\
        .filter(models.BurnoutTestResult.user_id == user_id)\
        .order_by(models.BurnoutTestResult.created_at.desc())\
        .all()
    
    thirty_days_ago = date.today() - timedelta(days=30)
    mood_entries = db.query(models.MoodEntry)\
        .filter(
            models.MoodEntry.user_id == user_id,
            models.MoodEntry.date >= thirty_days_ago
        )\
        .order_by(models.MoodEntry.date.desc())\
        .all()
    
    return {
        "user": user,
        "burnout_tests": burnout_tests,
        "recent_mood": mood_entries,
        "kpi_history": {
            "june": user.june, "july": user.july, "august": user.august,
            "september": user.september, "october": user.october
        }
    }

def build_analysis_prompt(user_data: Dict) -> str:
    """Создает детальный промпт для анализа выгорания"""
    user = user_data["user"]
    tests = user_data["burnout_tests"]
    
    if not tests:
        return "Нет данных о тестах выгорания для анализа."
    
    latest_test = tests[0]
    
    prompt = f"""Ты — эксперт по профилактике выгорания сотрудников с 10-летним опытом в HR и психологии.
Проанализируй данные сотрудника и дай ПЕРСОНАЛИЗИРОВАННЫЕ рекомендации.

ДАННЫЕ СОТРУДНИКА:
- ФИО: {user.full_name}
- Должность: {user.position_employee} ({user.hierarchy_status or 'Не указан'})
- Стаж: {user.work_experience} месяцев
- Город: {user.city}
- Компания: {user.company}

ПОКАЗАТЕЛИ KPI (последние 5 месяцев):
- Июнь: {user.june}
- Июль: {user.july}
- Август: {user.august}
- Сентябрь: {user.september}
- Октябрь: {user.october}

РЕЗУЛЬТАТЫ ТЕСТА ВЫГОРАНИЯ:
- Общий балл: {latest_test.total_score}/60
- Физическое выгорание: {latest_test.physical_score}/20
- Эмоциональное выгорание: {latest_test.emotional_score}/20
- Когнитивное выгорание: {latest_test.cognitive_score}/20

ОТВЕТЫ НА ДОПОЛНИТЕЛЬНЫЕ ВОПРОСЫ:
1. Проблемы на работе: "{latest_test.comment_work or 'Не указаны'}"
2. Факторы риска: "{latest_test.comment_factors or 'Не указаны'}"

ИСТОРИЯ ТЕСТОВ:
"""
    for i, test in enumerate(tests[:5], 1):
        prompt += f"- Тест {i} ({test.created_at.strftime('%d.%m.%Y')}): {test.total_score} баллов\n"

    prompt += f"""

ДНЕВНИК НАСТРОЕНИЯ (последние 30 дней):
"""
    if user_data["recent_mood"]:
        avg_mood = sum(entry.mood for entry in user_data["recent_mood"]) / len(user_data["recent_mood"])
        prompt += f"- Среднее настроение: {avg_mood:.1f}/5.0\n"
        prompt += "- Последние записи:\n"
        for entry in user_data["recent_mood"][:7]:
            prompt += f"  * {entry.date}: {entry.mood}/5 - {entry.comment or 'Без комментария'}\n"
    else:
        prompt += "- Данные отсутствуют\n"

    prompt += """

ЗАДАЧА:
1. Определи уровень риска выгорания (low/medium/high/critical)
2. Выдели 3-5 ключевых факторов риска
3. Дай ДЕЙСТВЕННЫЕ рекомендации в 4 категориях:
   - workload (управление нагрузкой)
   - rest (отдых и восстановление)
   - support (поддержка и коммуникация)
   - development (развитие и мотивация)
4. Предложи конкретный план действий на 2 недели

ФОРМАТ ОТВЕТА (JSON):
{
  "risk_level": "medium",
  "summary": "Краткий итог в 2-3 предложения",
  "key_factors": ["фактор1", "фактор2", "фактор3"],
  "recommendations": [
    {
      "category": "workload",
      "priority": "high",
      "text": "Рекомендация",
      "action_items": ["конкретное действие 1", "конкретное действие 2"]
    }
  ],
  "suggested_actions": ["Действие 1", "Действие 2", "Действие 3"]
}

ТРЕБОВАНИЯ:
- Будь конкретным и практичным
- Учитывай KPI и должность сотрудника
- Учитывай комментарии сотрудника
- Пиши на русском языке
- Не используй общие фразы, дай ПЕРСОНАЛИЗИРОВАННЫЙ совет"""

    return prompt

def parse_ai_response(response_text: str) -> Optional[Dict]:
    """Парсит JSON-ответ от ИИ"""
    try:
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        return json.loads(response_text)
    except Exception as e:
        logger.error(f"Ошибка парсинга ответа ИИ: {e}")
        return None

def generate_burnout_recommendations(db: Session, user_id: int) -> schemas.BurnoutAnalysisResponse:
    """Генерирует персональные рекомендации по выгоранию"""
    logger.info(f"Генерация рекомендаций для пользователя {user_id}")
    
    # 1. Сбор данных
    user_data = collect_user_data(db, user_id)
    if not user_data:
        raise ValueError(f"Пользователь {user_id} не найден")
    
    if not user_data["burnout_tests"]:
        return schemas.BurnoutAnalysisResponse(
            user_id=user_id,
            analysis_date=datetime.now(timezone.utc),
            risk_level="low",
            summary="Недостаточно данных для анализа. Пройдите тест выгорания.",
            key_factors=[],
            recommendations=[],
            suggested_actions=["Пройдите тест выгорания"]
        )
    
    # 2. Формирование промпта
    prompt = build_analysis_prompt(user_data)
    
    # 3. Вызов ИИ
    try:
        response = client.chat(
            model=OLLAMA_ANALYSIS_MODEL,
            messages=[{"role": "user", "content": prompt}],
            stream=False
        )
        
        ai_content = response['message']['content']
        parsed_data = parse_ai_response(ai_content)
        
        if not parsed_data:
            raise ValueError("Не удалось разобрать ответ ИИ")
        
        # 4. Формирование ответа
        return schemas.BurnoutAnalysisResponse(
            user_id=user_id,
            analysis_date=datetime.now(timezone.utc),
            risk_level=parsed_data.get("risk_level", "medium"),
            summary=parsed_data.get("summary", "Анализ завершен"),
            key_factors=parsed_data.get("key_factors", []),
            recommendations=parsed_data.get("recommendations", []),
            suggested_actions=parsed_data.get("suggested_actions", [])
        )
        
    except Exception as e:
        logger.error(f"Ошибка при генерации рекомендаций: {e}")
        raise
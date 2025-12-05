from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse, HTMLResponse
from app.database import SessionLocal
from sqlalchemy.orm import Session
from typing import Generator, List, Dict, Optional
import json
import ollama
from ollama import Client
from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user
from app.logging_config import logger
from slowapi import Limiter
from slowapi.util import get_remote_address
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/ai", tags=["ai"])
limiter = Limiter(key_func=get_remote_address)

# Настройки Ollama из переменных окружения
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:4b")
client = Client(host=OLLAMA_HOST)

def get_burnout_prompt_context(score: Optional[int]) -> str:
    """Генерирует системный промпт на основе уровня выгорания пользователя"""
    if score is None:
        return "Пользователь без оценки стресса. Отвечайте в стандартном режиме."
    
    if 10 <= score <= 25:
        return "Пользователь в зеленой зоне (низкий стресс). Отвечайте профессионально и кратко."
    elif 26 <= score <= 40:
        return "Пользователь в желтой зоне (умеренный стресс). Будьте дружелюбны и поддерживающие."
    elif 41 <= score <= 55:
        return "Пользователь в оранжевой зоне (высокий стресс). Будьте максимально эмпатичны, мягки и поддерживающи. Избегайте критики, давайте только конструктивные советы."
    elif 56 <= score <= 60:
        return "КРИТИЧЕСКИЙ УРОВЕНЬ СТРЕССА! Вы — ментор по психологической поддержке. Будьте очень мягкими, заботливыми и позитивными. Только мотивирующие и поддерживающие сообщения."
    else:
        return "Пользователь без оценки стресса. Отвечайте в стандартном режиме."

def ollama_stream_generator(model: str, messages: List[Dict], burnout_score: Optional[int]) -> Generator[str, None, None]:
    """Генератор потокового ответа от Ollama с адаптивным промптом"""
    try:
        # Добавляем системное сообщение на основе burnout score
        system_context = get_burnout_prompt_context(burnout_score)
        enhanced_messages = [{"role": "system", "content": system_context}] + messages
        
        logger.info(f"Sending request to Ollama model '{model}' with {len(enhanced_messages)} messages")
        stream = client.chat(model=model, messages=enhanced_messages, stream=True)
        
        for chunk in stream:
            content = chunk['message']['content']
            yield f"data: {json.dumps({'content': content})}\n\n"
            
    except Exception as e:
        logger.error(f"Ollama streaming error: {str(e)}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
    finally:
        yield "data: [DONE]\n\n"

@router.post("/chat")
@limiter.limit("30/minute")
async def chat(
    request: Request,
    chat_request: schemas.ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Основной эндпоинт для чата с адаптивным ИИ на основе уровня выгорания.
    Возвращает потоковый ответ в формате Server-Sent Events.
    Если session_id не указан, использует последнюю сессию пользователя или создает новую.
    """
    logger.info(f"User {current_user.email_corporate} is starting chat session")
    
    # Получаем или создаем сессию чата
    if chat_request.session_id:
        session = db.query(models.ChatSessionBot).filter(
            models.ChatSessionBot.id == chat_request.session_id,
            models.ChatSessionBot.user_id == current_user.id
        ).first()
        
        if not session:
            logger.warning(f"Session {chat_request.session_id} not found for user {current_user.id}")
            raise HTTPException(status_code=404, detail="Session not found")
        
        logger.info(f"Continuing existing session {session.id}")
    
    else:
        # ИЩЕМ СУЩЕСТВУЮЩУЮ СЕССИЮ ПОЛЬЗОВАТЕЛЯ
        session = db.query(models.ChatSessionBot).filter(
            models.ChatSessionBot.user_id == current_user.id
        ).order_by(models.ChatSessionBot.created_at.desc()).first()
        
        if not session:
            # Создаем новую сессию, если не нашли существующую
            first_message_content = chat_request.messages[0].content if chat_request.messages else "New Chat"
            session = models.ChatSessionBot(
                user_id=current_user.id, 
                title=first_message_content[:50]
            )
            db.add(session)
            db.commit()
            db.refresh(session)
            logger.info(f"Created new session {session.id} for user {current_user.id}")
        else:
            logger.info(f"Using existing session {session.id} for user {current_user.id}")
    
    # Сохраняем сообщение пользователя в базу
    if chat_request.messages:
        user_message_content = chat_request.messages[-1].content
        user_message = models.ChatMessageBot(
            session_id=session.id,
            user_id=current_user.id,
            role="user",
            content=user_message_content
        )
        db.add(user_message)
        db.commit()
    
    # Получаем полную историю сообщений из сессии
    db_messages = db.query(models.ChatMessageBot).filter(
        models.ChatMessageBot.session_id == session.id
    ).order_by(models.ChatMessageBot.created_at).all()
    
    # Форматируем историю для Ollama
    message_history = [
        {"role": msg.role, "content": msg.content} 
        for msg in db_messages
    ]
    
    # Возвращаем потоковый ответ
    return StreamingResponse(
        ollama_stream_generator_with_save(
            chat_request.model, 
            message_history, 
            current_user.burn_out_score,
            session.id,
            current_user.id
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-ID": str(session.id)
        }
    )

@router.post("/sessions", response_model=schemas.ChatSessionBotInDB)
@limiter.limit("10/minute")
def create_session(
    request: Request,
    session_data: schemas.ChatSessionBotCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Создать новую чат-сессию"""
    session = models.ChatSessionBot(
        user_id=current_user.id,
        title=session_data.title
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info(f"User {current_user.id} created new session {session.id}")
    return session

@router.get("/sessions", response_model=List[schemas.ChatSessionBotInDB])
@limiter.limit("30/minute")
def get_user_sessions(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Получить все чат-сессии текущего пользователя"""
    sessions = db.query(models.ChatSessionBot).filter(
        models.ChatSessionBot.user_id == current_user.id
    ).order_by(models.ChatSessionBot.created_at.desc()).all()
    
    logger.info(f"User {current_user.id} requested {len(sessions)} chat sessions")
    return sessions

@router.get("/sessions/{session_id}", response_model=schemas.ChatSessionBotInDB)
@limiter.limit("30/minute")
def get_session(
    request: Request,
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Получить конкретную сессию с полной историей сообщений"""
    session = db.query(models.ChatSessionBot).filter(
        models.ChatSessionBot.id == session_id,
        models.ChatSessionBot.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return session

@router.patch("/sessions/{session_id}", response_model=schemas.ChatSessionBotInDB)
@limiter.limit("10/minute")
def update_session(
    request: Request,
    session_id: int,
    session_update: schemas.ChatSessionBotUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Обновить название сессии"""
    session = db.query(models.ChatSessionBot).filter(
        models.ChatSessionBot.id == session_id,
        models.ChatSessionBot.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session_update.title is not None:
        session.title = session_update.title
        db.commit()
        db.refresh(session)
        logger.info(f"User {current_user.id} updated session {session_id} title")
    
    return session

@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def delete_session(
    request: Request,
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Удалить сессию и все связанные сообщения"""
    session = db.query(models.ChatSessionBot).filter(
        models.ChatSessionBot.id == session_id,
        models.ChatSessionBot.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    db.delete(session)
    db.commit()
    
    logger.info(f"User {current_user.id} deleted session {session_id}")
    return None

@router.get("/sessions/{session_id}/messages", response_model=List[schemas.ChatMessageBotInDB])
@limiter.limit("30/minute")
def get_session_messages(
    request: Request,
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Получить сообщения из конкретной сессии (максимум 50)"""
    # Проверяем, что сессия принадлежит текущему пользователю
    session = db.query(models.ChatSessionBot).filter(
        models.ChatSessionBot.id == session_id,
        models.ChatSessionBot.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or access denied")
    
    # Получаем последние 50 сообщений в обратном порядке
    messages = db.query(models.ChatMessageBot).filter(
        models.ChatMessageBot.session_id == session_id
    ).order_by(models.ChatMessageBot.created_at.desc()).limit(50).all()
    
    # Возвращаем в хронологическом порядке (старые сначала)
    return list(reversed(messages))

@router.delete("/sessions/{session_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_message(
    request: Request,
    session_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Удалить конкретное сообщение из сессии"""
    # Проверяем, что сессия принадлежит текущему пользователю
    session = db.query(models.ChatSessionBot).filter(
        models.ChatSessionBot.id == session_id,
        models.ChatSessionBot.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or access denied")
    
    # Проверяем, что сообщение принадлежит этой сессии и пользователю
    message = db.query(models.ChatMessageBot).filter(
        models.ChatMessageBot.id == message_id,
        models.ChatMessageBot.session_id == session_id,
        models.ChatMessageBot.user_id == current_user.id
    ).first()
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found or access denied")
    
    db.delete(message)
    db.commit()
    
    logger.info(f"User {current_user.id} deleted message {message_id} from session {session_id}")
    return None

# Опциональный HTML интерфейс для тестирования
@router.get("/ui", response_class=HTMLResponse)
@limiter.limit("30/minute")
async def chat_ui(request: Request):
    """HTML интерфейс для тестирования чата (dev mode)"""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>AI Assistant с поддержкой выгорания</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
            #auth { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            #chat-container { display: none; }
            #session-select { margin-bottom: 10px; padding: 10px; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            #session-dropdown { width: 70%; padding: 8px; }
            #chat { background: white; height: 500px; overflow-y: auto; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 10px; }
            .message { margin: 15px 0; padding: 10px 15px; border-radius: 8px; max-width: 80%; word-wrap: break-word; }
            .user { background: #e3f2fd; margin-left: auto; text-align: right; }
            .assistant { background: #f5f5f5; }
            #input-area { display: flex; gap: 10px; margin-top: 10px; }
            input, button, select { padding: 12px; font-size: 16px; border: 1px solid #ccc; border-radius: 5px; }
            input { flex: 1; }
            button { background: #4CAF50; color: white; cursor: pointer; min-width: 100px; }
            button:hover { background: #45a049; }
            .login-btn { background: #2196F3; }
            .login-btn:hover { background: #0b7dda; }
            .disabled { opacity: 0.5; pointer-events: none; }
            .loading::after { content: '...'; animation: dots 1.5s infinite; }
            @keyframes dots { 0%, 20% { content: '.'; } 40% { content: '..'; } 60%, 100% { content: '...'; } }
            #user-info { position: absolute; top: 20px; right: 20px; background: white; padding: 10px; border-radius: 5px; }
            .session-item { padding: 5px; cursor: pointer; }
            .session-item:hover { background: #f0f0f0; }
            .timestamp { font-size: 11px; color: #666; margin-top: 5px; }
        </style>
    </head>
    <body>
        <div id="auth">
            <h2>🔐 Вход в AI Assistant</h2>
            <input type="email" id="email" placeholder="Корпоративный email">
            <input type="password" id="password" placeholder="Пароль">
            <button class="login-btn" onclick="login()">Войти</button>
        </div>
        
        <div id="chat-container">
            <h1>💬 AI Assistant (Адаптивная поддержка)</h1>
            <div id="user-info">Уровень стресса: <span id="burnout-level"></span></div>
            <div id="session-select">
                <select id="session-dropdown" onchange="switchSession()">
                    <option value="">Загрузка сессий...</option>
                </select>
                <button onclick="newSession()">Новый чат</button>
            </div>
            <div id="chat"></div>
            <div id="input-area">
                <input type="text" id="prompt" placeholder="Введите ваш вопрос..." onkeypress="handleKeyPress(event)">
                <button onclick="sendMessage()">Отправить</button>
            </div>
        </div>

        <script>
            let token = null;
            let currentSessionId = null;
            let sessions = [];
            
            async function login() {
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                
                const response = await fetch('/auth/token', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
                });
                
                if (response.ok) {
                    const data = await response.json();
                    token = data.access_token;
                    document.getElementById('auth').style.display = 'none';
                    document.getElementById('chat-container').style.display = 'block';
                    await loadUserInfo();
                    await loadSessions();
                } else {
                    alert('Ошибка авторизации');
                }
            }
            
            async function loadUserInfo() {
                const response = await fetch('/users/me', {
                    headers: {'Authorization': `Bearer ${token}`}
                });
                const user = await response.json();
                const level = getBurnoutLevel(user.burn_out_score);
                document.getElementById('burnout-level').textContent = level;
            }
            
            function getBurnoutLevel(score) {
                if (!score) return '⚪ Нет данных';
                if (score <= 25) return '🟢 Низкий';
                if (score <= 40) return '🟡 Умеренный';
                if (score <= 55) return '🟠 Высокий';
                return '🔴 Критический';
            }
            
            async function loadSessions() {
                const response = await fetch('/ai/sessions', {
                    headers: {'Authorization': `Bearer ${token}`}
                });
                if (response.ok) {
                    sessions = await response.json();
                    const dropdown = document.getElementById('session-dropdown');
                    dropdown.innerHTML = '';
                    
                    if (sessions.length > 0) {
                        sessions.forEach(session => {
                            const option = document.createElement('option');
                            option.value = session.id;
                            option.textContent = session.title || `Чат #${session.id} (${new Date(session.created_at).toLocaleDateString()})`;
                            dropdown.appendChild(option);
                        });
                        // Автоматически загружаем последнюю сессию
                        currentSessionId = sessions[0].id;
                        dropdown.value = currentSessionId;
                        await loadSessionMessages(currentSessionId);
                    } else {
                        dropdown.innerHTML = '<option value="">Нет сессий</option>';
                    }
                }
            }
            
            async function loadSessionMessages(sessionId) {
                if (!sessionId) return;
                
                const response = await fetch(`/ai/sessions/${sessionId}/messages`, {
                    headers: {'Authorization': `Bearer ${token}`}
                });
                
                if (response.ok) {
                    const messages = await response.json();
                    const chat = document.getElementById('chat');
                    chat.innerHTML = ''; // Очищаем чат
                    
                    messages.forEach(msg => {
                        addMessageToChat(msg.role, msg.content, false);
                    });
                    
                    chat.scrollTop = chat.scrollHeight;
                }
            }
            
            function switchSession() {
                const dropdown = document.getElementById('session-dropdown');
                currentSessionId = dropdown.value ? parseInt(dropdown.value) : null;
                loadSessionMessages(currentSessionId);
            }
            
            async function newSession() {
                currentSessionId = null;
                document.getElementById('chat').innerHTML = '';
                await loadSessions();
            }
            
            async function sendMessage() {
                const input = document.getElementById('prompt');
                const prompt = input.value.trim();
                if (!prompt) return;
                
                addMessageToChat('user', prompt, true);
                input.value = '';
                input.disabled = true;
                
                const messageData = {
                    model: '""" + OLLAMA_MODEL + """',
                    messages: [{role: 'user', content: prompt}],
                    session_id: currentSessionId
                };
                
                const response = await fetch('/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(messageData)
                });
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let assistantMessage = '';
                const assistantDiv = addMessageToChat('assistant', '', true);
                
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') break;
                            
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.content) {
                                    assistantMessage += parsed.content;
                                    assistantDiv.textContent = assistantMessage;
                                    document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight;
                                }
                            } catch (e) {}
                        }
                    }
                }
                
                // Обновляем session_id, если это была новая сессия
                if (!currentSessionId && response.headers.get('X-Session-ID')) {
                    currentSessionId = parseInt(response.headers.get('X-Session-ID'));
                    await loadSessions(); // Перезагружаем список сессий
                }
                
                input.disabled = false;
                input.focus();
            }
            
            function addMessageToChat(role, content, saveToHistory = false) {
                const chat = document.getElementById('chat');
                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${role}`;
                messageDiv.textContent = content;
                chat.appendChild(messageDiv);
                
                if (saveToHistory) {
                    // История сохраняется на сервере, здесь только отображаем
                }
                
                chat.scrollTop = chat.scrollHeight;
                return messageDiv;
            }
            
            function handleKeyPress(event) {
                if (event.key === 'Enter') sendMessage();
            }
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


def save_assistant_message(session_id: int, user_id: int, content: str):
    """Сохраняет сообщение ассистента в базу данных"""
    try:
        # Создаем новую сессию БД для этого потока
        db = SessionLocal()
        assistant_message = models.ChatMessageBot(
            session_id=session_id,
            user_id=user_id,
            role="assistant",
            content=content
        )
        db.add(assistant_message)
        db.commit()
        db.close()
        logger.info(f"Saved assistant message to session {session_id}")
    except Exception as e:
        logger.error(f"Error saving assistant message: {e}")

def ollama_stream_generator_with_save(model: str, messages: List[Dict], burnout_score: Optional[int], session_id: int, user_id: int) -> Generator[str, None, None]:
    """Генератор потокового ответа от Ollama с адаптивным промптом и сохранением в БД"""
    assistant_response = ""
    try:
        # Добавляем системное сообщение на основе burnout score
        system_context = get_burnout_prompt_context(burnout_score)
        enhanced_messages = [{"role": "system", "content": system_context}] + messages
        
        logger.info(f"Sending request to Ollama model '{model}' with {len(enhanced_messages)} messages")
        stream = client.chat(model=model, messages=enhanced_messages, stream=True)
        
        for chunk in stream:
            content = chunk['message']['content']
            assistant_response += content
            yield f"data: {json.dumps({'content': content})}\n\n"
            
    except Exception as e:
        logger.error(f"Ollama streaming error: {str(e)}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
    finally:
        # Сохраняем ответ ассистента в базу данных
        if assistant_response:
            save_assistant_message(session_id, user_id, assistant_response)
        yield "data: [DONE]\n\n"
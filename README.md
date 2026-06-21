# bart

## Echat - Telegram Clone (Django + WebSockets)

Echat is a real-time messaging application designed to look and feel like Telegram. It is built using Python, Django, and Django Channels (supporting ASGI and live WebSocket communication).

### Features
1. **Real-time Messaging**: Powered by WebSockets (no page reloads).
2. **Direct Messages (DMs)**: Chat one-on-one with any registered user.
3. **Saved Messages**: Keep a personal notes space (chatting with yourself).
4. **Group Channels**: Create rooms with multiple members.
5. **Contacts / Friends System**: Add other users by their exact username, view your contacts list, and start chats instantly.
6. **Typing Indicators**: Real-time notifications when a user is typing.
7. **Read Receipts**: Message ticks turn green when read.
8. **Responsive UI**: Sleek glassmorphic dark theme built using vanilla CSS and JavaScript, supporting both desktop and mobile slide-out viewports.

---

## Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone <repository_url>
   cd bart
   ```
2. **Set up virtual environment**:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate  # Windows
   source .venv/bin/activate  # macOS/Linux
   ```
3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
4. **Run migrations**:
   ```bash
   python manage.py migrate
   ```
5. **Start server**:
   ```bash
   python manage.py runserver
   ```
   Open `http://127.0.0.1:8000/` in your browser.

---

## Render Deployment Settings

When deploying this project to **Render**, use the following configuration:

- **Service Type**: Web Service
- **Environment**: Python
- **Build Command**: 
  ```bash
  pip install -r requirements.txt && python manage.py migrate && python manage.py collectstatic --no-input
  ```
- **Start Command**:
  ```bash
  daphne echat_project.asgi:application --port $PORT --bind 0.0.0.0
  ```

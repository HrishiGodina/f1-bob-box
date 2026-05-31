#!/bin/bash

# F1 Dashboard Management Script

FRONTEND_DIR="./frontend"
BACKEND_DIR="./backend"
BACKEND_PID_FILE=".backend.pid"
FRONTEND_PID_FILE=".frontend.pid"

start() {
    echo "Starting F1 Dashboard..."

    # Start Backend
    if [ -d "$BACKEND_DIR/venv" ]; then
        echo "Starting Backend (FastAPI)..."
        "$BACKEND_DIR/venv/bin/python" "$BACKEND_DIR/main.py" > backend.log 2>&1 &
        echo $! > $BACKEND_PID_FILE
        echo "Backend started with PID $(cat $BACKEND_PID_FILE)"
    else
        echo "Error: Backend virtual environment not found. Please run installation steps first."
    fi

    # Start Frontend
    if [ -d "$FRONTEND_DIR/node_modules" ]; then
        echo "Starting Frontend (Vite)..."
        npm run dev --prefix "$FRONTEND_DIR" > frontend.log 2>&1 &
        echo $! > $FRONTEND_PID_FILE
        echo "Frontend started with PID $(cat $FRONTEND_PID_FILE)"
    else
        echo "Error: Frontend node_modules not found. Please run npm install first."
    fi

    echo "------------------------------------------------"
    echo "F1 Dashboard is running!"
    echo "Frontend: http://localhost:5173"
    echo "Backend API: http://localhost:8000"
    echo "------------------------------------------------"
    echo "Logs are available in backend.log and frontend.log"
}

stop() {
    echo "Stopping F1 Dashboard..."

    if [ -f $BACKEND_PID_FILE ]; then
        PID=$(cat $BACKEND_PID_FILE)
        echo "Stopping Backend (PID $PID)..."
        kill $PID 2>/dev/null
        rm $BACKEND_PID_FILE
    fi

    if [ -f $FRONTEND_PID_FILE ]; then
        PID=$(cat $FRONTEND_PID_FILE)
        echo "Stopping Frontend (PID $PID)..."
        kill $PID 2>/dev/null
        rm $FRONTEND_PID_FILE
    fi

    # Cleanup any remaining f1-dashboard processes
    pkill -f "f1-dashboard/backend/main.py" 2>/dev/null
    pkill -f "f1-dashboard/frontend" 2>/dev/null

    echo "Dashboard stopped."
}

case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        stop
        sleep 2
        start
        ;;
    *)
        echo "Usage: $0 {start|stop|restart}"
        exit 1
esac

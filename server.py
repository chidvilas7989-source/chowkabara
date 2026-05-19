import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from room_manager import RoomManager
from dotenv import load_dotenv
import os
import json

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'chowkabara_secret_key_123'
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='eventlet')

room_manager = RoomManager()

# Load Firebase Config from env
firebase_config = {
    "apiKey": os.getenv("FIREBASE_API_KEY", ""),
    "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
    "projectId": os.getenv("FIREBASE_PROJECT_ID", ""),
    "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", ""),
    "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID", ""),
    "appId": os.getenv("FIREBASE_APP_ID", "")
}

@app.route('/')
def index():
    return render_template('index.html', firebase_config=json.dumps(firebase_config))

# Socket.IO Events

@socketio.on('connect')
def on_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def on_disconnect():
    print(f"Client disconnected: {request.sid}")
    room_id, room = room_manager.mark_offline(request.sid)
    if room_id:
        emit('player_offline', {'room': room}, room=room_id)

@socketio.on('rejoin_room')
def on_rejoin_room(data):
    uid = data.get('uid')
    if not uid: return
    
    room = room_manager.rejoin_room(uid, request.sid)
    if room:
        join_room(room['id'])
        emit('room_joined', {'room': room, 'rejoined': True}, to=request.sid)
        emit('player_rejoined', {'room': room}, room=room['id'])
    else:
        emit('rejoin_failed', to=request.sid)

@socketio.on('create_room')
def on_create_room(data):
    name = data.get('name', 'Player')
    uid = data.get('uid')
    color = data.get('color', 'blue')
    if not uid:
        emit('error', {'message': 'Not authenticated'})
        return
        
    room_id = room_manager.create_room(name, request.sid, uid, color)
    join_room(room_id)
    room = room_manager.get_room(room_id)
    emit('room_created', {'room': room})

@socketio.on('join_room')
def on_join_room(data):
    name = data.get('name', 'Player')
    uid = data.get('uid')
    room_id = data.get('room_id')
    color = data.get('color', 'red')
    
    if not uid or not room_id:
        emit('error', {'message': 'Invalid input'})
        return
        
    room, error = room_manager.join_room(room_id.upper(), name, request.sid, uid, color)
    if error:
        emit('error', {'message': error})
    else:
        join_room(room_id.upper())
        emit('room_joined', {'room': room}, to=request.sid)
        emit('player_joined', {'room': room}, room=room_id.upper())

@socketio.on('start_game')
def on_start_game(data):
    room_id = data.get('room_id')
    if room_manager.start_game(room_id):
        room = room_manager.get_room(room_id)
        emit('game_started', {'room': room}, room=room_id)
    else:
        emit('error', {'message': 'Need at least 2 players to start'})

@socketio.on('sync_game_state')
def on_sync_game_state(data):
    room_id = data.get('room_id')
    new_state = data.get('gameState')
    room = room_manager.update_game_state(room_id, new_state)
    if room:
        # Broadcast to everyone else in the room
        emit('game_state_updated', {'gameState': new_state}, room=room_id, include_self=False)

@socketio.on('leave_room')
def on_leave_room(data):
    uid = data.get('uid')
    room_id, room = room_manager.leave_room_completely(uid)
    if room_id:
        leave_room(room_id)
        emit('player_left', {'room': room}, room=room_id)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print("=" * 50)
    print(f"  Chowkabara Game Server")
    print(f"  Running on http://0.0.0.0:{port}")
    print("=" * 50)
    socketio.run(app, host='0.0.0.0', port=port, debug=False)

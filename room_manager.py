import random
import string
import json
import os

DATA_FILE = 'rooms_data.json'

def _gen_room_id(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

class RoomManager:
    def __init__(self):
        self.rooms = {}
        # Start from scratch when server opens: clear data file
        self.save_data()

    def load_data(self):
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, 'r') as f:
                    self.rooms = json.load(f)
            except:
                self.rooms = {}

    def save_data(self):
        with open(DATA_FILE, 'w') as f:
            json.dump(self.rooms, f)

    def get_room(self, room_id):
        return self.rooms.get(room_id)

    def create_room(self, creator_name, creator_sid, creator_uid, color='blue'):
        room_id = _gen_room_id()
        while room_id in self.rooms:
            room_id = _gen_room_id()
            
        valid_colors = ['blue', 'red', 'green', 'yellow']
        if color not in valid_colors:
            color = 'blue'
            
        self.rooms[room_id] = {
            'id': room_id,
            'players': [
                {'uid': creator_uid, 'sid': creator_sid, 'name': creator_name, 'color': color, 'online': True}
            ],
            'status': 'waiting',
            'gameState': self._init_game_state()
        }
        self.save_data()
        return room_id

    def join_room(self, room_id, player_name, sid, uid, preferred_color='red'):
        room = self.rooms.get(room_id)
        if not room:
            return None, "Room not found."
            
        if room['status'] != 'waiting':
            return None, "Game already started."
            
        if len(room['players']) >= 4:
            return None, "Room is full."

        taken_colors = [p['color'] for p in room['players']]
        colors = ['blue', 'red', 'green', 'yellow']
        
        assigned_color = preferred_color
        if assigned_color not in colors or assigned_color in taken_colors:
            for c in colors:
                if c not in taken_colors:
                    assigned_color = c
                    break
        
        room['players'].append({
            'uid': uid,
            'sid': sid,
            'name': player_name,
            'color': assigned_color,
            'online': True
        })
        
        self.save_data()
        return room, None

    def rejoin_room(self, uid, sid):
        for room_id, room in self.rooms.items():
            for p in room['players']:
                if p['uid'] == uid:
                    p['sid'] = sid
                    p['online'] = True
                    self.save_data()
                    return room
        return None

    def leave_room_completely(self, uid):
        for room_id, room in self.rooms.items():
            for i, p in enumerate(room['players']):
                if p['uid'] == uid:
                    left_player = room['players'].pop(i)
                    if room['status'] == 'playing':
                        if len(room['players']) < 2:
                            del self.rooms[room_id]
                            self.save_data()
                            return room_id, None, left_player
                        else:
                            if 'gameState' in room and 'turnOrder' in room['gameState']:
                                to = room['gameState']['turnOrder']
                                c_idx = room['gameState']['currentPlayerIndex']
                                if len(to) > c_idx:
                                    current_color = to[c_idx]
                                else:
                                    current_color = to[0]
                                if left_player['color'] in to:
                                    to.remove(left_player['color'])
                                    for t in room['gameState']['tokens'][left_player['color']]:
                                        t['finished'] = True
                                if current_color in to:
                                    room['gameState']['currentPlayerIndex'] = to.index(current_color)
                                else:
                                    room['gameState']['currentPlayerIndex'] = 0
                    self.save_data()
                    return room_id, room, left_player
        return None, None, None

    def mark_offline(self, sid):
        for room_id, room in self.rooms.items():
            for p in room['players']:
                if p['sid'] == sid:
                    p['online'] = False
                    self.save_data()
                    return room_id, room
        return None, None

    def start_game(self, room_id):
        room = self.rooms.get(room_id)
        if room and len(room['players']) >= 2:
            room['status'] = 'playing'
            
            # Determine turn order starting with the creator
            creator = room['players'][0]
            creator_color = creator['color']
            
            active_colors = [p['color'] for p in room['players']]
            
            # Clockwise order: Yellow -> Blue -> Red -> Green
            clockwise = ['yellow', 'blue', 'red', 'green']
            
            # Find creator's index in clockwise list
            if creator_color in clockwise:
                idx = clockwise.index(creator_color)
                # Rotate clockwise so creator is first
                rotated = clockwise[idx:] + clockwise[:idx]
            else:
                rotated = clockwise
                
            # Filter to keep only the active colors
            turn_order = [color for color in rotated if color in active_colors]
            
            room['gameState']['turnOrder'] = turn_order
            room['gameState']['currentPlayerIndex'] = 0
            
            self.save_data()
            return True
        return False

    def _init_game_state(self):
        tokens = {}
        for color in ['blue', 'red', 'green', 'yellow']:
            tokens[color] = [{'layer': 'home', 'index': -1, 'hasKilled': False, 'finished': False} for _ in range(6)]
            
        return {
            'currentPlayerIndex': 0,
            'turnOrder': ['blue', 'red', 'green', 'yellow'],
            'tokens': tokens,
            'currentRoll': None,
            'hasRolled': False,
            'extraTurn': False,
            'winner': None,
            'playerHasKilled': { 'blue': False, 'red': False, 'green': False, 'yellow': False }
        }

    def update_game_state(self, room_id, new_state):
        room = self.rooms.get(room_id)
        if room:
            room['gameState'] = new_state
            self.save_data()
            return room
        return None

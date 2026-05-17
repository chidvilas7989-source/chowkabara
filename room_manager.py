import random
import string

def _gen_room_id(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

class RoomManager:
    def __init__(self):
        self.rooms = {}

    def get_room(self, room_id):
        return self.rooms.get(room_id)

    def create_room(self, creator_name, creator_sid, creator_uid):
        room_id = _gen_room_id()
        while room_id in self.rooms:
            room_id = _gen_room_id()
            
        self.rooms[room_id] = {
            'id': room_id,
            'players': [
                {'uid': creator_uid, 'sid': creator_sid, 'name': creator_name, 'color': 'blue', 'online': True}
            ],
            'status': 'waiting',
            'gameState': self._init_game_state()
        }
        return room_id

    def join_room(self, room_id, player_name, sid, uid):
        room = self.rooms.get(room_id)
        if not room:
            return None, "Room not found."
            
        if room['status'] != 'waiting':
            return None, "Game already started."
            
        if len(room['players']) >= 4:
            return None, "Room is full."

        colors = ['blue', 'red', 'green', 'yellow']
        assigned_color = colors[len(room['players'])]
        
        room['players'].append({
            'uid': uid,
            'sid': sid,
            'name': player_name,
            'color': assigned_color,
            'online': True
        })
        
        return room, None

    def rejoin_room(self, uid, sid):
        for room_id, room in self.rooms.items():
            for p in room['players']:
                if p['uid'] == uid:
                    p['sid'] = sid
                    p['online'] = True
                    return room
        return None

    def leave_room_completely(self, uid):
        for room_id, room in self.rooms.items():
            for i, p in enumerate(room['players']):
                if p['uid'] == uid:
                    room['players'].pop(i)
                    return room_id, room
        return None, None

    def mark_offline(self, sid):
        for room_id, room in self.rooms.items():
            for p in room['players']:
                if p['sid'] == sid:
                    p['online'] = False
                    return room_id, room
        return None, None

    def start_game(self, room_id):
        room = self.rooms.get(room_id)
        if room and len(room['players']) >= 2:
            room['status'] = 'playing'
            return True
        return False

    def _init_game_state(self):
        tokens = {}
        for color in ['blue', 'red', 'green', 'yellow']:
            tokens[color] = [{'layer': 'home', 'index': -1, 'hasKilled': False, 'finished': False} for _ in range(6)]
            
        return {
            'currentPlayerIndex': 0,
            'tokens': tokens,
            'currentRoll': None,
            'hasRolled': False,
            'extraTurn': False,
            'winner': None
        }

    def update_game_state(self, room_id, new_state):
        room = self.rooms.get(room_id)
        if room:
            room['gameState'] = new_state
            return room
        return None

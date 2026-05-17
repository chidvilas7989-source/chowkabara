from flask import Flask, send_from_directory
import os

# Initialize Flask app
# Serving static files from the current directory
app = Flask(__name__, static_folder='.', static_url_path='')

@app.route('/')
def index():
    """Route to serve the main game HTML file."""
    return send_from_directory('.', 'index.html')

@app.route('/api/status')
def status():
    """A sample API route for potential future backend game state management."""
    return {"status": "Backend is running", "game": "Chowkabara"}

if __name__ == '__main__':
    print("Starting Chowkabara Game Server...")
    print("Running on http://localhost:5000")
    app.run(debug=True, port=5000)

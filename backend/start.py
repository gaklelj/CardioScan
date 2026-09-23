"""
Entry point for PyInstaller-bundled backend.
Sets MODEL_PATH to the bundled resources directory.
"""
import sys
import os

# When frozen by PyInstaller, _MEIPASS contains the temp extraction dir
if getattr(sys, 'frozen', False):
    base = sys._MEIPASS
    os.environ.setdefault('MODEL_DIR', os.path.join(base, 'model'))
else:
    base = os.path.dirname(os.path.abspath(__file__))
    os.environ.setdefault('MODEL_DIR', os.path.join(base, 'model'))

# Import and run the app
from app import socketio, app
socketio.run(app, host='127.0.0.1', port=6767, allow_unsafe_werkzeug=True)

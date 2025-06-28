# Browser TTS

A high-quality Text-to-Speech (TTS) system that allows you to select text on any webpage and have it read aloud using a local TTS model. The project consists of a FastAPI backend server using the Kokoro TTS model and a Firefox browser extension for seamless web integration.

## Features

- 🔊 **High-Quality Speech**: Uses the Kokoro TTS model for natural-sounding speech synthesis
- 🌐 **Browser Integration**: Firefox extension allows reading text directly from web pages
- ⚡ **Speed Control**: Adjustable speech speed and additional speed boost without pitch distortion
- 🎯 **Text Highlighting**: Visual highlighting of text as it's being read
- 🔄 **Real-time Processing**: Instant audio generation from selected text
- 🎛️ **Customizable Settings**: Voice selection, speed controls, and keyboard shortcuts
- 🔒 **Privacy-First**: All processing happens locally on your machine

## Architecture

```
┌──────────────────┐    HTTP API    ┌────────────────────┐
│ Firefox          │◄──────────────►│ FastAPI Server     │
│ Extension        │                │ (Python)           │
│                  │                │                    │
│ • Text Selection │                │ • Kokoro TTS       │
│ • Audio Playback │                │ • Audio Processing │
│ • UI Controls    │                │ • Speed Control    │
└──────────────────┘                └────────────────────┘
```

## Installation

### 1. Set Up the TTS Server

```bash
# Clone the repository
git clone https://github.com/your-username/local-browser-tts.git
cd browser-tts

# Install and run with uv
uv run main.py
```


The server will start on `http://localhost:9942`. You can verify it's running by visiting the `/docs` endpoint for the interactive API documentation.

### 2. Install the Firefox Extension

#### Option A: From Release (Recommended)

1. Go to the [Releases page](https://github.com/hex2f/local-browser-tts/releases)
2. Download the latest `local-tts-reader-firefox-v*.xpi` file
3. Drag and drop the XPI file onto your Firefox window to install

#### Option B: Developer Installation

1. Open Firefox and go to `about:debugging`
2. Click "This Firefox" in the sidebar
3. Click "Load Temporary Add-on"
4. Navigate to `extensions/firefox/` and select `manifest.json`

### 3. Set Up Automatic Server Startup (Optional)

To automatically start the TTS server on system boot using systemd:

#### Create a systemd service file

```bash
sudo nano /etc/systemd/system/local-browser-tts.service
```

Add the following content (adjust paths as needed):

```ini
[Unit]
Description=Browser TTS Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/local-browser-tts
ExecStart=/usr/bin/uv run main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### Enable and start the service

```bash
# Reload systemd to recognize the new service
sudo systemctl daemon-reload

# Enable the service to start on boot
sudo systemctl enable browser-tts.service

# Start the service now
sudo systemctl start browser-tts.service

# Check service status
sudo systemctl status browser-tts.service
```

#### Managing the service

```bash
# Stop the service
sudo systemctl stop browser-tts.service

# Restart the service
sudo systemctl restart browser-tts.service

# View logs
sudo journalctl -u browser-tts.service -f
```

**Note**: Replace `/path/to/local-browser-tts` with the actual path to your project directory and `your-username` with your actual username.

## Usage

### Quick Start

1. **Start the TTS server**: Run `python main.py` or `uv run main.py`
2. **Configure the extension**: Click the extension icon and set the server URL to `http://localhost:9942`
3. **Read text**: Select any text on a webpage and click the "🔊" button that appears, or use the keyboard shortcut

### Extension Features

- **Text Selection**: Select any text on a webpage
- **Floating Button**: A "🔊" button appears near selected text
- **Keyboard Shortcuts**: Customizable hotkeys for quick access
- **Settings Panel**: Click the extension icon to access configuration options
- **Real-time Highlighting**: Text is highlighted as it's being read

### API Usage

You can also use the TTS server directly via HTTP requests:

```bash
curl -X POST "http://localhost:9942/generate-audio" \
     -H "Content-Type: application/json" \
     -d '{
       "text": "Hello, this is a test of the TTS system.",
       "voice": "af_heart",
       "speed": 1.2,
       "speed_boost": 1.5
     }' \
     --output audio.wav
```

### Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| **Speed** | Base speech speed multiplier | 1.2x |
| **Speed Boost** | Additional speed boost (WSOLA algorithm) | 1.5x |
| **Voice** | TTS voice selection | af_heart |
| **Auto-highlight** | Highlight text while reading | Enabled |
| **Skip Duplicates** | Skip already-read text in session | Enabled |
| **Floating Button** | Show read button on text selection | Enabled |

## API Reference

### Endpoints

#### `POST /generate-audio`

Generate audio from text.

**Request Body:**
```json
{
  "text": "Text to convert to speech",
  "voice": "af_heart",
  "speed": 1.2,
  "speed_boost": 1.0
}
```

**Response:** Audio file (WAV format)

#### `GET /health`

Check server health status.

**Response:**
```json
{
  "status": "ok"
}
```

## Development

### Building the Extension

```bash
cd extensions/firefox
npm install -g web-ext
web-ext build
```

### Running in Development Mode

```bash
# Terminal 1: Start the TTS server
uv run main.py

# Terminal 2: Test the extension
cd extensions/firefox
web-ext run
```

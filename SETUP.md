# Speech-to-Text Integration Setup

## Overview
This project integrates two speech-to-text providers (AssemblyAI and Deepgram) into the Electron desktop app. The Python FastAPI server has been converted to a Node.js implementation.

## Setup Instructions

### 1. Create .env File
Create a `.env` file in the root directory with your API keys:

```
DEEPGRAM_API_KEY=your_deepgram_api_key_here
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
```

**Note:** The API keys from `speech-to-text/main.py` are:
- DEEPGRAM_API_KEY: `dd69a41e7ec17756d15a1867c9f0718253ee0a31`
- ASSEMBLYAI_API_KEY: `84eca8f0692b4390885f26d2e0ff73c5`

### 2. Install Dependencies
```bash
npm install
```

This will install:
- `ws` - WebSocket library
- `websocket` - WebSocket client for connecting to ASR services
- `express` - HTTP server
- `dotenv` - Environment variable management

### 3. Run the Application
```bash
npm run dev
```

This will:
1. Start the React development server (port 3000)
2. Start the ASR server (port 8000)
3. Launch the Electron app

## Architecture

### ASR Server (`asr-server.js`)
- Runs on port 8000
- Provides WebSocket endpoints:
  - `ws://localhost:8000/ws/assemblyai` - AssemblyAI transcription
  - `ws://localhost:8000/ws/deepgram` - Deepgram transcription
- Forwards audio data from the Electron app to the respective ASR providers
- Returns transcriptions in real-time

### Electron App (`main.js`)
- Automatically starts the ASR server when the app launches
- Handles Mac microphone permissions
- Manages the lifecycle of the ASR server process

### React App (`src/App.js`)
- Connects to both WebSocket endpoints simultaneously
- Captures audio from the microphone (16kHz, mono, PCM16)
- Streams audio to both ASR providers
- Displays transcriptions from both providers in real-time

## Mac Microphone Permissions

On macOS, the app will automatically request microphone permissions when launched. If permissions are denied:

1. Go to **System Preferences** > **Security & Privacy** > **Privacy** > **Microphone**
2. Enable the checkbox for your Electron app
3. Restart the app

## Audio Format

The app captures audio with the following specifications:
- Sample Rate: 16kHz
- Channels: Mono (1 channel)
- Format: PCM16 (16-bit signed integers)
- Audio Processing: Echo cancellation, noise suppression, auto gain control

## Troubleshooting

### WebSocket Connection Errors
- Ensure the ASR server is running on port 8000
- Check that the `.env` file exists with valid API keys
- Verify firewall settings allow connections to localhost:8000

### Microphone Not Working
- Check System Preferences > Security & Privacy > Privacy > Microphone
- Ensure the app has microphone permissions
- Try restarting the app after granting permissions

### No Transcriptions
- Check browser console for WebSocket errors
- Verify API keys are correct in `.env`
- Check ASR server logs for connection issues


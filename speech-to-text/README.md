# ASR API - Real-time Speech Recognition

A Python API server that provides real-time speech recognition using AssemblyAI and Deepgram.

## Features

- ✅ Two ASR providers: AssemblyAI & Deepgram
- ✅ WebSocket-based real-time streaming
- ✅ Browser test interface
- ✅ Python test script for local testing
- ✅ Support for both interim and final transcripts

## Prerequisites

- Python 3.8+
- Microphone access
- API keys for:
  - AssemblyAI: https://www.assemblyai.com/
  - Deepgram: https://deepgram.com/

## Installation

### 1. Clone or create project directory

```bash
mkdir asr-api
cd asr-api
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

**Note for PyAudio:** If you encounter issues installing PyAudio:

- **Windows:** Download wheel from https://www.lfd.uci.edu/~gohlke/pythonlibs/#pyaudio
- **macOS:** `brew install portaudio && pip install pyaudio`
- **Linux:** `sudo apt-get install portaudio19-dev python3-pyaudio`

### 3. Configure API Keys

Edit `main.py` and add your API keys:

```python
ASSEMBLYAI_API_KEY = "your-assemblyai-key-here"
DEEPGRAM_API_KEY = "your-deepgram-key-here"
```

## Usage

### Start the API Server

```bash
python main.py
```

The server will start on `http://localhost:8000`

### Test in Browser

1. Open your browser and go to: `http://localhost:8000/test`
2. Select provider (AssemblyAI or Deepgram)
3. Click "Start Recording" and allow microphone access
4. Speak into your microphone
5. See real-time transcripts appear
6. Click "Stop Recording" when done

### Test with Python Script

```bash
# Test AssemblyAI (default)
python test_asr.py

# Test Deepgram
python test_asr.py deepgram

# Test both providers sequentially
python test_asr.py both
```

Press `Ctrl+C` to stop recording.

## API Endpoints

### WebSocket Endpoints

- `ws://localhost:8000/ws/assemblyai` - AssemblyAI streaming
- `ws://localhost:8000/ws/deepgram` - Deepgram streaming

### HTTP Endpoints

- `GET /` - API information
- `GET /test` - Browser test interface

## WebSocket Protocol

### Sending Audio

Send raw PCM16 audio data as binary messages:
- Sample rate: 16000 Hz
- Channels: 1 (mono)
- Format: 16-bit PCM (little-endian)

### Receiving Transcripts

**AssemblyAI Format:**
```json
{
  "type": "Turn",
  "transcript": "Hello world",
  "turn_is_formatted": true
}
```

**Deepgram Format:**
```json
{
  "type": "transcript",
  "text": "Hello world",
  "is_final": true
}
```

### Terminating Session

Send JSON message:
```json
{
  "type": "terminate"
}
```

## Project Structure

```
asr-api/
├── main.py              # FastAPI server
├── test_asr.py          # Local test script
├── requirements.txt     # Python dependencies
└── README.md           # This file
```

## Troubleshooting

### Microphone not working
- Check browser permissions (allow microphone access)
- Check system microphone settings
- Try different browser (Chrome/Edge recommended)

### WebSocket connection fails
- Ensure server is running
- Check firewall settings
- Verify API keys are correct

### No transcripts appearing
- Check console for errors (F12 in browser)
- Verify microphone is capturing audio
- Check API key validity and quota

### PyAudio installation fails
- See Prerequisites section for platform-specific instructions
- Consider using conda: `conda install pyaudio`

## Performance Tips

1. **Network:** Use wired connection for best results
2. **Audio Quality:** Use good quality microphone
3. **Environment:** Minimize background noise
4. **Browser:** Chrome/Edge have best WebAudio support

## Customization

### Change Audio Settings

Edit in `main.py`:
```python
ASSEMBLYAI_PARAMS = {
    "sample_rate": 16000,  # Change sample rate
    "format_turns": True,  # Enable/disable formatting
}
```

### Add More Providers

Add new methods to `ASRManager` class following the pattern of existing providers.

## License

MIT License - feel free to use for any purpose.

## Support

For issues with:
- **AssemblyAI:** https://www.assemblyai.com/docs
- **Deepgram:** https://developers.deepgram.com/docs
- **FastAPI:** https://fastapi.tiangolo.com/

## Notes

- Both services require active API keys with sufficient credits
- AssemblyAI uses turn-based transcription
- Deepgram provides continuous streaming transcription
- Internet connection required for API access
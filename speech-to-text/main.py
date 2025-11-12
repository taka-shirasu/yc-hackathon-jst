from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import asyncio
import json
import websockets
from typing import Optional
import base64
from deepgram import DeepgramClient
from deepgram.core.events import EventType
from urllib.parse import urlencode

app = FastAPI(title="ASR API Server")

# Enable CORS for browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
DEEPGRAM_API_KEY="dd69a41e7ec17756d15a1867c9f0718253ee0a31"
ASSEMBLYAI_API_KEY="84eca8f0692b4390885f26d2e0ff73c5"

# AssemblyAI Configuration
ASSEMBLYAI_PARAMS = {
    "sample_rate": 16000,
    "format_turns": True,
}
ASSEMBLYAI_ENDPOINT = f"wss://streaming.assemblyai.com/v3/ws?{urlencode(ASSEMBLYAI_PARAMS)}"


class ASRManager:
    """Manages ASR connections for different providers"""
    
    @staticmethod
    async def handle_assemblyai(websocket: WebSocket):
        """Handle AssemblyAI streaming"""
        await websocket.accept()
        assemblyai_ws = None
        
        try:
            # Connect to AssemblyAI
            assemblyai_ws = await websockets.connect(
                ASSEMBLYAI_ENDPOINT,
                extra_headers={"Authorization": ASSEMBLYAI_API_KEY}
            )
            
            await websocket.send_json({
                "type": "status",
                "message": "Connected to AssemblyAI"
            })
            
            # Create tasks for bidirectional communication
            async def receive_from_client():
                try:
                    while True:
                        # Receive audio data from browser
                        data = await websocket.receive()
                        
                        if "bytes" in data:
                            # Forward audio to AssemblyAI
                            await assemblyai_ws.send(data["bytes"])
                        elif "text" in data:
                            msg = json.loads(data["text"])
                            if msg.get("type") == "terminate":
                                await assemblyai_ws.send(json.dumps({"type": "Terminate"}))
                                break
                except WebSocketDisconnect:
                    pass
            
            async def send_to_client():
                try:
                    async for message in assemblyai_ws:
                        # Forward transcription to browser
                        await websocket.send_json(json.loads(message))
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e)
                    })
            
            # Run both tasks concurrently
            await asyncio.gather(
                receive_from_client(),
                send_to_client()
            )
            
        except Exception as e:
            await websocket.send_json({
                "type": "error",
                "message": f"AssemblyAI error: {str(e)}"
            })
        finally:
            if assemblyai_ws:
                await assemblyai_ws.close()
            await websocket.close()
    
    @staticmethod
    async def handle_deepgram(websocket: WebSocket):
        """Handle Deepgram streaming"""
        await websocket.accept()
        
        try:
            client = DeepgramClient(DEEPGRAM_API_KEY)
            
            # Configure Deepgram connection
            options = {
                "model": "flux-general-en",
                "encoding": "linear16",
                "sample_rate": 16000,
                "channels": 1,
                "interim_results": True,
            }
            
            connection = client.listen.websocket.v("1")
            
            # Set up event handlers
            def on_open(self, open_event, **kwargs):
                asyncio.create_task(websocket.send_json({
                    "type": "status",
                    "message": "Connected to Deepgram"
                }))
            
            def on_message(self, result, **kwargs):
                try:
                    transcript = result.channel.alternatives[0].transcript
                    if transcript:
                        is_final = result.is_final
                        asyncio.create_task(websocket.send_json({
                            "type": "transcript",
                            "text": transcript,
                            "is_final": is_final
                        }))
                except Exception as e:
                    print(f"Message error: {e}")
            
            def on_error(self, error, **kwargs):
                asyncio.create_task(websocket.send_json({
                    "type": "error",
                    "message": str(error)
                }))
            
            def on_close(self, close_event, **kwargs):
                print("Deepgram connection closed")
            
            # Register handlers
            connection.on(EventType.OPEN, on_open)
            connection.on(EventType.TRANSCRIPT, on_message)
            connection.on(EventType.ERROR, on_error)
            connection.on(EventType.CLOSE, on_close)
            
            # Start connection
            if connection.start(options) is False:
                raise Exception("Failed to start Deepgram connection")
            
            # Receive and forward audio
            try:
                while True:
                    data = await websocket.receive()
                    
                    if "bytes" in data:
                        connection.send(data["bytes"])
                    elif "text" in data:
                        msg = json.loads(data["text"])
                        if msg.get("type") == "terminate":
                            break
            except WebSocketDisconnect:
                pass
            finally:
                connection.finish()
            
        except Exception as e:
            await websocket.send_json({
                "type": "error",
                "message": f"Deepgram error: {str(e)}"
            })
        finally:
            await websocket.close()


@app.get("/")
async def root():
    """API information"""
    return {
        "message": "ASR API Server",
        "endpoints": {
            "/ws/assemblyai": "WebSocket endpoint for AssemblyAI",
            "/ws/deepgram": "WebSocket endpoint for Deepgram",
            "/test": "Browser test interface"
        }
    }


@app.websocket("/ws/assemblyai")
async def websocket_assemblyai(websocket: WebSocket):
    """WebSocket endpoint for AssemblyAI"""
    await ASRManager.handle_assemblyai(websocket)


@app.websocket("/ws/deepgram")
async def websocket_deepgram(websocket: WebSocket):
    """WebSocket endpoint for Deepgram"""
    await ASRManager.handle_deepgram(websocket)


@app.get("/test", response_class=HTMLResponse)
async def test_page():
    """Browser test interface"""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>ASR Test Interface</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 50px auto;
                padding: 20px;
                background: #f5f5f5;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { color: #333; }
            .controls {
                margin: 20px 0;
                display: flex;
                gap: 10px;
                align-items: center;
            }
            button {
                padding: 10px 20px;
                font-size: 16px;
                cursor: pointer;
                border: none;
                border-radius: 5px;
                background: #4CAF50;
                color: white;
            }
            button:hover { background: #45a049; }
            button:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            .stop { background: #f44336; }
            .stop:hover { background: #da190b; }
            select {
                padding: 10px;
                font-size: 16px;
                border-radius: 5px;
                border: 1px solid #ddd;
            }
            .status {
                padding: 10px;
                margin: 10px 0;
                border-radius: 5px;
                background: #e3f2fd;
            }
            .transcript {
                min-height: 200px;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 5px;
                background: #fafafa;
                margin-top: 20px;
            }
            .interim { color: #666; font-style: italic; }
            .final { color: #000; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎤 ASR Test Interface</h1>
            
            <div class="controls">
                <select id="provider">
                    <option value="assemblyai">AssemblyAI</option>
                    <option value="deepgram">Deepgram</option>
                </select>
                <button id="startBtn" onclick="startRecording()">Start Recording</button>
                <button id="stopBtn" onclick="stopRecording()" disabled class="stop">Stop Recording</button>
            </div>
            
            <div id="status" class="status">Status: Not connected</div>
            
            <h3>Transcript:</h3>
            <div id="transcript" class="transcript"></div>
        </div>

        <script>
            let ws = null;
            let mediaRecorder = null;
            let audioContext = null;
            let processor = null;
            
            function updateStatus(message) {
                document.getElementById('status').textContent = 'Status: ' + message;
            }
            
            async function startRecording() {
                const provider = document.getElementById('provider').value;
                const wsUrl = `ws://localhost:8000/ws/${provider}`;
                
                try {
                    // Get microphone access
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        audio: {
                            channelCount: 1,
                            sampleRate: 16000,
                            echoCancellation: true,
                            noiseSuppression: true
                        } 
                    });
                    
                    // Connect WebSocket
                    ws = new WebSocket(wsUrl);
                    
                    ws.onopen = () => {
                        updateStatus('Connected to ' + provider);
                        document.getElementById('startBtn').disabled = true;
                        document.getElementById('stopBtn').disabled = false;
                    };
                    
                    ws.onmessage = (event) => {
                        const data = JSON.parse(event.data);
                        handleTranscript(data);
                    };
                    
                    ws.onerror = (error) => {
                        updateStatus('WebSocket error');
                        console.error('WebSocket error:', error);
                    };
                    
                    ws.onclose = () => {
                        updateStatus('Disconnected');
                        document.getElementById('startBtn').disabled = false;
                        document.getElementById('stopBtn').disabled = true;
                    };
                    
                    // Set up audio processing
                    audioContext = new AudioContext({ sampleRate: 16000 });
                    const source = audioContext.createMediaStreamSource(stream);
                    processor = audioContext.createScriptProcessor(4096, 1, 1);
                    
                    processor.onaudioprocess = (e) => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            const audioData = e.inputBuffer.getChannelData(0);
                            const pcm16 = convertFloat32ToInt16(audioData);
                            ws.send(pcm16.buffer);
                        }
                    };
                    
                    source.connect(processor);
                    processor.connect(audioContext.destination);
                    
                } catch (error) {
                    updateStatus('Error: ' + error.message);
                    console.error('Error:', error);
                }
            }
            
            function stopRecording() {
                if (ws) {
                    ws.send(JSON.stringify({ type: 'terminate' }));
                    ws.close();
                }
                if (processor) {
                    processor.disconnect();
                }
                if (audioContext) {
                    audioContext.close();
                }
                updateStatus('Stopped');
            }
            
            function handleTranscript(data) {
                const transcriptDiv = document.getElementById('transcript');
                
                if (data.type === 'Turn') {
                    // AssemblyAI
                    const text = data.transcript;
                    const isFinal = data.turn_is_formatted;
                    
                    if (isFinal) {
                        transcriptDiv.innerHTML += `<p class="final">${text}</p>`;
                    } else {
                        transcriptDiv.innerHTML += `<p class="interim">${text}</p>`;
                    }
                } else if (data.type === 'transcript') {
                    // Deepgram
                    const text = data.text;
                    const isFinal = data.is_final;
                    
                    if (isFinal) {
                        transcriptDiv.innerHTML += `<p class="final">${text}</p>`;
                    } else {
                        transcriptDiv.innerHTML += `<p class="interim">${text}</p>`;
                    }
                } else if (data.type === 'status') {
                    updateStatus(data.message);
                }
                
                // Auto-scroll
                transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
            }
            
            function convertFloat32ToInt16(buffer) {
                const int16 = new Int16Array(buffer.length);
                for (let i = 0; i < buffer.length; i++) {
                    const s = Math.max(-1, Math.min(1, buffer[i]));
                    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                return int16;
            }
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


if __name__ == "__main__":
    import uvicorn
    print("Starting ASR API Server...")
    print("Browser test interface: http://localhost:8000/test")
    uvicorn.run(app, host="0.0.0.0", port=8000)
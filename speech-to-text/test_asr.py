"""
Local test script for ASR API
Captures audio from microphone and sends to local API server
"""

import asyncio
import websockets
import pyaudio
import json
import sys
from datetime import datetime

# Configuration
API_URL_ASSEMBLYAI = "ws://localhost:8000/ws/assemblyai"
API_URL_DEEPGRAM = "ws://localhost:8000/ws/deepgram"

# Audio settings
FRAMES_PER_BUFFER = 3200  # 0.2 seconds at 16kHz
SAMPLE_RATE = 16000
CHANNELS = 1
FORMAT = pyaudio.paInt16


class ASRTester:
    def __init__(self, provider="assemblyai"):
        self.provider = provider
        self.api_url = API_URL_ASSEMBLYAI if provider == "assemblyai" else API_URL_DEEPGRAM
        self.audio = None
        self.stream = None
        self.websocket = None
        self.running = False
        
    async def connect(self):
        """Connect to the API server"""
        try:
            self.websocket = await websockets.connect(self.api_url)
            print(f"✓ Connected to {self.provider} API")
            return True
        except Exception as e:
            print(f"✗ Connection failed: {e}")
            return False
    
    async def send_audio(self):
        """Send audio data to API"""
        try:
            while self.running:
                audio_data = self.stream.read(FRAMES_PER_BUFFER, exception_on_overflow=False)
                await self.websocket.send(audio_data)
                await asyncio.sleep(0.01)  # Small delay to prevent overwhelming
        except Exception as e:
            print(f"Audio sending error: {e}")
    
    async def receive_transcripts(self):
        """Receive and display transcripts from API"""
        try:
            async for message in self.websocket:
                data = json.loads(message)
                self.handle_response(data)
        except websockets.exceptions.ConnectionClosed:
            print("\n✓ Connection closed")
        except Exception as e:
            print(f"\nReceive error: {e}")
    
    def handle_response(self, data):
        """Handle different response types"""
        msg_type = data.get('type', '')
        
        if msg_type == 'status':
            print(f"Status: {data.get('message')}")
        
        elif msg_type == 'Begin':
            session_id = data.get('id', 'N/A')
            print(f"Session started: {session_id}")
        
        elif msg_type == 'Turn':
            # AssemblyAI response
            transcript = data.get('transcript', '')
            is_formatted = data.get('turn_is_formatted', False)
            
            if is_formatted:
                print(f"\n[FINAL] {transcript}")
            else:
                print(f"\r[INTERIM] {transcript}", end='', flush=True)
        
        elif msg_type == 'transcript':
            # Deepgram response
            text = data.get('text', '')
            is_final = data.get('is_final', False)
            
            if is_final:
                print(f"\n[FINAL] {text}")
            else:
                print(f"\r[INTERIM] {text}", end='', flush=True)
        
        elif msg_type == 'Termination':
            audio_duration = data.get('audio_duration_seconds', 0)
            print(f"\n\nSession ended. Duration: {audio_duration:.2f}s")
        
        elif msg_type == 'error':
            print(f"\n✗ Error: {data.get('message')}")
    
    def start_audio_stream(self):
        """Initialize and start audio stream"""
        try:
            self.audio = pyaudio.PyAudio()
            self.stream = self.audio.open(
                input=True,
                frames_per_buffer=FRAMES_PER_BUFFER,
                channels=CHANNELS,
                format=FORMAT,
                rate=SAMPLE_RATE,
            )
            print("✓ Microphone stream started")
            return True
        except Exception as e:
            print(f"✗ Failed to open microphone: {e}")
            return False
    
    def stop_audio_stream(self):
        """Stop and cleanup audio stream"""
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
        if self.audio:
            self.audio.terminate()
        print("✓ Audio stream stopped")
    
    async def terminate_session(self):
        """Send termination message to server"""
        try:
            await self.websocket.send(json.dumps({"type": "terminate"}))
            await asyncio.sleep(1)  # Wait for final responses
        except Exception as e:
            print(f"Termination error: {e}")
    
    async def run(self):
        """Main test loop"""
        print(f"\n{'='*60}")
        print(f"ASR API Test - Provider: {self.provider.upper()}")
        print(f"{'='*60}\n")
        
        # Start audio stream
        if not self.start_audio_stream():
            return
        
        # Connect to API
        if not await self.connect():
            self.stop_audio_stream()
            return
        
        print("\n🎤 Recording started. Press Ctrl+C to stop.\n")
        self.running = True
        
        try:
            # Run audio sending and transcript receiving concurrently
            await asyncio.gather(
                self.send_audio(),
                self.receive_transcripts()
            )
        except KeyboardInterrupt:
            print("\n\n⏹ Stopping recording...")
            self.running = False
            await self.terminate_session()
        finally:
            if self.websocket:
                await self.websocket.close()
            self.stop_audio_stream()
            print("\n✓ Test completed")


async def test_both_providers():
    """Test both providers sequentially"""
    print("\n" + "="*60)
    print("TESTING BOTH ASR PROVIDERS")
    print("="*60)
    
    for provider in ["assemblyai", "deepgram"]:
        tester = ASRTester(provider)
        print(f"\n\n--- Testing {provider.upper()} ---")
        await tester.run()
        print("\nWaiting 2 seconds before next test...")
        await asyncio.sleep(2)


def main():
    """Main entry point"""
    print("\n" + "="*60)
    print("ASR API LOCAL TESTER")
    print("="*60)
    
    if len(sys.argv) > 1:
        provider = sys.argv[1].lower()
        if provider not in ["assemblyai", "deepgram", "both"]:
            print("\nUsage: python test_asr.py [assemblyai|deepgram|both]")
            print("Default: assemblyai")
            return
    else:
        provider = "assemblyai"
    
    try:
        if provider == "both":
            asyncio.run(test_both_providers())
        else:
            tester = ASRTester(provider)
            asyncio.run(tester.run())
    except Exception as e:
        print(f"\n✗ Fatal error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
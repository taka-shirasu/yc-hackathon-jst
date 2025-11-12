import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import ASRDisplay from './components/ASRDisplay';
import ContextualLayer from './components/ContextualLayer';
import OutputDisplay from './components/OutputDisplay';
import MicrophoneControl from './components/MicrophoneControl';

function App() {
  const [asr1Text, setAsr1Text] = useState('');
  const [asr2Text, setAsr2Text] = useState('');
  const [curatedText, setCuratedText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [meetingAgenda, setMeetingAgenda] = useState('');
  const [audioStream, setAudioStream] = useState(null);
  
  // WebSocket connections
  const ws1Ref = useRef(null); // AssemblyAI
  const ws2Ref = useRef(null); // Deepgram
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  
  // ASR Server URL (adjust if needed)
  const ASR_SERVER_URL = 'localhost:8000';
  
  // Helper function to wait for WebSocket connection
  const waitForWebSocket = (ws, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      if (ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      
      const timeoutId = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, timeout);
      
      ws.onopen = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      
      ws.onerror = (error) => {
        clearTimeout(timeoutId);
        reject(error);
      };
    });
  };

  // Convert Float32Array to Int16Array (PCM16) - little-endian
  const convertFloat32ToInt16 = (float32Array) => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] range
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit signed integer: -1.0 -> -32768, 1.0 -> 32767
      int16Array[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF);
    }
    return int16Array;
  };
  
  // Convert ArrayBuffer to Base64
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };
  
  // Simple resampler: downsample from sourceRate to targetRate (16000)
  const resampleAudio = (audioData, sourceRate, targetRate) => {
    if (sourceRate === targetRate) return audioData;
    
    const ratio = sourceRate / targetRate;
    const newLength = Math.round(audioData.length / ratio);
    const result = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const index = Math.floor(srcIndex);
      const fraction = srcIndex - index;
      
      if (index + 1 < audioData.length) {
        // Linear interpolation
        result[i] = audioData[index] * (1 - fraction) + audioData[index + 1] * fraction;
      } else {
        result[i] = audioData[index];
      }
    }
    
    return result;
  };

  const startRecording = async () => {
    try {
      // List available audio devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      console.log('Available audio inputs:', audioInputs.map(d => ({ id: d.deviceId, label: d.label })));
      
      // Request microphone access - use ideal constraints (browser will use best available)
      const constraints = {
        audio: {
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 16000 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Don't specify deviceId - let browser choose default
        }
      };
      
      console.log('Requesting microphone access with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Verify stream is actually capturing
      const testAudioContext = new AudioContext();
      const testSource = testAudioContext.createMediaStreamSource(stream);
      const testProcessor = testAudioContext.createScriptProcessor(4096, 1, 1);
      let testSamples = 0;
      let testMaxLevel = 0;
      
      testProcessor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        const level = Math.max(...data.map(Math.abs));
        testMaxLevel = Math.max(testMaxLevel, level);
        testSamples++;
        if (testSamples >= 10) {
          testProcessor.disconnect();
          testSource.disconnect();
          testAudioContext.close();
          console.log('Microphone test - Max level detected:', testMaxLevel.toFixed(4));
          if (testMaxLevel < 0.001) {
            console.error('❌ CRITICAL: Microphone is not capturing audio!');
            alert('Microphone is not working. Please check:\n1. Microphone permissions\n2. Microphone is not muted\n3. Try a different microphone');
          }
        }
      };
      
      testSource.connect(testProcessor);
      testProcessor.connect(testAudioContext.destination);
      
      // Check if stream has audio tracks
      const audioTracks = stream.getAudioTracks();
      console.log('Audio tracks:', audioTracks.map(track => ({
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        settings: track.getSettings()
      })));
      
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks found in stream');
      }
      
      // Check audio track settings
      const track = audioTracks[0];
      const settings = track.getSettings();
      console.log('Audio track settings:', settings);
      
      setAudioStream(stream);
      
      // Create AudioContext - note: sampleRate might be ignored, we'll resample if needed
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ 
        sampleRate: 16000 
      });
      audioContextRef.current = audioContext;
      
      console.log('AudioContext sample rate:', audioContext.sampleRate);
      
      // Create audio source from stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      
      // Create script processor for audio processing
      // Note: createScriptProcessor is deprecated but works for this use case
      // Buffer size: 4096 samples
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      // Check if we need to resample
      const needsResample = Math.abs(audioContext.sampleRate - 16000) > 100;
      if (needsResample) {
        console.warn(`AudioContext sample rate (${audioContext.sampleRate}) doesn't match target (16000). Resampling may be needed.`);
      }
      
      // Connect WebSocket to Deepgram (ASR 1)
      const ws1 = new WebSocket(`ws://${ASR_SERVER_URL}/ws/deepgram`);
      ws1Ref.current = ws1;
      
      ws1.onopen = () => {
        console.log('Deepgram: Connected to Deepgram');
      };
      
      ws1.onerror = (error) => {
        console.error('Deepgram WebSocket connection error:', error);
        console.error('Please ensure the ASR server is running on port 8000');
      };
      
      ws1.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'transcript') {
            // Deepgram format
            const text = data.text || '';
            const isFinal = data.is_final || false;
            
            console.log('Deepgram transcript:', { text, isFinal });
            
            if (text) {
              if (isFinal) {
                setAsr1Text(prev => {
                  // Remove interim text and add final
                  const cleanPrev = prev.replace(/<interim>.*?<\/interim>/g, '').trim();
                  const newText = cleanPrev + (cleanPrev ? ' ' : '') + text;
                  console.log('Setting ASR1 (Deepgram) final text:', newText);
                  return newText;
                });
              } else {
                // Update interim text
                setAsr1Text(prev => {
                  const cleanPrev = prev.replace(/<interim>.*?<\/interim>/g, '').trim();
                  const newText = cleanPrev + ' <interim>' + text + '</interim>';
                  console.log('Setting ASR1 (Deepgram) interim text:', newText);
                  return newText;
                });
              }
            }
          } else if (data.type === 'status') {
            console.log('Deepgram:', data.message);
          } else if (data.type === 'error') {
            console.error('Deepgram error:', data.message);
          } else {
            console.log('Deepgram message type:', data.type, data);
          }
        } catch (e) {
          console.error('Error parsing Deepgram message:', e, event.data);
        }
      };
      
      ws1.onerror = (error) => {
        console.error('Deepgram WebSocket error:', error);
      };
      
      ws1.onclose = () => {
        console.log('Deepgram WebSocket closed');
      };
      
      // Connect WebSocket to AssemblyAI (ASR 2)
      const ws2 = new WebSocket(`ws://${ASR_SERVER_URL}/ws/assemblyai`);
      ws2Ref.current = ws2;
      
      ws2.onopen = () => {
        console.log('AssemblyAI: Connected to AssemblyAI');
      };
      
      ws2.onerror = (error) => {
        console.error('AssemblyAI WebSocket connection error:', error);
        console.error('Please ensure the ASR server is running on port 8000');
      };
      
      ws2.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Log all messages for debugging
          console.log('AssemblyAI message received:', data.type, data);
          
          if (data.type === 'Turn') {
            // AssemblyAI format - Turn message (with format_turns: true)
            // Turn messages can have transcript in different fields
            const text = data.transcript || data.text || '';
            const isFinal = data.turn_is_formatted !== false; // Default to true if not specified
            
            console.log('AssemblyAI Turn:', { text, isFinal, fullData: data });
            
            if (text && text.trim()) {
              if (isFinal) {
                setAsr2Text(prev => {
                  // Remove interim text and add final
                  const cleanPrev = prev.replace(/<interim>.*?<\/interim>/g, '').trim();
                  const newText = cleanPrev + (cleanPrev ? ' ' : '') + text;
                  console.log('Setting ASR2 (AssemblyAI) final text:', newText);
                  return newText;
                });
              } else {
                // Update interim text
                setAsr2Text(prev => {
                  const cleanPrev = prev.replace(/<interim>.*?<\/interim>/g, '').trim();
                  const newText = cleanPrev + ' <interim>' + text + '</interim>';
                  console.log('Setting ASR2 (AssemblyAI) interim text:', newText);
                  return newText;
                });
              }
            }
          } else if (data.type === 'SessionBegins' || data.type === 'Begin') {
            // Session started - no action needed, just acknowledge
            console.log('AssemblyAI session started');
          } else if (data.type === 'PartialTranscript' || data.type === 'PartialTranscriptResult') {
            // Handle partial/interim transcripts
            const text = data.text || data.transcript || '';
            console.log('AssemblyAI PartialTranscript:', { text, fullData: data });
            if (text && text.trim()) {
              setAsr2Text(prev => {
                const cleanPrev = prev.replace(/<interim>.*?<\/interim>/g, '').trim();
                const newText = cleanPrev + ' <interim>' + text + '</interim>';
                console.log('Setting ASR2 (AssemblyAI) partial text:', newText);
                return newText;
              });
            }
          } else if (data.type === 'FinalTranscript' || data.type === 'FinalTranscriptResult') {
            // Handle final transcripts
            const text = data.text || data.transcript || '';
            console.log('AssemblyAI FinalTranscript:', { text, fullData: data });
            if (text && text.trim()) {
              setAsr2Text(prev => {
                const cleanPrev = prev.replace(/<interim>.*?<\/interim>/g, '').trim();
                const newText = cleanPrev + (cleanPrev ? ' ' : '') + text;
                console.log('Setting ASR2 (AssemblyAI) final text:', newText);
                return newText;
              });
            }
          } else if (data.type === 'status') {
            console.log('AssemblyAI:', data.message);
          } else if (data.type === 'error') {
            console.error('AssemblyAI error:', data.message);
          } else if (data.type === 'SessionTerminated' || data.type === 'End') {
            // Session ended - no action needed
            console.log('AssemblyAI session ended');
          } else {
            // Only log truly unknown message types (skip common control messages)
            if (!['Ping', 'Pong', 'Heartbeat'].includes(data.type)) {
              console.log('AssemblyAI message type:', data.type, data);
            }
          }
        } catch (e) {
          console.error('Error parsing AssemblyAI message:', e, event.data);
        }
      };
      
      ws2.onerror = (error) => {
        console.error('AssemblyAI WebSocket error:', error);
      };
      
      ws2.onclose = () => {
        console.log('AssemblyAI WebSocket closed');
      };
      
      // Process audio and send to both WebSockets
      let audioChunkCount = 0;
      const actualSampleRate = audioContext.sampleRate;
      const targetSampleRate = 16000;
      let maxAudioLevel = 0;
      let silentChunks = 0;
      
      processor.onaudioprocess = (e) => {
        let inputData = e.inputBuffer.getChannelData(0);
        
      // Check audio level to detect if microphone is working
      // Use RMS (Root Mean Square) for more accurate level detection
      let sumSquares = 0;
      for (let i = 0; i < inputData.length; i++) {
        sumSquares += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sumSquares / inputData.length);
      const audioLevel = Math.max(...inputData.map(Math.abs));
      const level = Math.max(audioLevel, rms * 2); // Use the higher of peak or RMS*2
      maxAudioLevel = Math.max(maxAudioLevel, level);
      if (level < 0.001) {
        silentChunks++;
      } else {
        silentChunks = 0;
      }
        
        // Resample if needed
        if (Math.abs(actualSampleRate - targetSampleRate) > 100) {
          inputData = resampleAudio(inputData, actualSampleRate, targetSampleRate);
        }
        
        // Convert to PCM16
        const pcm16 = convertFloat32ToInt16(inputData);
        const pcmBuffer = pcm16.buffer;
        
        audioChunkCount++;
        if (audioChunkCount === 1) {
          console.log(`Audio streaming started. Sample rate: ${actualSampleRate}Hz, resampled to: ${targetSampleRate}Hz`);
          console.log(`First chunk audio level: ${level.toFixed(4)}`);
          if (level < 0.001) {
            console.warn('⚠️ WARNING: Very low audio level detected. Check microphone!');
          }
        }
        if (audioChunkCount === 10) {
          console.log(`After 10 chunks - Max level: ${maxAudioLevel.toFixed(4)}, Current level: ${level.toFixed(4)}`);
          if (maxAudioLevel < 0.001) {
            console.error('❌ ERROR: Microphone not capturing audio! Max level is too low.');
            console.error('Please check:');
            console.error('1. Microphone permissions are granted');
            console.error('2. Microphone is not muted');
            console.error('3. Correct microphone is selected');
            console.error('4. Try speaking louder or adjusting microphone input level in system settings');
          }
        }
        if (audioChunkCount % 100 === 0) {
          console.log(`Audio streaming: sent ${audioChunkCount} chunks. Max level: ${maxAudioLevel.toFixed(4)}. Silent chunks: ${silentChunks}`);
          if (silentChunks > 50) {
            console.warn('⚠️ WARNING: Many silent audio chunks detected. Check microphone input!');
          }
          // Reset max level for next 100 chunks
          maxAudioLevel = 0;
        }
        
        // Send to Deepgram (raw PCM16 binary)
        if (ws1.readyState === WebSocket.OPEN) {
          ws1.send(pcmBuffer);
        } else if (audioChunkCount % 50 === 0) {
          console.warn('Deepgram WebSocket not open, readyState:', ws1.readyState);
        }
        
        // Send to AssemblyAI (Base64-encoded PCM16 in JSON)
        if (ws2.readyState === WebSocket.OPEN) {
          const base64Audio = arrayBufferToBase64(pcmBuffer);
          ws2.send(JSON.stringify({ audio_data: base64Audio }));
        } else if (audioChunkCount % 50 === 0) {
          console.warn('AssemblyAI WebSocket not open, readyState:', ws2.readyState);
        }
      };
      
      // Connect audio nodes
      // Use a GainNode with gain 0 to create a silent destination (prevents feedback)
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0; // Silent - we only want to process, not play back
      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert(`Failed to access microphone. Please check permissions.\n\nError: ${error.message}\n\nOn Mac, make sure to grant microphone permissions in System Preferences > Security & Privacy > Privacy > Microphone.`);
    }
  };

  const stopRecording = () => {
    // Close WebSocket connections
    if (ws1Ref.current) {
      ws1Ref.current.send(JSON.stringify({ type: 'terminate' }));
      ws1Ref.current.close();
      ws1Ref.current = null;
    }
    
    if (ws2Ref.current) {
      ws2Ref.current.send(JSON.stringify({ type: 'terminate' }));
      ws2Ref.current.close();
      ws2Ref.current = null;
    }
    
    // Disconnect audio processing
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Stop audio stream
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
    }
    
    setIsRecording(false);
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  return (
    <div className="app">
      <div className="app-header">
        <h1>Speech-to-Text with Multi-models and Contextual Layer</h1>
        <MicrophoneControl
          isRecording={isRecording}
          onStart={startRecording}
          onStop={stopRecording}
        />
      </div>
      
      <div className="app-content">
        <div className="asr-container">
          <div className="asr-wrapper" id="asr1-wrapper">
            <ASRDisplay
              title="Speech to Text 1 (Deepgram)"
              text={asr1Text.replace(/<interim>.*?<\/interim>/g, '')}
              color="#e1bee7"
            />
            <div className="arrow-asr1-to-agenda">
              <svg className="curved-arrow-asr1" viewBox="0 0 200 200" preserveAspectRatio="none">
                <defs>
                  <marker id="arrowhead-asr1" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                    <polygon points="0 0, 10 3, 0 6" fill="#764ba2" />
                  </marker>
                </defs>
                <path d="M 0 100 Q 100 60 200 100" stroke="#667eea" strokeWidth="4" fill="none" markerEnd="url(#arrowhead-asr1)" />
              </svg>
            </div>
          </div>
          <div className="asr-wrapper" id="asr2-wrapper">
            <ASRDisplay
              title="Speech to Text 2 (AssemblyAI)"
              text={asr2Text.replace(/<interim>.*?<\/interim>/g, '')}
              color="#e1bee7"
            />
            <div className="arrow-asr2-to-agenda">
              <svg className="curved-arrow-asr2" viewBox="0 0 200 200" preserveAspectRatio="none">
                <defs>
                  <marker id="arrowhead-asr2" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                    <polygon points="0 0, 10 3, 0 6" fill="#764ba2" />
                  </marker>
                </defs>
                <path d="M 0 100 Q 100 140 200 100" stroke="#667eea" strokeWidth="4" fill="none" markerEnd="url(#arrowhead-asr2)" />
              </svg>
            </div>
          </div>
        </div>

        <div className="contextual-section">
          <label className="agenda-label-top"></label>
          <ContextualLayer
            asr1Text={asr1Text}
            asr2Text={asr2Text}
            meetingAgenda={meetingAgenda}
            onAgendaChange={setMeetingAgenda}
            onCuratedTextChange={setCuratedText}
            isRecording={isRecording}
          />
        </div>

        <div className="arrow-container arrow-agenda-to-output">
          <div className="arrow-line"></div>
          <div className="arrow-head"></div>
        </div>

        <OutputDisplay text={curatedText} />
      </div>
    </div>
  );
}

export default App;

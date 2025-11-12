const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const WebSocketClient = require('websocket').client;
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configuration
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'dd69a41e7ec17756d15a1867c9f0718253ee0a31';
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY || '84eca8f0692b4390885f26d2e0ff73c5';
const PORT = 8000;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// API info endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'ASR API Server',
    endpoints: {
      '/ws/assemblyai': 'WebSocket endpoint for AssemblyAI',
      '/ws/deepgram': 'WebSocket endpoint for Deepgram',
      '/mcp/context': 'GET endpoint for MCP context'
    }
  });
});

// MCP Context endpoint
app.get('/mcp/context', async (req, res) => {
  try {
    // This endpoint can be extended to fetch actual MCP resources
    // For now, it returns a placeholder that can be replaced with actual MCP integration
    
    // TODO: Integrate with actual MCP server to fetch:
    // - Calendar events
    // - Gmail messages
    // - Google Docs content
    
    const context = {
      context: 'This is tech demo'
    };
    
    res.json(context);
  } catch (error) {
    console.error('Error fetching MCP context:', error);
    res.status(500).json({ error: 'Failed to fetch MCP context' });
  }
});

// WebSocket server - configure for binary data
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false // Disable compression for binary audio data
});

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  let pathname = req.url;
  
  // Parse URL path
  try {
    if (req.url.includes('?')) {
      pathname = req.url.split('?')[0];
    }
  } catch (e) {
    console.error('Error parsing URL:', e);
    ws.close();
    return;
  }
  
  // Configure WebSocket to handle both text and binary
  ws.binaryType = 'arraybuffer';
  
  if (pathname === '/ws/assemblyai') {
    handleAssemblyAI(ws);
  } else if (pathname === '/ws/deepgram') {
    handleDeepgram(ws);
  } else {
    console.log('Unknown WebSocket path:', pathname);
    ws.close();
  }
});

async function handleAssemblyAI(clientWs) {
  let assemblyaiWs = null;
  
  try {
    // Connect to AssemblyAI
    const assemblyaiClient = new WebSocketClient();
    
    const params = new URLSearchParams({
      sample_rate: '16000',
      format_turns: 'true',
      word_boost: '[]',
      punctuate: 'true',
      interim_results: 'true'
    });
    
    const assemblyaiUrl = `wss://streaming.assemblyai.com/v3/ws?${params.toString()}`;
    
    assemblyaiClient.on('connect', (connection) => {
      assemblyaiWs = connection;
      
      clientWs.send(JSON.stringify({
        type: 'status',
        message: 'Connected to AssemblyAI'
      }));
      
      // Forward messages from AssemblyAI to client
      connection.on('message', (message) => {
        if (message.type === 'utf8') {
          try {
            const data = JSON.parse(message.utf8Data);
            console.log('AssemblyAI server received:', data.type, JSON.stringify(data).substring(0, 200));
            
            // Log transcript-related messages in detail
            if (data.type === 'Turn' || data.type === 'PartialTranscript' || data.type === 'FinalTranscript') {
              console.log('AssemblyAI transcript message:', {
                type: data.type,
                transcript: data.transcript,
                text: data.text,
                turn_is_formatted: data.turn_is_formatted,
                fullData: data
              });
            }
            
            clientWs.send(JSON.stringify(data));
          } catch (e) {
            console.error('Error parsing AssemblyAI message:', e);
          }
        }
      });
      
      connection.on('error', (error) => {
        console.error('AssemblyAI connection error:', error);
        clientWs.send(JSON.stringify({
          type: 'error',
          message: `AssemblyAI error: ${error.message}`
        }));
      });
      
      connection.on('close', () => {
        console.log('AssemblyAI connection closed');
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close();
        }
      });
    });
    
    assemblyaiClient.on('connectFailed', (error) => {
      console.error('AssemblyAI connection failed:', error);
      clientWs.send(JSON.stringify({
        type: 'error',
        message: `AssemblyAI connection failed: ${error.message}`
      }));
      clientWs.close();
    });
    
    // Connect to AssemblyAI
    assemblyaiClient.connect(assemblyaiUrl, null, null, {
      Authorization: ASSEMBLYAI_API_KEY
    });
    
    // Forward audio data from client to AssemblyAI
    let audioChunkCount = 0;
    clientWs.on('message', (message) => {
      if (assemblyaiWs && assemblyaiWs.connected) {
        try {
          // Convert Buffer → string if needed (Node.js WebSocket always delivers as Buffer)
          // Browser sends JSON strings like: {"audio_data":"UklGRiQAAABXQVZFZm10..."}
          // But Node.js receives them as: <Buffer 7b 22 61 75 64 69 6f 5f 64 61 74 61 ...>
          const data = typeof message === 'string' 
            ? message 
            : message.toString('utf8');
          
          // Parse JSON
          const json = JSON.parse(data);
          
          if (json.audio_data) {
            // Decode Base64 to binary PCM16
            const audioBuffer = Buffer.from(json.audio_data, 'base64');
            audioChunkCount++;
            if (audioChunkCount === 1 || audioChunkCount % 100 === 0) {
              console.log(`AssemblyAI: Received ${audioChunkCount} audio chunks from client (size: ${audioBuffer.length} bytes)`);
            }
            // Forward binary PCM16 to AssemblyAI
            assemblyaiWs.sendBytes(audioBuffer);
          } else if (json.type === 'terminate') {
            // Terminate session
            console.log('AssemblyAI: Terminate session received');
            assemblyaiWs.send(JSON.stringify({ type: 'Terminate' }));
            assemblyaiWs.close();
          } else {
            console.log('AssemblyAI: Other message:', json);
          }
        } catch (err) {
          // If JSON parsing fails, it might be raw binary (shouldn't happen for AssemblyAI)
          // But handle gracefully for backwards compatibility
          if (Buffer.isBuffer(message)) {
            console.warn('AssemblyAI: Received unexpected binary message, forwarding anyway');
            assemblyaiWs.sendBytes(message);
          } else {
            console.error('AssemblyAI: Failed to parse WebSocket message:', err.message);
          }
        }
      } else {
        if (audioChunkCount === 0) {
          console.warn('AssemblyAI: WebSocket not connected yet, cannot forward audio. Connection state:', assemblyaiWs ? 'exists but not connected' : 'not created');
        }
      }
    });
    
    clientWs.on('close', () => {
      if (assemblyaiWs && assemblyaiWs.connected) {
        assemblyaiWs.close();
      }
    });
    
    clientWs.on('error', (error) => {
      console.error('Client WebSocket error:', error);
      if (assemblyaiWs && assemblyaiWs.connected) {
        assemblyaiWs.close();
      }
    });
    
  } catch (error) {
    console.error('AssemblyAI handler error:', error);
    clientWs.send(JSON.stringify({
      type: 'error',
      message: `AssemblyAI error: ${error.message}`
    }));
    clientWs.close();
  }
}

async function handleDeepgram(clientWs) {
  let deepgramWs = null;
  
  try {
    // Connect to Deepgram using WebSocket
    const deepgramClient = new WebSocketClient();
    
    const params = new URLSearchParams({
      model: 'nova-2',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      punctuate: 'true',
      endpointing: '300'
    });
    
    const deepgramUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    
    deepgramClient.on('connect', (connection) => {
      deepgramWs = connection;
      
      clientWs.send(JSON.stringify({
        type: 'status',
        message: 'Connected to Deepgram'
      }));
      
      // Forward messages from Deepgram to client
      connection.on('message', (message) => {
        if (message.type === 'utf8') {
          try {
            const data = JSON.parse(message.utf8Data);
            console.log('Deepgram server received:', JSON.stringify(data).substring(0, 200));
            
            // Parse Deepgram response format
            if (data.type === 'Results') {
              if (data.channel && data.channel.alternatives && data.channel.alternatives.length > 0) {
                const transcript = data.channel.alternatives[0].transcript;
                const isFinal = data.is_final || false;
                
                if (transcript && transcript.trim()) {
                  console.log('Deepgram transcript:', transcript, 'isFinal:', isFinal);
                  clientWs.send(JSON.stringify({
                    type: 'transcript',
                    text: transcript,
                    is_final: isFinal
                  }));
                } else {
                  // Log when we get Results but no transcript (might be silence or format issue)
                  if (data.is_final) {
                    console.log('Deepgram: Final result but empty transcript - possible audio format issue');
                  }
                }
              }
            } else {
              console.log('Deepgram message type:', data.type || 'unknown');
            }
          } catch (e) {
            console.error('Error parsing Deepgram message:', e);
          }
        }
      });
      
      connection.on('error', (error) => {
        console.error('Deepgram connection error:', error);
        clientWs.send(JSON.stringify({
          type: 'error',
          message: `Deepgram error: ${error.message}`
        }));
      });
      
      connection.on('close', () => {
        console.log('Deepgram connection closed');
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close();
        }
      });
    });
    
    deepgramClient.on('connectFailed', (error) => {
      console.error('Deepgram connection failed:', error);
      clientWs.send(JSON.stringify({
        type: 'error',
        message: `Deepgram connection failed: ${error.message}`
      }));
      clientWs.close();
    });
    
    // Connect to Deepgram with API key in header
    deepgramClient.connect(deepgramUrl, null, null, {
      Authorization: `Token ${DEEPGRAM_API_KEY}`
    });
    
    // Forward audio data from client to Deepgram
    let audioChunkCount = 0;
    clientWs.on('message', (data) => {
      if (deepgramWs && deepgramWs.connected) {
        // Handle binary data (can be Buffer, ArrayBuffer, or Buffer[])
        let audioBuffer;
        if (Buffer.isBuffer(data)) {
          audioBuffer = data;
        } else if (data instanceof ArrayBuffer) {
          audioBuffer = Buffer.from(data);
        } else if (Array.isArray(data)) {
          audioBuffer = Buffer.concat(data);
        } else {
          // Try to handle as string
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'terminate') {
              deepgramWs.close();
            }
          } catch (e) {
            // Not JSON, ignore
          }
          return;
        }
        
        // Send binary audio data
        audioChunkCount++;
        if (audioChunkCount === 1 || audioChunkCount % 100 === 0) {
          console.log(`Deepgram: Received ${audioChunkCount} audio chunks from client (size: ${audioBuffer.length} bytes)`);
        }
        deepgramWs.sendBytes(audioBuffer);
      }
    });
    
    clientWs.on('close', () => {
      if (deepgramWs && deepgramWs.connected) {
        deepgramWs.close();
      }
    });
    
    clientWs.on('error', (error) => {
      console.error('Client WebSocket error:', error);
      if (deepgramWs && deepgramWs.connected) {
        deepgramWs.close();
      }
    });
    
  } catch (error) {
    console.error('Deepgram handler error:', error);
    clientWs.send(JSON.stringify({
      type: 'error',
      message: `Deepgram error: ${error.message}`
    }));
    clientWs.close();
  }
}

// Start server
server.listen(PORT, () => {
  console.log(`ASR API Server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoints:`);
  console.log(`  - ws://localhost:${PORT}/ws/assemblyai`);
  console.log(`  - ws://localhost:${PORT}/ws/deepgram`);
});

module.exports = server;


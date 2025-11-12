import React, { useEffect, useState } from 'react';
import './ContextualLayer.css';

// OpenAI API Key - can be set via environment variable or fallback to default
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY || 
  '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';

async function curateWithGPT4Mini(asr1Text, asr2Text, meetingAgenda) {
  if (!OPENAI_API_KEY) {
    return 'Error: OpenAI API key not configured. Please set REACT_APP_OPENAI_API_KEY environment variable.';
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a meeting transcription curator. Your task is to combine and refine transcriptions from two different ASR systems, STRICTLY using the meeting agenda context as the primary guide for curation.
            
            CRITICAL REQUIREMENTS:
            - The meeting agenda context is MANDATORY and MUST be used to curate the transcription
            - Use the context to disambiguate unclear words, correct errors, and ensure accuracy
            - If the transcription mentions topics from the context, prioritize and clarify those references
            - Use context-specific terminology, names, and concepts to correct ASR mistakes
            - The curated transcription MUST align with and reflect the meeting context provided
            - If context is provided, you MUST use it - do not ignore it
            
            Instructions:
            - Combine the best parts of both transcriptions
            - Correct any errors or inconsistencies using the context as reference
            - Ensure the output is coherent, accurate, and contextually relevant
            - Use the meeting agenda context to interpret ambiguous phrases and correct misheard words
            - Maintain the natural flow of conversation
            - Preserve important details from both sources that align with the context
            - IMPORTANT: Output ONLY a JSON object in this exact format: {"transcription": "your curated transcription text here"}
            - Do NOT include any descriptions, explanations, introductions, or additional text
            - Return ONLY the JSON object with the transcription field`
          },
          {
            role: 'user',
            content: `Meeting Agenda Context (MUST USE THIS FOR CURATION):\n${meetingAgenda || 'No agenda provided - proceed with standard curation'}\n\nASR 1 Transcription:\n${asr1Text || 'No transcription yet'}\n\nASR 2 Transcription:\n${asr2Text || 'No transcription yet'}\n\nIMPORTANT: You MUST use the Meeting Agenda Context above to curate the transcriptions. Use the context to correct errors, disambiguate unclear words, and ensure the transcription accurately reflects the meeting topics and terminology mentioned in the context.\n\nPlease provide ONLY the curated transcription text in JSON format: {"transcription": "your curated transcription here"}. Do not include any descriptions, explanations, or additional text - just the JSON object with the transcription field.`
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get response from OpenAI');
    }

    const data = await response.json();
    const rawContent = data.choices[0]?.message?.content || '';
    
    // Try to parse JSON from the response
    try {
      // Extract JSON from the response (might be wrapped in markdown code blocks or plain JSON)
      let jsonStr = rawContent.trim();
      
      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?$/g, '').trim();
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '').trim();
      }
      
      // Parse JSON
      const parsed = JSON.parse(jsonStr);
      
      // Return just the transcription
      return parsed.transcription || parsed.text || rawContent;
    } catch (e) {
      // If JSON parsing fails, try to extract just the transcription text
      // Look for common patterns and return the content as-is if it's already clean
      if (rawContent.includes('"transcription"') || rawContent.includes('transcription')) {
        // Try to extract from text
        const match = rawContent.match(/"transcription"\s*:\s*"([^"]+)"/);
        if (match) {
          return match[1];
        }
      }
      
      // If all else fails, return the raw content (might already be just the transcription)
      return rawContent;
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return `Error: ${error.message}`;
  }
}

// Mock meeting data
const mockMeetings = [
  {
    id: '1vnt678duhfmj9rnrqlrv8fmfa',
    title: 'Q4 SMS feature launch',
    date: '11/13 02:00 PM',
    description: 'Discuss implementation plan for SMS text message notifications with push notification fallback',
    documents: [
      {
        name: 'SMS Feature Specs',
        type: 'Google Doc',
        url: 'https://docs.google.com/document/d/1aDPKgzRKUmGSpi9WqrtmXwF1bvXcIrAVj0ZeiEl68S8'
      }
    ],
    emails: [
      {
        subject: 'SMS feature launch - Technical Architecture',
        from: 'tech-team@company.com',
        date: '2025-10-15'
      },
      {
        subject: 'Beta testing rollout plan',
        from: 'product@company.com',
        date: '2025-10-18'
      }
    ],
    context: `Implementation plan for SMS text message notifications
Technical architecture for the text messaging system
Character limits and message concatenation strategy
Beta testing rollout in U.S., Spain, France, Mexico
Translation accuracy concerns for SMS notifications`
  },
  {
    id: 'meeting-2',
    title: 'International Team Sync',
    date: '11/14 09:30 AM',
    description: 'Weekly sync for global teams',
    documents: [],
    emails: [],
    context: ''
  },
  {
    id: 'meeting-3',
    title: 'Product Strategy - Q4 Roadmap',
    date: '11/17 02:30 PM',
    description: 'Quarterly planning session for Q4 2024 product priorities',
    documents: [],
    emails: [],
    context: ''
  }
];

function ContextualLayer({ asr1Text, asr2Text, meetingAgenda, onAgendaChange, onCuratedTextChange, isRecording }) {
  const [isImporting, setIsImporting] = useState(false);
  const [showMCPPopup, setShowMCPPopup] = useState(false);
  const [isLoadingMCP, setIsLoadingMCP] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  const handleImportFromMCP = async () => {
    setIsImporting(true);
    setIsLoadingMCP(true);
    
    // Simulate fetching from MCP server
    await new Promise(resolve => setTimeout(resolve, 800));
    
    setIsLoadingMCP(false);
    setShowMCPPopup(true);
    setIsImporting(false);
  };

  const handleMeetingSelect = (meeting) => {
    setSelectedMeeting(meeting);
    setShowMCPPopup(false);
    
    // Update the agenda with the meeting context
    const context = 'This is tech demo';
    const newAgenda = meetingAgenda 
      ? `${meetingAgenda}\n\n--- Imported from MCP ---\n${context}`
      : context;
    onAgendaChange(newAgenda);
  };

  useEffect(() => {
    // Only run curation when recording is active
    if (!isRecording) {
      return;
    }

    // Run curation every 2 seconds when recording
    // Skip if text contains placeholder messages
    const hasPlaceholder = (text) => text.includes('[Placeholder') || text.includes('Waiting for');
    const hasRealContent = (text) => text && text.trim() && !hasPlaceholder(text);
    
    // Only run if we have some content from either ASR
    if (hasRealContent(asr1Text) || hasRealContent(asr2Text)) {
      // Run immediately on first content
      const runCuration = async () => {
        try {
          // Clean the ASR texts (remove interim tags for processing)
          const cleanAsr1 = asr1Text.replace(/<interim>.*?<\/interim>/g, '').trim();
          const cleanAsr2 = asr2Text.replace(/<interim>.*?<\/interim>/g, '').trim();
          
          const curated = await curateWithGPT4Mini(cleanAsr1, cleanAsr2, meetingAgenda);
          onCuratedTextChange(curated);
        } catch (error) {
          console.error('Error in curation:', error);
        }
      };

      // Run immediately
      runCuration();

      // Then set up interval to run every 2 seconds
      const interval = setInterval(runCuration, 2000);

      return () => clearInterval(interval);
    } else if (!asr1Text && !asr2Text) {
      // Clear output if no content
      onCuratedTextChange('');
    }
  }, [asr1Text, asr2Text, meetingAgenda, onCuratedTextChange, isRecording]);

  return (
    <>
      {showMCPPopup && (
        <div className="mcp-popup-overlay" onClick={() => setShowMCPPopup(false)}>
          <div className="mcp-popup" onClick={(e) => e.stopPropagation()}>
            <div className="mcp-popup-header">
              <h3>📅 Select a Meeting</h3>
              <button 
                className="mcp-close-button"
                onClick={() => setShowMCPPopup(false)}
              >
                ×
              </button>
            </div>
            <div className="mcp-popup-content">
              <p className="mcp-select-prompt">Found {mockMeetings.length} upcoming meetings. Click to select:</p>
              {mockMeetings.map((meeting, index) => (
                <div 
                  key={meeting.id}
                  className="mcp-meeting-item mcp-meeting-clickable"
                  onClick={() => handleMeetingSelect(meeting)}
                >
                  <div className="mcp-meeting-number">{index}.</div>
                  <div className="mcp-meeting-details">
                    <div className="mcp-meeting-time">
                      [{meeting.date}] {meeting.title}
                    </div>
                    <div className="mcp-meeting-description">
                      {meeting.description}
                    </div>
                    {meeting.documents.length === 0 && meeting.emails.length === 0 && (
                      <div className="mcp-meeting-nodata">
                        (No mock data available)
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isLoadingMCP && (
        <div className="mcp-popup-overlay">
          <div className="mcp-loading-popup">
            <div className="mcp-loading-spinner"></div>
            <div className="mcp-loading-text">Fetching from MCP server...</div>
          </div>
        </div>
      )}

      <div className="contextual-layer" style={{ backgroundColor: '#c8e6c9' }}>
        <div className="display-title">Contextual Layer</div>
        <div className="layer-info">
          <p>Meeting Agenda Context:</p>
        </div>
        <div className="agenda-section">
          <textarea
            className="agenda-input"
            value={meetingAgenda}
            onChange={(e) => onAgendaChange(e.target.value)}
            placeholder="Enter meeting agenda or context here (e.g., 'Team standup meeting - discussing sprint progress, blockers, and next steps')"
          />
        </div>
        <div className="calendar-gmail-in-contextual">
          <div className="arrow-head-only-up"></div>
          <div className="calendar-gmail-box-inline">
            <div className="calendar-gmail-icon">
              <img 
                src="/calendar-gmail-icon.png" 
                alt="Calendar, Gmail and G-docs" 
                className="calendar-gmail-image"
              />
            </div>
            <div className="calendar-gmail-label">Calendar, Gmail and G-docs</div>
          </div>
          <button 
            className="import-mcp-button"
            onClick={handleImportFromMCP}
            disabled={isImporting}
          >
            {isImporting ? 'Importing...' : 'Import from MCP'}
          </button>
        </div>
        
        {selectedMeeting && (selectedMeeting.documents.length > 0 || selectedMeeting.emails.length > 0) && (
          <div className="context-sources-section">
            <div className="context-sources-title">Context Sources (Demo)</div>
            {selectedMeeting.documents.length > 0 && (
              <div className="context-sources-group">
                <div className="context-sources-label">📄 Documents Accessed:</div>
                <div className="context-sources-list">
                  {selectedMeeting.documents.map((doc, idx) => (
                    <div key={idx} className="context-source-item">
                      <span className="context-source-name">{doc.name}</span>
                      <span className="context-source-type">({doc.type})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedMeeting.emails.length > 0 && (
              <div className="context-sources-group">
                <div className="context-sources-label">📧 Emails Referenced:</div>
                <div className="context-sources-list">
                  {selectedMeeting.emails.map((email, idx) => (
                    <div key={idx} className="context-source-item">
                      <span className="context-source-name">{email.subject}</span>
                      <span className="context-source-meta">from {email.from} ({email.date})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default ContextualLayer;

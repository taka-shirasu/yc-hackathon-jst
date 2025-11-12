import React from 'react';
import './MicrophoneControl.css';

function MicrophoneControl({ isRecording, onStart, onStop }) {
  return (
    <div className="microphone-control">
      {isRecording && <div className="record-indicator"></div>}
      <button
        className={`record-button ${isRecording ? 'stop' : 'start'}`}
        onClick={isRecording ? onStop : onStart}
      >
        {isRecording ? '⏹ Stop Recording' : '🎤 Start Recording'}
      </button>
    </div>
  );
}

export default MicrophoneControl;


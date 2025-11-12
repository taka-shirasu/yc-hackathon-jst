import React from 'react';
import './ASRDisplay.css';

function ASRDisplay({ title, text, color }) {
  return (
    <div className="asr-display" style={{ backgroundColor: color }}>
      <div className="display-title">{title}</div>
      <div className="display-content">{text || 'Waiting for audio input...'}</div>
    </div>
  );
}

export default ASRDisplay;


import React from 'react';
import './OutputDisplay.css';

function OutputDisplay({ text }) {
  return (
    <div className="output-display" style={{ backgroundColor: '#e1bee7' }}>
      <div className="display-title">Output</div>
      <div className="display-content">{text || 'Waiting for curated output...'}</div>
    </div>
  );
}

export default OutputDisplay;


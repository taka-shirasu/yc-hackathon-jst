# ASR Curation App - YC Hackathon

An Electron app that captures audio from the microphone, processes it through two ASR models, and uses GPT-4o-mini to curate the output with meeting agenda context.

## Features

1. **Microphone Audio Capture**: Records audio from the microphone
2. **Dual ASR Processing**: Two ASR displays (ASR 1 and ASR 2) for different models
3. **Contextual Curation**: GPT-4o-mini processes both ASR outputs with meeting agenda context
4. **Output Display**: Shows the curated final output

## Setup

1. Install dependencies:
```bash
cd yc-hackathon
npm install
```

2. Set up OpenAI API key:
   - Create a `.env` file in the `yc-hackathon` directory
   - Add: `REACT_APP_OPENAI_API_KEY=your_api_key_here`
   - You can get an API key from https://platform.openai.com/api-keys

3. Run in development mode:
```bash
npm run dev
```

This will start both the React development server and Electron app.

## Integrating Your ASR Models

The app currently has placeholder functions for ASR processing. To integrate your models:

1. Open `src/App.js`
2. Replace the `processASR1` and `processASR2` functions with your actual ASR model implementations
3. These functions receive an `audioBlob` parameter and should return a string with the transcription

Example:
```javascript
const processASR1 = async (audioBlob) => {
  // Your ASR model 1 implementation
  const formData = new FormData();
  formData.append('audio', audioBlob);
  const response = await fetch('your-asr-1-api-endpoint', {
    method: 'POST',
    body: formData
  });
  const data = await response.json();
  return data.transcription;
};
```

## Building for Production

```bash
npm run build
npm run build:electron
```

## Project Structure

```
yc-hackathon/
├── main.js              # Electron main process
├── preload.js           # Electron preload script
├── package.json
├── public/
│   └── index.html
└── src/
    ├── App.js           # Main app component
    ├── App.css
    ├── index.js
    ├── index.css
    └── components/
        ├── ASRDisplay.js
        ├── ContextualLayer.js
        ├── OutputDisplay.js
        └── MicrophoneControl.js
```

## Notes

- The app automatically curates the output when ASR texts are available (with a 1.5 second debounce)
- Meeting agenda context can be added in the Contextual Layer section to improve curation accuracy
- GPT-4o-mini is used for the curation process
- Audio is recorded in chunks (every 3 seconds) for real-time processing
- The app uses WebM audio format for recording

## UI Layout

The app matches the flowchart design:
- **Left side**: ASR 1 and ASR 2 displays (stacked vertically, purple background)
- **Center**: Contextual Layer (green background) with meeting agenda input
- **Right side**: Output display (purple background)

## Troubleshooting

- **Microphone not working**: Check browser/Electron permissions for microphone access
- **OpenAI API errors**: Verify your API key is correct and you have credits available
- **ASR not processing**: Make sure you've integrated your ASR models in `src/App.js`


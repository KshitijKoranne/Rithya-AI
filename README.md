# Little Lamp

Little Lamp is a private, voice-first question helper for a six-year-old child.

## Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app requires a Sarvam API key for normal questions. Start the server with the key in the environment:

```bash
SARVAM_API_KEY=your_key_here npm start
```

The browser never receives the key. Audio is held in memory for one request and is not saved by this app. The server uses Saaras v3 for speech-to-text, Sarvam-105B Conversations for the answer, and Bulbul v3 for spoken output. Hindi is supported alongside Marathi, Gujarati, English, and code-mixed speech.

## Provider decision

Sarvam is the first choice for this private app because one provider covers the complete Hindi, Marathi, Gujarati, English, and mixed-language loop. Its current public rates are ₹30/hour for speech-to-text, ₹30/10,000 characters for Bulbul v3 speech, and ₹29.28/₹73.20 per million input/output chat tokens. A short turn with 10 seconds of speech and about 120 answer characters is roughly ₹0.45 before taxes or network costs; actual usage depends on audio and answer length.

OpenAI and Claude would add a separate Indian-language speech setup. For this app, speech quality and language coverage matter more than choosing a larger chat model.

Prices change. Check [Sarvam's current pricing](https://docs.sarvam.ai/api/getting-started/pricing) before adding credits.

## Phone use

The app is a small installable PWA. It uses a portrait layout, safe-area spacing, a 72px touch target, a versioned shell cache, and no analytics or saved audio.

## Host on a VPS

The repository includes a small Docker image and Compose file. On the VPS:

```bash
cp .env.example .env
# edit .env and set SARVAM_API_KEY
docker compose up -d --build
```

The app listens on port 3000 inside the container. Set `HOST_PORT` in `.env` if the VPS needs another port, then put HTTPS in front of it with the VPS reverse proxy.

## Checks

```bash
npm run check
```

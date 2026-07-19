# Sputo — Producer Feedback Slice

A producer tooling interface for working with screenplay PDFs.

## Setup

1. Copy `.env.example` to `server/.env` and fill in your API keys.
2. Install dependencies:
   ```
   cd server && npm install
   cd ../client && npm install
   ```

## Running

Start the API server (port 3001):
```
cd server && npm run dev
```

Start the frontend (port 5173):
```
cd client && npm run dev
```

Open http://localhost:5173.

## Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (via better-sqlite3)
- **LLM**: Anthropic Claude
- **Image/video generation**: Replicate

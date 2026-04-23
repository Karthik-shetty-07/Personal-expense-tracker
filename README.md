# AI-Powered Personal Expense Tracker

A full-stack financial application with real-time updates and RAG-powered AI insights.

## Tech Stack
- **Frontend**: React (Vite), Tailwind CSS, Zustand, Recharts, Socket.io-client
- **Backend**: Node.js (Express), MongoDB, Socket.io, JWT
- **AI/RAG**: LangChain, FAISS, Groq/OpenAI

## Getting Started

### 1. Requirements
- Node.js >= 18
- MongoDB running locally (default: `mongodb://localhost:27017/expense-tracker`)
- An API Key from Groq (recommended) or OpenAI

### 2. Setup

Install dependencies for both server and client:
```bash
cd server && npm install
cd ../client && npm install
```

Configure environment variables:
```bash
cp .env.example .env
```
Edit `.env` to include your `GROQ_API_KEY` or `OPENAI_API_KEY`.

### 3. Seed Database (Optional)
Populate the database with sample transactions for the demo user:
```bash
cd server && npm run seed
```

### 4. Running Locally

Start the backend:
```bash
cd server && npm run dev
```

Start the frontend (in a new terminal):
```bash
cd client && npm run dev
```

The app will be available at http://localhost:5173.

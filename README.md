# Personal Expense Tracker

A modern, AI-assisted personal finance dashboard built with React, Node.js, and real-time web features. The application helps users track income and expenses, visualize spending patterns, and ask an AI assistant for personalized financial insights.

## Tech Stack at a Glance

- Frontend: React, Vite, React Router, Zustand, Recharts, Tailwind CSS
- Backend: Node.js, Express, JWT, Socket.IO
- Data: MongoDB support with a local JSON fallback for easy setup
- AI: Groq-powered insights with a built-in fallback response system

## Project Overview

This project was designed as a practical full-stack application that combines everyday expense tracking with intelligent financial analysis. It allows users to:

- Register and log in securely
- Add, view, and delete income and expense transactions
- Monitor financial balance, income, and spending trends
- Explore spending through charts and summaries
- Ask an AI assistant questions about their finances
- Receive real-time updates when new transactions are added

The app is built to feel like a polished personal finance tool while remaining lightweight enough for local development and demos.

## Key Features

### 1. Secure Authentication
- User registration and login
- JWT-based authentication
- Protected routes for authenticated users

### 2. Transaction Management
- Add new income or expense entries
- Categorize transactions
- Search recent transactions
- Delete transactions easily

### 3. Financial Dashboard
- Overview cards for balance, income, and expenses
- Spending and category visualizations
- Recent transaction history

### 4. AI Financial Assistant
- Ask questions such as “What was my biggest expense?” or “How much did I spend on food?”
- Get AI-driven insights based on the user’s transaction history
- Supports streaming responses for a conversational experience

### 5. Real-Time Updates
- WebSocket-based live updates when transactions change
- Instant reflection of newly added or deleted transactions

## Tech Stack

### Frontend
- React 19
- Vite
- React Router
- Zustand for state management
- Recharts for charts
- Tailwind CSS for styling
- Socket.IO client for live updates

### Backend
- Node.js + Express
- JWT authentication
- Zod for input validation
- Helmet, CORS, rate limiting, sanitization, and compression for security and performance
- Socket.IO for real-time communication

### Data Layer
- MongoDB support when configured
- Automatic local JSON fallback database for easy setup and demo use

### AI Integration
- Groq API support for intelligent financial responses
- Fallback local advisor when no API key is configured

## Architecture Summary

The application follows a simple full-stack architecture:

- Frontend: React app that renders the dashboard, forms, charts, and AI chat panel
- Backend: Express API that handles authentication, transactions, and AI logic
- Real-Time Layer: Socket.IO for live transaction updates
- Data Layer: MongoDB or a local JSON-based fallback database

## Project Structure

```text
client/           # React frontend
  src/            # App pages, components, services, store
server/           # Express backend and API routes
  db.js           # Database connection and models
  routes.js       # API route definitions
  services.js     # AI logic, sockets, and financial context builders
  seed.js         # Demo data seeding script
```

## Installation and Setup

### Requirements
- Node.js 18 or newer
- npm

### 1. Install dependencies

From the project root:

```bash
npm run install:all
```

This installs dependencies for both the server and the client.

### 2. Configure environment variables

Create a `.env` file inside the server folder with the following values:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=30d
MONGO_URI=your_mongodb_connection_string
GROQ_API_KEY=your_groq_api_key
LLM_MODEL=llama-3.3-70b-versatile
```

Notes:
- If `MONGO_URI` is missing or left as a placeholder, the server will automatically fall back to the local JSON database in the server folder.
- If `GROQ_API_KEY` is not provided, the AI features will still work using a built-in local fallback response generator.

### 3. Seed demo data (optional but recommended)

To populate the app with sample users and transactions:

```bash
npm run seed
```

This creates demo accounts and realistic transactions for presentation purposes.

### 4. Run the app locally

Start the backend:

```bash
npm run dev:server
```

Start the frontend in a new terminal:

```bash
npm run dev:client
```

Open the app in your browser at:

```text
http://localhost:5173
```

## Demo Accounts

The seed script creates these demo users:

- Email: `ava@example.com`  Password: `Password123!`
- Email: `marcus@example.com`  Password: `Password123!`
- Email: `testuser@example.com`  Password: `Secret123`

## API Overview

The backend exposes a set of REST endpoints for authentication, transactions, and AI features.

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Transactions
- `GET /api/transactions`
- `POST /api/transactions`
- `DELETE /api/transactions/:id`

### AI Insights
- `POST /api/ai/insights`
- `POST /api/ai/query`
- `POST /api/ai/ask`

## Presentation Highlights

This project demonstrates:
- A complete full-stack web application workflow
- Secure user authentication and protected routes
- Interactive financial data visualization
- Real-time updates using WebSockets
- AI-powered financial assistance with practical, user-focused insights

## Future Enhancements

Potential next steps for the project include:
- Monthly budget goals and alerts
- Recurring transaction support
- Exporting reports as CSV/PDF
- Advanced analytics and trend forecasting
- Multi-currency support

## Summary

The Personal Expense Tracker is a polished demo-ready application that combines core finance management features with AI-driven insights in a single, modern experience. It is well suited for showcasing full-stack development, real-time systems, and practical AI integration in a presentation setting.
User

↓

React Frontend

↓

Express REST API

↓

JWT Authentication

↓

MongoDB

↓

LangChain

↓

FAISS

↓

Groq/OpenAI

↓

AI Response
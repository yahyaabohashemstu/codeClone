# CodeClone

Enterprise code similarity analysis platform powered by AI.

## Features

- **Multi-language clone detection** -- supports Python, JavaScript, Java, C/C++, and more
- **AI-powered analysis** -- Mistral LLM integration for intelligent code review and explanations
- **BERT semantic similarity** -- deep learning embeddings for meaning-aware comparison
- **Enterprise workspaces** -- team-based code review with role-based access control
- **PDF report generation** -- exportable analysis reports with charts and metrics
- **Bilingual UI** -- full English and Arabic (RTL) interface support

## Architecture

```
CodeClone/
  app.py                  # Flask backend (REST API, auth, analysis engine)
  api.py                  # API helper utilities
  enterprise_platform/    # Enterprise features (workspaces, cases, scans)
  code-sleuth-react-ui/   # React 18 frontend (Vite + TypeScript + Tailwind)
  templates/              # Legacy Jinja2 templates (Flask-served pages)
  static/                 # Legacy static assets
  functions/              # Deprecated Netlify serverless function
```

**Backend:** Flask + SQLAlchemy + Flask-Login + Waitress WSGI server

**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Recharts

**Enterprise:** Workspace management, review cases, encrypted data storage

## Prerequisites

- Python 3.11+
- Node.js 20+
- 2 GB+ RAM (BERT model loading)

## Quick Start

```bash
# Backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Edit with your settings
python app.py

# Frontend (development)
cd code-sleuth-react-ui
npm install
npm run dev
```

The frontend dev server proxies `/api` requests to the Flask backend on port 5000.
Open `http://localhost:8080` in your browser.

## Environment Variables

See `.env.example` for all available configuration options. Key variables:

| Variable | Description | Default |
|---|---|---|
| `FLASK_SECRET_KEY` | Session signing key | Auto-generated |
| `PORT` | HTTP server port | `5000` |
| `MISTRAL_API_KEY` | Mistral AI API key | None |
| `DEFAULT_ADMIN_PASSWORD` | Initial admin password (min 12 chars) | None |
| `ENTERPRISE_DATA_KEY` | Encryption key for enterprise data | None |
| `VITE_API_BASE_URL` | API base URL for production frontend | Empty (same-origin) |

## Deployment

The frontend and backend are deployed separately:

**Frontend (Netlify / Vercel):**

- Static build from `code-sleuth-react-ui/`
- Configure `VITE_API_BASE_URL` to point to your backend
- See `netlify.toml` for Netlify configuration

**Backend (Railway / Render / Docker):**

- Deploy the Flask application (`app.py`)
- Set environment variables from `.env.example`
- Ensure `instance/` directory is writable (SQLite database + key storage)
- Use Waitress as the WSGI server (included in `requirements.txt`)

## Project Structure

```
CodeClone/
├── app.py                     # Main Flask application
├── api.py                     # API utilities
├── wsgi.py                    # WSGI entry point
├── requirements.txt           # Python dependencies
├── .env.example               # Environment variable template
├── netlify.toml               # Netlify deployment config
├── enterprise_platform/       # Enterprise module
│   ├── models.py              #   Database models
│   ├── routes.py              #   API routes
│   ├── services.py            #   Business logic
│   ├── scans.py               #   Code scanning engine
│   └── utils.py               #   Shared utilities
├── code-sleuth-react-ui/      # React frontend
│   ├── src/
│   │   ├── components/        #   UI components (common, layout, ui, upload, results)
│   │   ├── context/           #   React contexts (Auth, Theme, Language, Analysis)
│   │   ├── hooks/             #   Custom React hooks
│   │   ├── lib/               #   Utilities and API client
│   │   ├── pages/             #   Route pages
│   │   │   └── enterprise/    #   Enterprise pages
│   │   └── types/             #   TypeScript type definitions
│   ├── vite.config.ts         #   Vite configuration
│   └── tsconfig.app.json      #   TypeScript configuration
├── templates/                 # Legacy Jinja2 templates
├── static/                    # Legacy static assets
└── instance/                  # Runtime data (SQLite DB, keys)
```

## License

All rights reserved.

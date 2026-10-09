# EDABIP Insights

An individual full-stack enterprise analytics prototype built with React, Flask, MySQL, and Socket.IO. It includes JWT authentication and role-based access, interactive analytics, filtered metric management and CSV export/import, profile settings, dark mode, a collapsible sidebar, admin user management, and a live-activity feed.

## Requirements

- Python 3.10 or newer
- Node.js 20.19+ (or 22.12+) and npm
- MySQL 8+

## 1. Configure MySQL and the backend

Create a MySQL account that can create and update the `edabip_mini` database. The backend creates the database and tables on startup. The seed script can create the database as well.

From the repository root, create and activate a virtual environment, then install the backend requirements:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

Set database settings in the PowerShell session before starting the backend. Adjust the values to match your local MySQL installation:

```powershell
$env:DB_HOST = "localhost"
$env:DB_PORT = "3306"
$env:DB_USER = "root"
$env:DB_PASSWORD = "your-local-mysql-password"
$env:DB_NAME = "edabip_mini"
$env:JWT_SECRET_KEY = "replace-with-a-long-random-development-secret"
$env:PORT = "5001"
$env:FLASK_DEBUG = "true"
```

Seed the five departments, three demo users, and 240 sample metric records covering the last 12 calendar months. Seeding is safe to rerun: it does not duplicate the sample records.

```powershell
Set-Location backend
python seed.py
python app.py
```

The API listens on `http://127.0.0.1:5001` by default. If that port is already in use, stop the existing backend process or set `$env:PORT` to another free port before starting the backend. Keep the frontend API URL in sync with the chosen port.

Demo accounts created by `seed.py`:

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@edabip.com` | `admin123` |
| Analyst | `analyst@edabip.com` | `analyst123` |
| Viewer | `viewer@edabip.com` | `viewer123` |

These are local demo credentials only. Do not use them or the development JWT secret in a deployed environment.

## 2. Start the frontend

In a second terminal, from the repository root:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). `frontend/.env` sets `VITE_API_BASE_URL=http://127.0.0.1:5001`. Change that value to match `PORT` if the backend is moved, then restart Vite so it reloads the environment.

## Features

- **Authentication:** JWT login, registration API, token revocation on logout, profile retrieval and updates, and server-enforced roles.
- **Analytics dashboard:** date and department filters; total value, current-month record count, most-active department and month-on-month KPIs with green/red comparison indicators; CSV export of filtered metrics; monthly trend, department bar and share charts, and top-five metric ranking.
- **Data management:** admin/analyst-only metric entry and CSV bulk upload, first-five-row preview, server validation, searchable and filterable paginated records, and admin-only deletion.
- **Activity:** metric writes and profile changes are recorded in the same transaction as the write; committed events are delivered to authenticated administrator sessions over Socket.IO.
- **User administration:** administrators can review accounts and change other users' roles. Self-demotion and demotion of the last administrator are blocked; role changes are activity-logged.
- **Profile:** editable name, avatar upload (PNG/JPG/WEBP, up to 5 MB), and password change requiring the current password.
- **Presentation:** collapsible, persisted sidebar; persisted light/dark theme; responsive layout; accessible chart-entry animation that respects reduced-motion preferences; loading states, accessible form feedback, and success/error toasts.

CSV files must contain these headers (case-insensitive): `department,metric_name,metric_value,recorded_on`. Dates must use `YYYY-MM-DD`, department names must match a seeded department, and each upload is validated before any records are committed. A file can contain at most 10,000 data rows.

## API overview

All routes other than registration and login require a JWT. The refresh endpoint requires a refresh token; the remaining protected routes require an access token in `Authorization: Bearer <token>`.

| Method | Path | Access |
| --- | --- | --- |
| POST | `/api/register` | Public; new accounts are viewers |
| POST | `/api/login` | Public |
| POST | `/api/refresh` | Refresh token |
| GET | `/api/logout` | Authenticated |
| GET / PUT | `/api/me` | Authenticated |
| POST | `/api/me/avatar` | Authenticated |
| GET | `/api/departments` | Authenticated |
| GET | `/api/kpis` | Authenticated |
| GET | `/api/metrics/trend` | Authenticated |
| GET | `/api/metrics/by-department` | Authenticated |
| GET | `/api/metrics/top` | Authenticated |
| GET | `/api/metrics` | Authenticated |
| GET | `/api/metrics/export` | Authenticated |
| POST | `/api/metrics` | Admin or analyst |
| POST | `/api/metrics/upload` | Admin or analyst |
| DELETE | `/api/metrics/<id>` | Admin |
| GET | `/api/activity` | Admin |
| GET | `/api/users` | Admin |
| PUT | `/api/users/<id>/role` | Admin |

Analytics and records accept applicable `department`, `from`, and `to` query parameters. Record listing also accepts `page`, `limit` (1–100), and `search`. CSV export accepts the same department/date filters and an optional `search` value.

## Checks

Run these from the repository root:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py"
Set-Location frontend
npm test
npm run lint
npm run build
```

The automated backend tests cover date filters, admin-only user access, safe filtered CSV export, and protected role changes. Frontend tests cover CSV parsing and KPI trend indicators. For an end-to-end check, run MySQL, seed the database, start the backend and Vite, and verify the administrator, analyst, and viewer flows in separate browser sessions.

## Demo recording and write-up checklist

The recording and final submission must be captured and submitted from your own browser/GitHub account. Suggested screen-recording flow:

1. Sign in as the administrator; change a dashboard filter and show the KPI cards and charts updating, then export the filtered metrics CSV.
2. Open Data Management, preview and upload a valid CSV; show the live notification and activity feed update without refreshing, then return to the dashboard and show refreshed KPIs.
3. Open User Management; review users and demonstrate an allowed role change without changing the current administrator's role or demoting the last administrator.
4. Collapse and expand the sidebar, switch the theme, and demonstrate responsive layout.
5. Log out, sign in as the viewer, and show that Data Management displays the 403 access-denied page.

**Project write-up:** This prototype turns department-level metric records into filtered, monthly analytics. Flask provides JWT-protected JSON endpoints and persists data in MySQL; React consumes those endpoints, renders the charts, and applies role-aware navigation. Socket.IO delivers committed activity events to administrator clients. CSV uploads are validated as a batch so invalid data does not leave a partial import. Before production use, replace demo credentials and development secrets, restrict CORS, and deploy behind HTTPS with production-grade server configuration.

import csv
import jwt as pyjwt
from functools import wraps
import os
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from io import StringIO
from pathlib import Path
from uuid import uuid4

import mysql.connector
from flask import Flask, jsonify, request
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from flask_jwt_extended import decode_token
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)
from flask_socketio import SocketIO, emit, join_room
from werkzeug.utils import secure_filename

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "edabip_mini"),
    "autocommit": True,
    "charset": "utf8mb4",
}

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config["JWT_SECRET_KEY"] = os.getenv(
    "JWT_SECRET_KEY",
    "development-only-change-this-secret-before-deployment",
)
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=8)
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=7)
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024
app.config["UPLOAD_FOLDER"] = str(Path(__file__).parent / "static" / "uploads")

jwt = JWTManager(app)
bcrypt_obj = Bcrypt(app)
socketio = SocketIO(app, cors_allowed_origins="*")


def get_db_connection(transactional=False):
    conn = mysql.connector.connect(**DB_CONFIG)
    if transactional:
        conn.autocommit = False
    return conn


def ensure_schema():
    conn = mysql.connector.connect(**{key: value for key, value in DB_CONFIG.items() if key != "database"})
    cursor = conn.cursor()
    database_name = DB_CONFIG["database"]
    if not database_name.replace("_", "").isalnum():
        cursor.close()
        conn.close()
        raise ValueError("DB_NAME may contain only letters, numbers, and underscores")
    cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{database_name}`")
    cursor.execute(f"USE `{database_name}`")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role ENUM('admin','analyst','viewer') DEFAULT 'viewer',
            avatar_url VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS departments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(50) NOT NULL UNIQUE
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS metrics (
            id INT AUTO_INCREMENT PRIMARY KEY,
            department_id INT NOT NULL,
            metric_name VARCHAR(100) NOT NULL,
            metric_value DECIMAL(15,2) NOT NULL,
            recorded_on DATE NOT NULL,
            uploaded_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (department_id) REFERENCES departments(id),
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS activity_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            action VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS revoked_tokens (
            jti VARCHAR(36) PRIMARY KEY,
            revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute("SELECT COUNT(*) FROM departments")
    if cursor.fetchone()[0] == 0:
        departments = ["Sales", "Marketing", "HR", "Finance", "Operations"]
        values = [(name,) for name in departments]
        cursor.executemany("INSERT INTO departments (name) VALUES (%s)", values)
    conn.commit()
    cursor.close()
    conn.close()


def parse_date(value, parameter_name):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError(f"{parameter_name} must use YYYY-MM-DD format") from exc


def get_date_filters():
    start_date = parse_date(request.args.get("from"), "from")
    end_date = parse_date(request.args.get("to"), "to")
    if start_date and end_date and start_date > end_date:
        raise ValueError("'from' date must be on or before 'to' date")
    return start_date, end_date


def metric_filter_sql(department=None, start_date=None, end_date=None, alias="m"):
    conditions = []
    params = []
    if department:
        conditions.append("d.name = %s")
        params.append(department)
    if start_date:
        conditions.append(f"{alias}.recorded_on >= %s")
        params.append(start_date)
    if end_date:
        conditions.append(f"{alias}.recorded_on <= %s")
        params.append(end_date)
    return (" AND ".join(conditions), params)


def record_activity(cursor, user, action):
    cursor.execute("INSERT INTO activity_log (user_id, action) VALUES (%s, %s)", (user["id"], action))
    return {
        "id": cursor.lastrowid,
        "user_id": user["id"],
        "user_name": user["name"],
        "action": action,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def publish_activity(event):
    socketio.emit("activity_update", event, to="admins")


def get_current_user():
    current_user_id = get_jwt_identity()
    try:
        current_user_id = int(current_user_id)
    except (TypeError, ValueError):
        return None
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE id = %s", (current_user_id,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    if not user:
        return None
    user.pop("password", None)
    return user


@jwt.token_in_blocklist_loader
def is_token_revoked(_header, payload):
    del _header
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM revoked_tokens WHERE jti = %s", (payload["jti"],))
    revoked = cursor.fetchone() is not None
    cursor.close()
    conn.close()
    return revoked


def role_allowed(*allowed_roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            current_user = get_current_user()
            if not current_user:
                return jsonify({"error": "Authentication required"}), 401
            if current_user["role"] not in allowed_roles:
                return jsonify({"error": "Forbidden"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


@app.route("/api/register", methods=["POST"])
def register():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400
    name = payload.get("name")
    email = payload.get("email")
    password = payload.get("password")
    if not isinstance(name, str) or not isinstance(email, str) or not isinstance(password, str):
        return jsonify({"error": "Name, email, and password must be text"}), 400
    name = name.strip()
    email = email.strip().lower()
    if (
        not name
        or len(name) > 100
        or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)
        or len(email) > 100
        or len(password) < 6
    ):
        return jsonify({"error": "Name, valid email, and password (6+ chars) are required"}), 400
    role = "viewer"
    conn = get_db_connection(transactional=True)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            return jsonify({"error": "Email already exists"}), 409
        hashed = bcrypt_obj.generate_password_hash(password).decode("utf-8")
        cursor.execute(
            "INSERT INTO users (name, email, password, role) VALUES (%s, %s, %s, %s)",
            (name, email, hashed, role),
        )
        user_id = cursor.lastrowid
        event = record_activity(cursor, {"id": user_id, "name": name}, f"{name} registered to the platform")
        conn.commit()
        publish_activity(event)
        access_token = create_access_token(identity=str(user_id))
        refresh_token = create_refresh_token(identity=str(user_id))
        return jsonify({"access_token": access_token, "refresh_token": refresh_token, "user": {"id": user_id, "name": name, "email": email, "role": role}}), 201
    except Exception:
        conn.rollback()
        app.logger.exception("Failed to register user")
        return jsonify({"error": "Could not register user"}), 500
    finally:
        cursor.close(); conn.close()


@app.route("/api/login", methods=["POST"])
def login():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400
    email = payload.get("email")
    password = payload.get("password")
    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({"error": "Email and password must be text"}), 400
    email = email.strip().lower()
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    if not user or not bcrypt_obj.check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid email or password"}), 401
    access_token = create_access_token(identity=str(user["id"]))
    refresh_token = create_refresh_token(identity=str(user["id"]))
    user.pop("password", None)
    return jsonify({"access_token": access_token, "refresh_token": refresh_token, "user": user})


@app.route("/api/logout", methods=["GET"])
@jwt_required()
def logout():
    token = get_jwt()
    conn = get_db_connection(transactional=True)
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO revoked_tokens (jti) VALUES (%s)", (token["jti"],))
        conn.commit()
    except Exception:
        conn.rollback()
        app.logger.exception("Failed to revoke access token")
        return jsonify({"error": "Could not log out"}), 500
    finally:
        cursor.close()
        conn.close()
    return jsonify({"message": "Logged out successfully"})


@app.route("/api/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh_access_token():
    return jsonify({"access_token": create_access_token(identity=str(get_jwt_identity()))})


@app.route("/api/me", methods=["GET"])
@jwt_required()
def get_current_profile():
    user = get_current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user})


@app.route("/api/me", methods=["PUT"])
@jwt_required()
def update_profile():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400
    user = get_current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    name = payload.get("name", user["name"])
    if not isinstance(name, str):
        return jsonify({"error": "Name must be text"}), 400
    name = name.strip()
    if not name or len(name) > 100:
        return jsonify({"error": "Name must contain 1 to 100 characters"}), 400
    current_password = payload.get("current_password")
    new_password = payload.get("new_password")
    if new_password:
        if not isinstance(current_password, str) or not isinstance(new_password, str):
            return jsonify({"error": "Current and new passwords must be text"}), 400
        conn = get_db_connection()
        password_cursor = conn.cursor()
        password_cursor.execute("SELECT password FROM users WHERE id = %s", (user["id"],))
        password_row = password_cursor.fetchone()
        password_cursor.close()
        conn.close()
        if not current_password or not password_row or not bcrypt_obj.check_password_hash(password_row[0], current_password):
            return jsonify({"error": "Current password is incorrect"}), 400
        if len(new_password) < 8:
            return jsonify({"error": "New password must be at least 8 characters"}), 400
    conn = get_db_connection(transactional=True)
    cursor = conn.cursor()
    try:
        if new_password:
            hashed = bcrypt_obj.generate_password_hash(new_password).decode("utf-8")
            cursor.execute(
                "UPDATE users SET name = %s, password = %s WHERE id = %s",
                (name, hashed, user["id"]),
            )
        else:
            cursor.execute("UPDATE users SET name = %s WHERE id = %s", (name, user["id"]))
        event = record_activity(cursor, user, f"{name} updated their profile")
        conn.commit()
        publish_activity(event)
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
    return jsonify({"message": "Profile updated", "user": {**user, "name": name}})


@app.route("/api/me/avatar", methods=["POST"])
@jwt_required()
def upload_avatar():
    user = get_current_user()
    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        return jsonify({"error": "Select an image to upload"}), 400
    extension = Path(secure_filename(uploaded_file.filename)).suffix.lower()
    allowed_signatures = {
        ".png": b"\x89PNG\r\n\x1a\n",
        ".jpg": b"\xff\xd8\xff",
        ".jpeg": b"\xff\xd8\xff",
        ".webp": b"RIFF",
    }
    signature = uploaded_file.stream.read(12)
    uploaded_file.stream.seek(0)
    if extension not in allowed_signatures or not signature.startswith(allowed_signatures[extension]):
        return jsonify({"error": "Avatar must be a valid PNG, JPG, or WEBP image"}), 400
    if extension == ".webp" and signature[8:12] != b"WEBP":
        return jsonify({"error": "Avatar must be a valid WEBP image"}), 400
    upload_dir = Path(app.config["UPLOAD_FOLDER"])
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    uploaded_file.save(upload_dir / filename)
    avatar_url = f"/static/uploads/{filename}"
    conn = get_db_connection(transactional=True)
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE users SET avatar_url = %s WHERE id = %s", (avatar_url, user["id"]))
        event = record_activity(cursor, user, f"{user['name']} updated their profile photo")
        conn.commit()
    except Exception:
        conn.rollback()
        (upload_dir / filename).unlink(missing_ok=True)
        app.logger.exception("Failed to update profile avatar")
        return jsonify({"error": "Could not update profile photo"}), 500
    finally:
        cursor.close()
        conn.close()
    publish_activity(event)
    return jsonify({"avatar_url": avatar_url})


@app.route("/api/departments", methods=["GET"])
@jwt_required()
def list_departments():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM departments ORDER BY name")
    departments = [row[0] for row in cursor.fetchall()]
    cursor.close()
    conn.close()
    return jsonify(departments)


@app.route("/api/kpis", methods=["GET"])
@jwt_required()
def get_kpis():
    department = request.args.get("department")
    try:
        start_date, end_date = get_date_filters()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    filters, params = metric_filter_sql(department, start_date, end_date)
    where_clause = f" WHERE {filters}" if filters else ""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT COALESCE(SUM(m.metric_value), 0) AS total_value, COUNT(*) AS total_records "
        "FROM metrics m JOIN departments d ON d.id = m.department_id" + where_clause,
        tuple(params),
    )
    totals = cursor.fetchone()
    cursor.execute(
        "SELECT d.name, COUNT(*) AS count FROM metrics m "
        "JOIN departments d ON d.id = m.department_id" + where_clause
        + " GROUP BY d.name ORDER BY count DESC, d.name LIMIT 1",
        tuple(params),
    )
    active = cursor.fetchone()

    today = date.today()
    this_month_start = today.replace(day=1)
    next_month_start = (this_month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)
    month_filter = " AND ".join(
        clause for clause in (
            "d.name = %s" if department else None,
            "m.recorded_on >= %s" if start_date else None,
            "m.recorded_on <= %s" if end_date else None,
        ) if clause
    )
    month_filter = f" AND {month_filter}" if month_filter else ""
    month_params = []
    if department:
        month_params.append(department)
    if start_date:
        month_params.append(start_date)
    if end_date:
        month_params.append(end_date)
    base_month_query = (
        "SELECT COALESCE(SUM(m.metric_value), 0) AS value, COUNT(*) AS records "
        "FROM metrics m JOIN departments d ON d.id = m.department_id "
        "WHERE m.recorded_on >= %s AND m.recorded_on < %s"
    ) + month_filter
    cursor.execute(base_month_query, (this_month_start, next_month_start, *month_params))
    current_month = cursor.fetchone()
    cursor.execute(base_month_query, (last_month_start, this_month_start, *month_params))
    previous_month = cursor.fetchone()
    cursor.close()
    conn.close()

    current_value = float(current_month["value"] or 0)
    previous_value = float(previous_month["value"] or 0)
    change = (current_value - previous_value) / previous_value * 100 if previous_value else 0
    return jsonify({
        "total_metric_value": float(totals["total_value"] or 0),
        "total_records": int(totals["total_records"] or 0),
        "records_this_month": int(current_month["records"] or 0),
        "most_active_department": {
            "name": active["name"] if active else "N/A",
            "count": int(active["count"]) if active else 0,
        },
        "month_over_month_change": round(change, 2),
        "this_month_value": current_value,
        "last_month_value": previous_value,
    })


@app.route("/api/metrics/trend", methods=["GET"])
@jwt_required()
def metrics_trend():
    department = request.args.get("department")
    metric_name = request.args.get("metric_name")
    try:
        start_date, end_date = get_date_filters()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    today = date.today()
    first_month = today.replace(day=1)
    for _ in range(11):
        first_month = (first_month - timedelta(days=1)).replace(day=1)
    lower_bound = start_date or first_month
    upper_bound = end_date or today
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    query = (
        "SELECT DATE_FORMAT(m.recorded_on, '%Y-%m') AS month, "
        "SUM(m.metric_value) AS value FROM metrics m "
        "JOIN departments d ON d.id = m.department_id WHERE m.recorded_on >= %s AND m.recorded_on <= %s"
    )
    params = [lower_bound, upper_bound]
    if department:
        query += " AND d.name = %s"
        params.append(department)
    if metric_name:
        query += " AND m.metric_name = %s"
        params.append(metric_name)
    query += " GROUP BY DATE_FORMAT(m.recorded_on, '%Y-%m') ORDER BY month ASC"
    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    values = {row["month"]: float(row["value"] or 0) for row in rows}
    months = []
    current = lower_bound.replace(day=1)
    last = upper_bound.replace(day=1)
    while current <= last:
        key = current.strftime("%Y-%m")
        months.append({"month": key, "value": values.get(key, 0)})
        current = (current.replace(day=28) + timedelta(days=4)).replace(day=1)
    return jsonify(months)


@app.route("/api/metrics/by-department", methods=["GET"])
@jwt_required()
def metrics_by_department():
    department = request.args.get("department")
    try:
        start_date, end_date = get_date_filters()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    join_filters = []
    join_params = []
    if start_date:
        join_filters.append("m.recorded_on >= %s")
        join_params.append(start_date)
    if end_date:
        join_filters.append("m.recorded_on <= %s")
        join_params.append(end_date)
    join_clause = " AND " + " AND ".join(join_filters) if join_filters else ""
    query = (
        "SELECT d.name AS department, COALESCE(SUM(m.metric_value), 0) AS value "
        "FROM departments d LEFT JOIN metrics m ON m.department_id = d.id" + join_clause
    )
    params = join_params
    if department:
        query += " WHERE d.name = %s"
        params.append(department)
    query += " GROUP BY d.id, d.name ORDER BY value DESC"
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


@app.route("/api/metrics/top", methods=["GET"])
@jwt_required()
def top_metrics():
    department = request.args.get("department")
    try:
        start_date, end_date = get_date_filters()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    filters, params = metric_filter_sql(department, start_date, end_date)
    where_clause = f" WHERE {filters}" if filters else ""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT m.metric_name, SUM(m.metric_value) AS total_value FROM metrics m "
        "JOIN departments d ON d.id = m.department_id" + where_clause
        + " GROUP BY m.metric_name ORDER BY total_value DESC LIMIT 5",
        tuple(params),
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    for row in rows:
        row["total_value"] = float(row["total_value"] or 0)
    return jsonify(rows)


@app.route("/api/metrics", methods=["GET"])
@jwt_required()
def list_metrics():
    try:
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 10))
        start_date, end_date = get_date_filters()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if page < 1 or not 1 <= limit <= 100:
        return jsonify({"error": "page must be positive and limit must be between 1 and 100"}), 400
    department = request.args.get("department")
    search = (request.args.get("search") or "").strip()
    if len(search) > 100:
        return jsonify({"error": "search must be 100 characters or fewer"}), 400
    offset = (page - 1) * limit
    query = (
        "SELECT m.id, m.department_id, m.metric_name, m.metric_value, "
        "DATE_FORMAT(m.recorded_on, '%Y-%m-%d') AS recorded_on, m.uploaded_by, "
        "m.created_at, d.name AS department_name, u.name AS uploaded_by_name "
        "FROM metrics m JOIN departments d ON d.id = m.department_id "
        "JOIN users u ON u.id = m.uploaded_by WHERE 1=1"
    )
    params = []
    if department:
        query += " AND d.name = %s"
        params.append(department)
    if start_date:
        query += " AND m.recorded_on >= %s"
        params.append(start_date)
    if end_date:
        query += " AND m.recorded_on <= %s"
        params.append(end_date)
    if search:
        query += " AND m.metric_name LIKE %s"
        params.append(f"%{search}%")
    count_query = "SELECT COUNT(*) AS total FROM " + query.split(" FROM ", 1)[1]
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(count_query, tuple(params))
    total = cursor.fetchone()["total"]
    query += " ORDER BY m.recorded_on DESC LIMIT %s OFFSET %s"
    page_params = [*params, limit, offset]
    cursor.execute(query, tuple(page_params))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify({
        "items": rows,
        "page": page,
        "limit": limit,
        "total": total,
        "pages": max(1, (total + limit - 1) // limit),
    })


@app.route("/api/metrics", methods=["POST"])
@jwt_required()
@role_allowed("admin", "analyst")
def add_metric():
    payload = request.get_json(silent=True) or {}
    department_name = payload.get("department")
    metric_name = payload.get("metric_name")
    if not isinstance(department_name, str) or not isinstance(metric_name, str):
        return jsonify({"error": "Department and metric name must be text"}), 400
    department_name = department_name.strip()
    metric_name = metric_name.strip()
    if not department_name or not metric_name or len(metric_name) > 100:
        return jsonify({"error": "Department, metric name, value, and recorded_on are required"}), 400
    try:
        metric_value = Decimal(str(payload.get("metric_value")))
        recorded_on = parse_date(payload.get("recorded_on"), "recorded_on")
        if not metric_value.is_finite() or abs(metric_value) >= Decimal("10000000000000"):
            raise InvalidOperation
    except (InvalidOperation, ValueError, TypeError):
        return jsonify({"error": "metric_value must be a finite number and recorded_on must be YYYY-MM-DD"}), 400
    if recorded_on is None:
        return jsonify({"error": "recorded_on is required"}), 400
    user = get_current_user()
    conn = get_db_connection(transactional=True)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM departments WHERE name = %s", (department_name,))
        department = cursor.fetchone()
        if not department:
            return jsonify({"error": "Department not found"}), 404
        cursor.execute(
            "INSERT INTO metrics (department_id, metric_name, metric_value, recorded_on, uploaded_by) VALUES (%s, %s, %s, %s, %s)",
            (department[0], metric_name, metric_value, recorded_on, user["id"]),
        )
        metric_id = cursor.lastrowid
        event = record_activity(cursor, user, f"{user['name']} added metric #{metric_id} ({metric_name})")
        conn.commit()
        publish_activity(event)
        return jsonify({"message": "Metric added", "id": metric_id}), 201
    except Exception:
        conn.rollback()
        app.logger.exception("Failed to add metric")
        return jsonify({"error": "Could not add metric"}), 500
    finally:
        cursor.close()
        conn.close()


@app.route("/api/metrics/upload", methods=["POST"])
@jwt_required()
@role_allowed("admin", "analyst")
def upload_metrics():
    if "file" not in request.files:
        return jsonify({"error": "CSV file is required"}), 400
    file = request.files["file"]
    if not file.filename or Path(secure_filename(file.filename)).suffix.lower() != ".csv":
        return jsonify({"error": "Only CSV files are allowed"}), 400
    try:
        stream = StringIO(file.read().decode("utf-8-sig"))
    except UnicodeDecodeError:
        return jsonify({"error": "CSV must be UTF-8 encoded"}), 400
    reader = csv.DictReader(stream)
    required_columns = {"department", "metric_name", "metric_value", "recorded_on"}
    if not reader.fieldnames:
        return jsonify({"error": "CSV must include department, metric_name, metric_value, recorded_on columns"}), 400
    reader.fieldnames = [field.strip().lower() for field in reader.fieldnames]
    if not required_columns.issubset(set(reader.fieldnames)):
        return jsonify({"error": "CSV must include department, metric_name, metric_value, recorded_on columns"}), 400
    parsed_rows = []
    try:
        for line_number, row in enumerate(reader, start=2):
            if line_number > 10001:
                return jsonify({"error": "CSV cannot contain more than 10000 data rows"}), 400
            if None in row:
                return jsonify({"error": f"CSV row {line_number} has extra columns"}), 400
            normalized = {key.strip().lower(): (value or "").strip() for key, value in row.items() if key}
            department_name = normalized.get("department", "")
            metric_name = normalized.get("metric_name", "")
            try:
                value = Decimal(normalized.get("metric_value", ""))
                recorded_on = parse_date(normalized.get("recorded_on"), "recorded_on")
                if not department_name or not metric_name or len(metric_name) > 100:
                    raise ValueError
                if not value.is_finite() or abs(value) >= Decimal("10000000000000") or recorded_on is None:
                    raise ValueError
            except (InvalidOperation, ValueError, TypeError):
                return jsonify({"error": f"Invalid or incomplete data on CSV row {line_number}"}), 400
            parsed_rows.append((department_name, metric_name, value, recorded_on))
    except csv.Error:
        return jsonify({"error": "CSV contains malformed quoting or delimiters"}), 400
    if not parsed_rows:
        return jsonify({"error": "CSV contains no metric records"}), 400
    user = get_current_user()
    conn = get_db_connection(transactional=True)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name FROM departments")
        departments = {name.casefold(): department_id for department_id, name in cursor.fetchall()}
        invalid_department = next(
            (row[0] for row in parsed_rows if row[0].casefold() not in departments),
            None,
        )
        if invalid_department:
            conn.rollback()
            return jsonify({"error": f"Unknown department: {invalid_department}"}), 400
        for department_name, metric_name, metric_value, recorded_on in parsed_rows:
            cursor.execute(
                "INSERT INTO metrics (department_id, metric_name, metric_value, recorded_on, uploaded_by) VALUES (%s, %s, %s, %s, %s)",
                (departments[department_name.casefold()], metric_name, metric_value, recorded_on, user["id"]),
            )
        event = record_activity(
            cursor, user, f"{user['name']} uploaded {len(parsed_rows)} metric records",
        )
        conn.commit()
        publish_activity(event)
        return jsonify({
            "message": f"{len(parsed_rows)} records uploaded successfully.",
            "records_uploaded": len(parsed_rows),
        }), 201
    except Exception:
        conn.rollback()
        app.logger.exception("Failed to upload metrics CSV")
        return jsonify({"error": "Could not upload CSV records"}), 500
    finally:
        cursor.close()
        conn.close()


@app.route("/api/metrics/<int:metric_id>", methods=["DELETE"])
@jwt_required()
@role_allowed("admin")
def delete_metric(metric_id):
    user = get_current_user()
    conn = get_db_connection(transactional=True)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM metrics WHERE id = %s", (metric_id,))
        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({"error": "Metric not found"}), 404
        event = record_activity(cursor, user, f"Admin {user['name']} deleted metric #{metric_id}")
        conn.commit()
        publish_activity(event)
        return jsonify({"message": "Metric deleted"})
    except Exception:
        conn.rollback()
        app.logger.exception("Failed to delete metric")
        return jsonify({"error": "Could not delete metric"}), 500
    finally:
        cursor.close()
        conn.close()


@app.route("/api/activity", methods=["GET"])
@jwt_required()
@role_allowed("admin")
def get_activity():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT a.id, a.action, DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at, "
        "u.name AS user_name FROM activity_log a JOIN users u ON u.id = a.user_id "
        "ORDER BY a.created_at DESC LIMIT 20"
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


@socketio.on("connect")
def handle_connect(auth=None):
    token = auth.get("token") if isinstance(auth, dict) else None
    if not isinstance(token, str) or not token:
        return False
    try:
        claims = decode_token(token)
    except pyjwt.InvalidTokenError:
        return False
    if claims.get("type") != "access":
        return False
    try:
        user_id = int(claims["sub"])
    except (KeyError, TypeError, ValueError):
        return False
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT u.role, r.jti IS NOT NULL AS revoked FROM users u "
        "LEFT JOIN revoked_tokens r ON r.jti = %s WHERE u.id = %s",
        (claims.get("jti"), user_id),
    )
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    if not user or user[0] != "admin" or user[1]:
        return False
    join_room("admins")
    emit("status", {"message": "Connected to EDABIP live feed"})


@app.errorhandler(413)
def request_too_large(_error):
    del _error
    return jsonify({"error": "Request exceeds the 5 MB upload limit"}), 413


if __name__ == "__main__":
    ensure_schema()
    socketio.run(
        app,
        debug=os.getenv("FLASK_DEBUG", "true").lower() == "true",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5001")),
        use_reloader=False,
    )

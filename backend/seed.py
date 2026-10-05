import os
from datetime import date, timedelta

import bcrypt
import mysql.connector

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', '3306')),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'charset': 'utf8mb4',
    'autocommit': True,
}


def get_connection(database_name=None):
    config = DB_CONFIG.copy()
    if database_name:
        config['database'] = database_name
    return mysql.connector.connect(**config)


def create_database_and_tables():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('CREATE DATABASE IF NOT EXISTS edabip_mini')
    cursor.execute('USE edabip_mini')
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role ENUM('admin','analyst','viewer') DEFAULT 'viewer',
            avatar_url VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        '''
    )
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS departments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(50) NOT NULL UNIQUE
        )
        '''
    )
    cursor.execute(
        '''
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
        '''
    )
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS activity_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            action VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        '''
    )
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS seed_metadata (
            seed_key VARCHAR(100) PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        '''
    )
    conn.commit(); cursor.close(); conn.close()


def seed_departments():
    conn = get_connection('edabip_mini'); cursor = conn.cursor()
    departments = ['Sales', 'Marketing', 'HR', 'Finance', 'Operations']
    for name in departments:
        cursor.execute('SELECT id FROM departments WHERE name = %s', (name,))
        if not cursor.fetchone():
            cursor.execute('INSERT INTO departments (name) VALUES (%s)', (name,))
    conn.commit(); cursor.close(); conn.close()


def seed_users():
    conn = get_connection('edabip_mini'); cursor = conn.cursor()
    users = [
        ('Admin User', 'admin@edabip.com', 'admin123', 'admin'),
        ('Analyst Elena', 'analyst@edabip.com', 'analyst123', 'analyst'),
        ('Viewer Sam', 'viewer@edabip.com', 'viewer123', 'viewer'),
    ]
    for name, email, password, role in users:
        cursor.execute('SELECT id FROM users WHERE email = %s', (email,))
        if not cursor.fetchone():
            hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            cursor.execute(
                'INSERT INTO users (name, email, password, role) VALUES (%s, %s, %s, %s)',
                (name, email, hashed, role),
            )
    conn.commit(); cursor.close(); conn.close()


def insert_metrics():
    conn = get_connection('edabip_mini')
    conn.autocommit = False
    cursor = conn.cursor()
    cursor.execute('SELECT id, name FROM departments')
    department_map = {name: department_id for department_id, name in cursor.fetchall()}
    cursor.execute('SELECT id, email FROM users')
    user_map = {email: user_id for user_id, email in cursor.fetchall()}
    cursor.execute("SELECT 1 FROM seed_metadata WHERE seed_key = 'sample_metrics_v1'")
    if cursor.fetchone():
        cursor.close(); conn.close()
        print('Sample metrics already exist; skipping metric seed.')
        return
    cursor.execute('SELECT COUNT(*) FROM metrics')
    if cursor.fetchone()[0] >= 240:
        cursor.execute("INSERT INTO seed_metadata (seed_key) VALUES ('sample_metrics_v1')")
        conn.commit()
        cursor.close(); conn.close()
        print('At least 240 metric records already exist; skipping sample metric seed.')
        return
    if len(department_map) != 5:
        cursor.close(); conn.close()
        raise RuntimeError('Expected all five departments before seeding metrics.')
    required_users = ['admin@edabip.com', 'analyst@edabip.com', 'viewer@edabip.com']
    if any(email not in user_map for email in required_users):
        cursor.close(); conn.close()
        raise RuntimeError('Seed users must be created before seeding metrics.')
    metric_names = [
        'Revenue', 'Customers', 'Retention', 'Satisfaction', 'Efficiency',
        'Pipeline', 'Forecast', 'Engagement', 'Cost', 'Conversion'
    ]
    department_names = ['Sales', 'Marketing', 'HR', 'Finance', 'Operations']
    user_ids = [user_map[email] for email in required_users]
    first_month = date.today().replace(day=1)
    for _ in range(11):
        first_month = (first_month - timedelta(days=1)).replace(day=1)
    records = []
    for index in range(240):
        month_offset = index % 12
        recorded_month = first_month
        for _ in range(month_offset):
            recorded_month = (recorded_month.replace(day=28) + timedelta(days=4)).replace(day=1)
        recorded_on = recorded_month.replace(day=1 + (index // 12) % 28)
        department_name = department_names[index % len(department_names)]
        records.append((
            department_map[department_name],
            metric_names[index % len(metric_names)],
            round(100 + (index * 7.35) % 500 + (index % 9) * 1.25, 2),
            recorded_on,
            user_ids[index % len(user_ids)],
        ))
    try:
        cursor.executemany(
            'INSERT INTO metrics (department_id, metric_name, metric_value, recorded_on, uploaded_by) VALUES (%s, %s, %s, %s, %s)',
            records,
        )
        cursor.execute("INSERT INTO seed_metadata (seed_key) VALUES ('sample_metrics_v1')")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
    print(f'Inserted {len(records)} sample metric records across 12 months.')


def fill_monthly_department_coverage():
    conn = get_connection('edabip_mini')
    conn.autocommit = False
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM seed_metadata WHERE seed_key = 'monthly_coverage_v1'")
    if cursor.fetchone():
        cursor.close(); conn.close()
        return
    cursor.execute('SELECT id, name FROM departments')
    departments = cursor.fetchall()
    cursor.execute('SELECT id, email FROM users')
    users = {email: user_id for user_id, email in cursor.fetchall()}
    admin_id = users.get('admin@edabip.com')
    if not admin_id or len(departments) != 5:
        cursor.close(); conn.close()
        raise RuntimeError('Seed users and all five departments are required for monthly coverage.')

    first_month = date.today().replace(day=1)
    for _ in range(11):
        first_month = (first_month - timedelta(days=1)).replace(day=1)
    months = []
    current_month = first_month
    for _ in range(12):
        months.append(current_month)
        current_month = (current_month.replace(day=28) + timedelta(days=4)).replace(day=1)

    cursor.execute(
        'SELECT department_id, DATE_FORMAT(recorded_on, %s) AS month '
        'FROM metrics WHERE recorded_on >= %s AND recorded_on < %s '
        'GROUP BY department_id, DATE_FORMAT(recorded_on, %s)',
        ('%Y-%m', first_month, current_month, '%Y-%m'),
    )
    existing = {(department_id, month) for department_id, month in cursor.fetchall()}
    records = []
    for month_index, month_start in enumerate(months):
        month_key = month_start.strftime('%Y-%m')
        for department_index, department in enumerate(departments):
            department_id = department[0]
            if (department_id, month_key) in existing:
                continue
            recorded_on = date.today() if month_start.month == date.today().month and month_start.year == date.today().year else month_start.replace(day=15)
            metric_name = ['Revenue', 'Engagement', 'Headcount', 'Operating Cost', 'Efficiency'][department_index]
            metric_value = round(250 + month_index * 17.5 + department_index * 41.25, 2)
            records.append((department_id, metric_name, metric_value, recorded_on, admin_id))

    try:
        if records:
            cursor.executemany(
                'INSERT INTO metrics (department_id, metric_name, metric_value, recorded_on, uploaded_by) VALUES (%s, %s, %s, %s, %s)',
                records,
            )
        cursor.execute("INSERT INTO seed_metadata (seed_key) VALUES ('monthly_coverage_v1')")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
    print(f'Added {len(records)} records to fill missing department/month combinations.')


def seed_activity_log():
    conn = get_connection('edabip_mini')
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM seed_metadata WHERE seed_key = 'sample_activity_v1'")
    if cursor.fetchone():
        cursor.close(); conn.close()
        return
    cursor.execute("SELECT id FROM users WHERE email = %s", ('admin@edabip.com',))
    admin = cursor.fetchone()
    if not admin:
        cursor.close(); conn.close()
        raise RuntimeError('Admin seed user is missing.')
    cursor.execute(
        'INSERT INTO activity_log (user_id, action) VALUES (%s, %s)',
        (admin[0], 'Admin User loaded 240 sample metric records'),
    )
    cursor.execute("INSERT INTO seed_metadata (seed_key) VALUES ('sample_activity_v1')")
    conn.commit()
    cursor.close()
    conn.close()


def main():
    create_database_and_tables()
    seed_departments()
    seed_users()
    insert_metrics()
    fill_monthly_department_coverage()
    seed_activity_log()
    print('Database seeding completed for edabip_mini.')


if __name__ == '__main__':
    main()

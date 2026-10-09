import csv
import unittest
from datetime import date
from io import StringIO
from unittest.mock import MagicMock, patch

from app import app, create_access_token, get_date_filters, jwt, metric_filter_sql, parse_date


def allow_test_token(_header, _payload):
    del _header, _payload
    return False


class DateFilterTests(unittest.TestCase):
    def test_parse_date_accepts_iso_date(self):
        self.assertEqual(parse_date("2026-10-05", "from"), date(2026, 10, 5))

    def test_parse_date_rejects_non_iso_date(self):
        with self.assertRaisesRegex(ValueError, "YYYY-MM-DD"):
            parse_date("10/05/2026", "from")

    def test_date_range_rejects_start_after_end(self):
        with app.test_request_context("/?from=2026-10-06&to=2026-10-05"):
            with self.assertRaisesRegex(ValueError, "on or before"):
                get_date_filters()

    def test_metric_filter_builder_preserves_parameter_order(self):
        conditions, params = metric_filter_sql(
            "Sales", date(2026, 1, 1), date(2026, 10, 5),
        )
        self.assertEqual(
            conditions,
            "d.name = %s AND m.recorded_on >= %s AND m.recorded_on <= %s",
        )
        self.assertEqual(params, ["Sales", date(2026, 1, 1), date(2026, 10, 5)])


class OptionalFeatureApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.original_blocklist_callback = jwt._token_in_blocklist_callback
        jwt._token_in_blocklist_callback = allow_test_token
        with app.app_context():
            token = create_access_token(identity="1")
        self.headers = {"Authorization": f"Bearer {token}"}

    def tearDown(self):
        jwt._token_in_blocklist_callback = self.original_blocklist_callback

    @patch("app.get_db_connection")
    def test_kpis_include_month_comparison_values_for_each_card(self, get_connection):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.side_effect = [
            {"total_value": 100, "total_records": 8},
            {"name": "Sales", "count": 5},
            {"value": 80, "records": 4},
            {"value": 40, "records": 2},
        ]
        cursor.fetchall.side_effect = [
            [{"name": "Sales", "count": 4}],
            [{"name": "Sales", "count": 2}],
        ]
        get_connection.return_value = connection

        response = self.client.get("/api/kpis", headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["records_last_month"], 2)
        self.assertEqual(response.json["active_department_this_month_count"], 4)
        self.assertEqual(response.json["active_department_last_month_count"], 2)
        self.assertEqual(response.json["month_over_month_change"], 100)

    @patch("app.get_db_connection")
    @patch("app.get_current_user", return_value={"id": 1, "name": "Admin", "role": "admin"})
    def test_admin_can_list_users_without_password_fields(self, get_user, get_connection):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchall.return_value = [
            {"id": 2, "name": "Analyst", "email": "analyst@example.com", "role": "analyst"},
        ]
        get_connection.return_value = connection

        response = self.client.get("/api/users", headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json[0]["role"], "analyst")
        self.assertNotIn("password", response.json[0])
        get_user.assert_called_once()
        cursor.execute.assert_called_once()

    @patch("app.get_db_connection")
    @patch("app.get_current_user", return_value={"id": 1, "name": "Viewer", "role": "viewer"})
    def test_viewer_cannot_list_users(self, get_user, get_connection):
        response = self.client.get("/api/users", headers=self.headers)
        self.assertEqual(response.status_code, 403)
        get_user.assert_called_once()
        get_connection.assert_not_called()

    @patch("app.get_db_connection")
    @patch("app.get_current_user", return_value={"id": 1, "name": "Admin", "role": "admin"})
    def test_last_admin_cannot_be_demoted(self, get_user, get_connection):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.return_value = {
            "id": 2, "name": "Second admin", "email": "second@example.com", "role": "admin",
        }
        cursor.fetchall.return_value = [{"id": 1}]
        get_connection.return_value = connection

        response = self.client.put(
            "/api/users/2/role", json={"role": "viewer"}, headers=self.headers,
        )

        self.assertEqual(response.status_code, 409)
        get_user.assert_has_calls([unittest.mock.call(), unittest.mock.call()])
        connection.rollback.assert_called_once()
        connection.commit.assert_not_called()

    @patch("app.publish_activity")
    @patch("app.get_db_connection")
    @patch("app.get_current_user", return_value={"id": 1, "name": "Admin", "role": "admin"})
    def test_role_change_commits_and_logs_activity(self, get_user, get_connection, publish):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.return_value = {
            "id": 2, "name": "Analyst", "email": "analyst@example.com", "role": "analyst",
        }
        cursor.lastrowid = 55
        get_connection.return_value = connection

        response = self.client.put(
            "/api/users/2/role", json={"role": "viewer"}, headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["role"], "viewer")
        self.assertTrue(any("UPDATE users SET role" in call.args[0] for call in cursor.execute.call_args_list))
        self.assertTrue(any("INSERT INTO activity_log" in call.args[0] for call in cursor.execute.call_args_list))
        connection.commit.assert_called_once()
        publish.assert_called_once()
        get_user.assert_has_calls([unittest.mock.call(), unittest.mock.call()])

    @patch("app.get_db_connection")
    def test_export_respects_filters_and_escapes_spreadsheet_formulas(self, get_connection):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchall.return_value = [{
            "department": "Finance",
            "metric_name": "=HYPERLINK(\"https://example.invalid\")",
            "metric_value": 10.5,
            "recorded_on": "2026-10-09",
        }]
        get_connection.return_value = connection

        response = self.client.get(
            "/api/metrics/export?department=Finance&from=2026-10-01&to=2026-10-31&search=Revenue",
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment; filename=\"edabip-metrics.csv\"", response.headers["Content-Disposition"])
        self.assertIn("d.name = %s", cursor.execute.call_args.args[0])
        self.assertEqual(
            cursor.execute.call_args.args[1],
            ("Finance", date(2026, 10, 1), date(2026, 10, 31), "%Revenue%"),
        )
        rows = list(csv.reader(StringIO(response.get_data(as_text=True).lstrip("\ufeff"))))
        self.assertEqual(rows[1][1], "'=HYPERLINK(\"https://example.invalid\")")

    @patch("app.get_db_connection")
    @patch("app.get_current_user", return_value={"id": 1, "name": "Admin", "role": "admin"})
    def test_admin_cannot_change_own_role(self, get_user, get_connection):
        response = self.client.put(
            "/api/users/1/role", json={"role": "viewer"}, headers=self.headers,
        )
        self.assertEqual(response.status_code, 400)
        get_user.assert_has_calls([unittest.mock.call(), unittest.mock.call()])
        get_connection.assert_not_called()


if __name__ == "__main__":
    unittest.main()

import unittest
from datetime import date

from app import app, get_date_filters, metric_filter_sql, parse_date


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


if __name__ == "__main__":
    unittest.main()

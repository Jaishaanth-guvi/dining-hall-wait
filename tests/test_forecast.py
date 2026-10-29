import unittest

from forecast import apply_shorten, board_for, empty_state


class ForecastTest(unittest.TestCase):
    def test_peak_lunch_predicts_more_than_20_minutes(self):
        view = board_for(70, empty_state())
        self.assertEqual(view["problem"], "Mess queue wait times")
        self.assertEqual(view["hall"], "Ridge Hall")
        self.assertTrue(view["oneDiningHall"])
        self.assertFalse(view["studentLoginRequired"])
        self.assertTrue(view["overTwentyMinutes"])
        self.assertGreaterEqual(view["predictedMinutes"], 20)
        self.assertEqual(view["timeLabel"], "12:10 PM")

    def test_quiet_time_is_a_shorter_wait(self):
        view = board_for(70, empty_state())
        plan = view["shorten"]
        self.assertTrue(plan["show"])
        self.assertLess(plan["waitMinutes"], view["predictedMinutes"])
        self.assertGreaterEqual(plan["minutesSaved"], 10)
        self.assertGreater(plan["studentsToBringUnder20"], 0)

    def test_shorten_brings_the_peak_under_20_minutes(self):
        state = empty_state()
        before = board_for(70, state)
        updated = apply_shorten(state, before["shorten"]["from"], before["shorten"]["to"])
        self.assertIsNotNone(updated)
        after = board_for(70, state)
        self.assertLess(after["predictedMinutes"], 20)
        self.assertLess(after["predictedMinutes"], before["predictedMinutes"])
        self.assertGreater(after["studentsWhoSwitched"], 0)

    def test_early_lunch_does_not_need_a_later_switch(self):
        view = board_for(10, empty_state())
        self.assertLess(view["predictedMinutes"], 10)
        self.assertFalse(view["shorten"]["show"])


if __name__ == "__main__":
    unittest.main()

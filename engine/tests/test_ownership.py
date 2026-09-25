import unittest
from quantforge.rules import evaluate


class OwnershipRulesTest(unittest.TestCase):
    def result(self, operator, value, fact='not-applicable', known='2026-09-20T00:00:00Z'):
        rule = {'timeframe': '1mo', 'logic': 'AND', 'groups': [{'logic': 'AND', 'conditions': [
            {'field': 'pledge', 'operator': operator, 'operand': 'value', 'value': value, 'timeframe': '1mo'}]}]}
        instrument = {'id': 'test', 'facts': [{'knownAt': known, 'values': {'pledge': fact}}]}
        return evaluate(rule, instrument, '2026-09-25T00:00:00Z')

    def test_no_promoters_meets_only_a_nonnegative_upper_limit(self):
        result = self.result('lte', 5)
        self.assertEqual(result['status'], 'qualified')
        self.assertEqual(result['checks'][0]['code'], 'no_promoters')
        self.assertNotIn('left', result['checks'][0])
        self.assertEqual(self.result('lte', 0)['status'], 'qualified')
        for op, value in [('gt', 5), ('eq', 0), ('lt', 0), ('lte', -1)]:
            self.assertEqual(self.result(op, value)['status'], 'unavailable')

    def test_missing_or_future_filing_does_not_pass(self):
        self.assertEqual(self.result('lte', 5, fact=None)['status'], 'unavailable')
        self.assertEqual(self.result('lte', 5, known='2026-10-01T00:00:00Z')['status'], 'unavailable')
        self.assertEqual(self.result('lte', 5, fact=9.31)['status'], 'rejected')
        self.assertEqual(self.result('lte', 5, fact=0)['status'], 'qualified')

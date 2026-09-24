"""Exercise the route without loading unrelated ECG models and hardware drivers."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


class RiskInputTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(Path(__file__).with_name('app.py').read_text(encoding='utf-8'))
        route = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'risk_assessment')
        route.decorator_list = []
        self.predict = Mock(return_value={'risk_class': 'Low', 'mortality_10y': 1})
        self.env = {'jsonify': lambda data: data, '_predict_risk': self.predict, 'log': Mock()}
        exec(compile(ast.Module(body=[route], type_ignores=[]), 'risk_route', 'exec'), self.env)
        self.payload = {'ecg_probabilities': {'NORM': 1}, 'demographics': {
            'age': 45, 'sex': 0, 'sbp': 120, 'cholesterol': 5, 'smoking': 0}, 'rose_flag': 0}

    def call(self):
        self.env['request'] = SimpleNamespace(get_json=lambda **kwargs: self.payload)
        return self.env['risk_assessment']()

    def test_missing_values_never_reach_model(self):
        for key in self.payload['demographics']:
            old = self.payload['demographics'][key]
            self.payload['demographics'][key] = None
            body, status = self.call()
            self.assertEqual(status, 422)
            self.assertIn(key, body['missing_fields'])
            self.payload['demographics'][key] = old
        self.predict.assert_not_called()

    def test_skipped_questionnaire_is_not_negative(self):
        del self.payload['rose_flag']
        self.assertEqual(self.call()[1], 422)
        self.predict.assert_not_called()

    def test_complete_data_preserves_zero_answers(self):
        self.assertEqual(self.call()['risk_class'], 'Low')
        self.assertEqual(self.predict.call_args.kwargs['smoking'], 0)
        self.assertEqual(self.predict.call_args.kwargs['rose_flag'], 0)

    def test_invalid_measurement_rejected(self):
        for value in ['NaN', 'Infinity', -1, 'not measured']:
            self.payload['demographics']['sbp'] = value
            self.assertEqual(self.call()[1], 400)
        self.predict.assert_not_called()


if __name__ == '__main__':
    unittest.main()

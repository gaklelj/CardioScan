import unittest
import ast
import logging
from pathlib import Path
from unittest.mock import patch
from ecg_protocol import normalize_sample, parse_sample_line, parse_tcp_frame, validate_channels


class ProtocolTests(unittest.TestCase):
    def test_four_lead_firmware_frame(self):
        line = '1200000,42,8388610,8388600,-10,8388620,3\r\n'
        frame = parse_tcp_frame(line)
        self.assertEqual(frame['channels'], [8388610, 8388600, -10, 8388620])
        self.assertEqual(frame['lead_labels'], ['I', 'II', 'III', 'V1'])
        self.assertEqual(frame['lost_samples'], 3)
        self.assertEqual(parse_sample_line(line), frame['channels'])
        self.assertEqual(normalize_sample(frame), frame['channels'])
        for v1 in (-1, 0x1000000):
            with self.assertRaises(ValueError):
                parse_tcp_frame(f'1200000,42,8388610,8388600,-10,{v1},3')

    def test_actual_firmware_frame(self):
        frame = parse_tcp_frame('1200000,42,8388610,8388600,-10,3\r\n')
        self.assertEqual(frame['channels'], [8388610, 8388600, -10])
        self.assertEqual(frame['timestamp_us'], 1200000)
        self.assertEqual(frame['sequence'], 42)
        self.assertEqual(frame['lost_samples'], 3)

    def test_legacy_does_not_invent_channels(self):
        self.assertEqual(normalize_sample({'value': 12}), [12])
        self.assertEqual(parse_sample_line('1,2,-3'), [1, 2, -3])
        self.assertEqual(parse_sample_line('{"channels":[1,2,3]}'), [1, 2, 3])

    def test_invalid_frames(self):
        for line in ['', '1,2', '1,,3', 'NaN', '1,2,Infinity', '{"channels":null}',
                     'timestamp_us,sequence,lead_I_raw,lead_II_raw,lead_III_raw,lost_samples']:
            with self.subTest(line=line), self.assertRaises(ValueError):
                parse_sample_line(line)

    def test_invalid_recordings(self):
        for channels in [[], [[], [], []], [[1], [2, 3], [4]], [[float('nan')]], [[True]], [[{}]]]:
            with self.subTest(channels=channels), self.assertRaises(ValueError):
                validate_channels(channels)

    def test_four_lead_recording_routes_only_limb_leads_to_model(self):
        channels = [[1, 2], [3, 4], [2, 2], [5, 6]]
        self.assertEqual(validate_channels(channels), channels)
        tree = ast.parse(Path(__file__).with_name('app.py').read_text(encoding='utf-8'))
        analyze = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'analyze_channels')
        from unittest.mock import Mock
        predictor = Mock()
        namespace = dict(validate_channels=validate_channels, _three_model=predictor)
        exec(compile(ast.Module(body=[analyze], type_ignores=[]), '<analyze>', 'exec'), namespace)
        namespace['analyze_channels'](channels, {'sample_rate_hz': 100})
        predictor.analyze.assert_called_once_with(channels[:3], 100, None, 0)

    def test_tcp_reader_handles_split_lines_and_multiple_frames(self):
        # Load the production reader without importing TensorFlow or opening hardware.
        tree = ast.parse(Path(__file__).with_name('app.py').read_text(encoding='utf-8'))
        reader = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == '_wifi_reader')
        events = []
        class Emitter:
            def emit(self, name, data, **kwargs):
                events.append((name, data))
        class Connection:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def settimeout(self, value): pass
            chunks = iter([b'timestamp_us,sequence,lead_I_raw,lead_II_raw,lead_III_raw,V1_raw,lost_samples\r\n1000,1,8388',
                           b'610,8388600,-10,8388620,0\r\n1001000,3,8388611,8388600,-11,8388621,1\r\n', b''])
            def recv(self, size): return next(self.chunks)
        namespace = dict(ESP32_WIFI_HOST='localhost', ESP32_WIFI_PORT=3333, _ecg_running=True,
                         _ecg_owner_sid='test', socketio=Emitter(), parse_tcp_frame=parse_tcp_frame,
                         log=logging.getLogger('test'))
        exec(compile(ast.Module(body=[reader], type_ignores=[]), '<reader>', 'exec'), namespace)
        with patch('socket.create_connection', return_value=Connection()):
            namespace['_wifi_reader']()
        batches = [data for name, data in events if name == 'ecg_frames']
        self.assertEqual(len(batches), 1)
        self.assertEqual(len(batches[0]['frames']), 2)
        self.assertEqual(batches[0]['frames'][0]['channels'], [8388610, 8388600, -10, 8388620])
        self.assertEqual(batches[0]['missing_samples'], 1)
        self.assertEqual(batches[0]['sample_rate_hz'], 2.0)
        self.assertFalse(namespace['_ecg_running'])

    def test_silent_tcp_connection_ends_recording(self):
        import socket
        from unittest.mock import Mock
        tree = ast.parse(Path(__file__).with_name('app.py').read_text(encoding='utf-8'))
        reader = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == '_wifi_reader')
        emitter = Mock()
        namespace = dict(ESP32_WIFI_HOST='localhost', ESP32_WIFI_PORT=3333, _ecg_running=True,
                         _ecg_owner_sid='test', socketio=emitter, parse_tcp_frame=parse_tcp_frame,
                         log=logging.getLogger('test'))
        exec(compile(ast.Module(body=[reader], type_ignores=[]), '<reader>', 'exec'), namespace)
        with patch('socket.create_connection') as connect:
            connection = connect.return_value.__enter__.return_value
            connection.recv.side_effect = socket.timeout()
            namespace['_wifi_reader']()
            self.assertEqual(connection.recv.call_count, 5)
        self.assertFalse(namespace['_ecg_running'])
        emitter.emit.assert_any_call('device_status', {'connected': False}, to='test')


if __name__ == '__main__':
    unittest.main()

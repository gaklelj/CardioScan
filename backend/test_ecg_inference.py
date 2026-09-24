import unittest
from pathlib import Path
import numpy as np
import torch
from ecg_inference import ThreeLeadPredictor

class InferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)
        cls.predictor = ThreeLeadPredictor(Path(__file__).parent / 'model/ecg_ads1293.pt')
        t = np.arange(1000)/100
        cls.channels = [np.sin(t*6).tolist(), np.cos(t*6).tolist(), np.zeros(1000).tolist()]

    def test_actual_checkpoint(self):
        result = self.predictor.analyze(self.channels,100)
        self.assertEqual(result['channels'],3)
        self.assertEqual(len(result['all']),7)
        self.assertIn('AF',result['all'])
        self.assertTrue(all(0 <= v <= 1 for v in result['all'].values()))

    def test_invalid_acquisition(self):
        for kwargs in ({}, {'sample_rate_hz':0}, {'sample_rate_hz':100,'missing_samples':1}, {'sample_rate_hz':100,'timing':[]}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.predictor.analyze(self.channels,**kwargs)
        with self.assertRaises(ValueError):
            self.predictor.analyze([c[:900] for c in self.channels],100)

    def test_timing_and_gap_detection(self):
        timing = [[i*10000,i,0] for i in range(1000)]
        result = self.predictor.analyze(self.channels,timing=timing)
        self.assertEqual(result['sample_rate_hz'],100)
        timing[500][1] += 1
        with self.assertRaises(ValueError):
            self.predictor.analyze(self.channels,timing=timing)

    def test_noise_suppresses_diagnoses(self):
        original = self.predictor.thresholds
        try:
            self.predictor.thresholds = {c:0 for c in original}
            result = self.predictor.analyze(self.channels,100)
            self.assertEqual(result['labels'],['NOISE'])
            self.assertEqual(result['class'],'NOISE')
        finally:
            self.predictor.thresholds = original

if __name__ == '__main__':
    unittest.main()

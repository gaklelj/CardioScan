import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import torch
from ecg_three_lead import preprocess, ECGNet

class PipelineTests(unittest.TestCase):
    def test_resampling_and_offset_invariance(self):
        t = np.arange(5000) / 500
        x = np.column_stack([np.sin(2*np.pi*t), np.cos(2*np.pi*t), np.zeros(5000)])
        actual = preprocess(x, 500)
        self.assertEqual(actual.shape, (1000, 3))
        np.testing.assert_allclose(actual[:,2], actual[:,1]-actual[:,0], atol=1e-5)
        np.testing.assert_allclose(preprocess(x+100, 500), actual, atol=3e-5)

    def test_invalid_input_and_flatline(self):
        for x in (np.zeros((999,3)), np.zeros((1000,1)), np.full((1000,3),np.nan)):
            with self.assertRaises(ValueError):
                preprocess(x,100)
        self.assertTrue(np.isfinite(preprocess(np.zeros((1000,3)),100)).all())

    def test_network_backward(self):
        torch.set_num_threads(2)
        model = ECGNet()
        logits = model(torch.randn(2,3,1000))
        self.assertEqual(tuple(logits.shape), (2,7))
        logits.square().mean().backward()
        self.assertTrue(all(p.grad is not None for p in model.parameters()))

if __name__ == '__main__':
    unittest.main()

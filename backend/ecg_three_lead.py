"""Shared preprocessing and network for I, II, III ECG (10 s at 100 Hz)."""
from fractions import Fraction
import numpy as np
from scipy.signal import resample_poly
import torch
from torch import nn

CLASSES = ['CD', 'HYP', 'MI', 'STTC', 'NORM', 'AF', 'NOISE']

def preprocess(signal, sample_rate):
    x = np.asarray(signal, dtype=np.float32)
    if x.ndim != 2 or x.shape[1] != 3 or not np.isfinite(x).all():
        raise ValueError('Expected finite samples x 3 in lead order I, II, III')
    if not np.isfinite(sample_rate) or sample_rate <= 0:
        raise ValueError('sample_rate must be positive')
    if len(x) < round(10 * sample_rate):
        raise ValueError('At least 10 seconds of ECG are required')
    x = x[:round(10 * sample_rate)].copy()
    x -= np.median(x, axis=0)
    x[:, 2] = x[:, 1] - x[:, 0]
    ratio = Fraction(100 / float(sample_rate)).limit_denominator(10000)
    x = resample_poly(x, ratio.numerator, ratio.denominator)[:1000]
    # One scale preserves relative amplitudes and Einthoven's relation.
    x /= max(float(np.std(x[:, :2])), 1e-6)
    return np.clip(x, -20, 20).astype(np.float32)

class ECGNet(nn.Module):
    def __init__(self):
        super().__init__()
        layers = []
        channels = 3
        for width in (24, 48, 96, 128):
            layers += [nn.Conv1d(channels, width, 9, stride=2, padding=4),
                       nn.BatchNorm1d(width), nn.ReLU(),
                       nn.Conv1d(width, width, 5, padding=2), nn.ReLU()]
            channels = width
        self.features = nn.Sequential(*layers)
        self.head = nn.Sequential(nn.AdaptiveAvgPool1d(1), nn.Flatten(),
                                  nn.Dropout(.25), nn.Linear(128, len(CLASSES)))

    def forward(self, x):
        return self.head(self.features(x))

def predict(checkpoint, channels, sample_rate):
    saved = torch.load(checkpoint, map_location='cpu', weights_only=False)
    model = ECGNet()
    model.load_state_dict(saved['model'])
    model.eval()
    x = preprocess(np.asarray(channels).T, sample_rate)
    with torch.no_grad():
        p = model(torch.from_numpy(x.T.copy())[None]).sigmoid()[0].numpy()
    return dict(zip(CLASSES, map(float, p)))

"""Loaded-once three-lead inference with explicit acquisition metadata."""
import numpy as np
import torch
from ecg_protocol import validate_channels
from ecg_three_lead import ECGNet, CLASSES, preprocess

class ThreeLeadPredictor:
    def __init__(self, path):
        saved = torch.load(path, map_location='cpu', weights_only=True)
        if saved['config']['classes'] != CLASSES or saved['config']['leads'] != ['I', 'II', 'III']:
            raise ValueError('Incompatible ECG model metadata')
        self.model = ECGNet()
        self.model.load_state_dict(saved['model']); self.model.eval()
        self.thresholds = saved['thresholds']

    def analyze(self, channels, sample_rate_hz=None, timing=None, missing_samples=0):
        channels = validate_channels(channels)
        if len(channels) != 3:
            raise ValueError('Three leads I, II, III are required')
        if missing_samples:
            raise ValueError('Recording contains lost samples; repeat the recording')
        if timing is not None:
            t = np.asarray(timing, dtype=np.float64)
            if t.shape != (len(channels[0]), 3) or not np.isfinite(t).all() or len(t) < 2:
                raise ValueError('timing must contain timestamp_us, sequence, lost_samples for every sample')
            if np.any(np.diff(t[:,0]) <= 0) or np.any(np.mod(np.diff(t[:,1]), 2**32) != 1) or np.any(np.diff(t[:,2]) != 0):
                raise ValueError('Recording has gaps or invalid timing; repeat the recording')
            sample_rate_hz = (len(t)-1)*1e6/(t[-1,0]-t[0,0])
        if isinstance(sample_rate_hz, bool) or not isinstance(sample_rate_hz, (int,float)) or not np.isfinite(sample_rate_hz) or not 50 <= sample_rate_hz <= 25600:
            raise ValueError('Provide sample_rate_hz (50..25600) or complete timing metadata')
        n = round(10*sample_rate_hz)
        x = preprocess(np.asarray(channels).T[-n:], sample_rate_hz)
        with torch.inference_mode():
            p = self.model(torch.from_numpy(x.T.copy())[None]).sigmoid()[0].numpy()
        scores = dict(zip(CLASSES, map(float,p)))
        labels = [c for c in CLASSES if scores[c] >= self.thresholds[c]]
        if 'NOISE' in labels:
            labels = ['NOISE']
        elif any(c not in ('NORM','NOISE') for c in labels):
            labels = [c for c in labels if c != 'NORM']
        top = max(labels, key=scores.get) if labels else 'Uncertain'
        result = dict(confidence=scores.get(top, max(scores.values())), all=scores,
                    labels=labels, thresholds=self.thresholds, model='ecg_ads1293',
                    analysis_channel='I, II, III', channels=3, sample_rate_hz=sample_rate_hz,
                    window_seconds=10, quality='poor' if top == 'NOISE' else 'unverified',
                    score_type='uncalibrated_model_score')
        result['class'] = top
        return result

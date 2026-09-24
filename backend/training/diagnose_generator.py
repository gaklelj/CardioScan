"""Reproduce the current ESP32 Gaussian test signal; never change model weights.

Run from the repository root:
  python backend/training/diagnose_generator.py
The signal is a transport fixture, not a validated normal ECG reference.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ecg_inference import ThreeLeadPredictor


def generator_window(offset_seconds=0, noise=True):
    """125 Hz, 10 s, matching firmware_synthetic_v2.ino waveform parameters.

    Fixed xorshift seed makes noise reproducible. Float64 host arithmetic and
    ideal timing approximate ESP32 float32 arithmetic and scheduler timing.
    """
    t = offset_seconds + np.arange(1250) / 125
    phase = np.mod(t, .8) / .8
    def pulse(center, width):
        return np.exp(-.5 * ((phase - center) / width) ** 2)
    p, q, r, s, v = [pulse(c, w) for c, w in
                     ((.18, .025), (.36, .012), (.40, .014), (.44, .016), (.68, .055))]
    drift = 1500 * np.sin(2 * np.pi * t / 4)
    amplitude = 1 + .012 * np.sin(2 * np.pi * t / 4.5)
    interference = 35 * np.sin(2 * np.pi * 50 * t) if noise else 0
    jitter = np.zeros((1250, 3))
    state, colored = 42, np.zeros(3)
    if noise:
        for i in range(1250):
            for channel in range(3):
                state ^= (state << 13) & 0xffffffff
                state ^= state >> 17
                state ^= (state << 5) & 0xffffffff
                white = (state & 0xffff) / 32767.5 - 1
                colored[channel] = .94 * colored[channel] + .06 * white
                jitter[i, channel] = 65 * white + 150 * colored[channel]
    lead_i = 8388608 + np.trunc(drift + interference + jitter[:, 0] +
        amplitude * 90000 * (.12*p - .12*q + r - .24*s + .30*v)).astype(np.int32)
    lead_ii = 8388608 + np.trunc(drift + interference + jitter[:, 1] +
        amplitude * 120000 * (.15*p - .10*q + r - .30*s + .35*v)).astype(np.int32)
    return [lead_i.tolist(), lead_ii.tolist(), (lead_ii - lead_i).tolist()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, default=Path('backend/model/ecg_ads1293.pt'))
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    torch.set_num_threads(2)
    predictor = ThreeLeadPredictor(args.model)
    cases = []
    for noise in (False, True):
        for offset in (0, 2, 4):
            result = predictor.analyze(generator_window(offset, noise), 125)
            cases.append(dict(offset_seconds=offset, noise=noise,
                              selected=result['labels'], scores=result['all']))
    report = dict(model_sha256=hashlib.sha256(args.model.read_bytes()).hexdigest(),
                  thresholds=predictor.thresholds, cases=cases,
                  note='Generated waveform has no validated NORM ground truth. Scores are not disease probabilities.')
    encoded = json.dumps(report, indent=2)
    print(encoded)
    if args.output:
        args.output.write_text(encoded + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()

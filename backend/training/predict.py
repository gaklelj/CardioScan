"""Infer from a uniformly sampled N x 3 .npy recording in I, II, III order."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from ecg_three_lead import predict

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('recording', type=Path)
    parser.add_argument('--sample-rate', type=float, required=True)
    parser.add_argument('--checkpoint', type=Path, default=Path('data/training_ads1293/best.pt'))
    args = parser.parse_args()
    signal = np.load(args.recording, allow_pickle=False)
    print(json.dumps(predict(args.checkpoint, signal.T, args.sample_rate), indent=2))

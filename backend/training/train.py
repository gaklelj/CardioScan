"""Prepare both local datasets and train a masked multilabel three-lead CNN."""
import argparse
import ast
import hashlib
import json
import random
import re
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd
from scipy.io import loadmat
import torch
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import roc_auc_score, average_precision_score
from ecg_three_lead import ECGNet, CLASSES, preprocess

def read_record(path):
    lines = path.with_suffix('.hea').read_text().splitlines()
    head = lines[0].split()
    n, fs, length = int(head[1]), float(head[2]), int(head[3])
    specs = [s.split() for s in lines[1:n+1]]
    indices = [[s[-1].upper() for s in specs].index(k) for k in ['I', 'II', 'III']]
    if path.with_suffix('.mat').exists():
        raw = loadmat(path.with_suffix('.mat'))['val'].T
    else:
        if any(s[1] != '16' for s in specs):
            raise ValueError('Unsupported WFDB encoding')
        raw = np.fromfile(path.with_suffix('.dat'), dtype='<i2').reshape(-1, n)
    if raw.shape != (length, n):
        raise ValueError('Unexpected waveform shape')
    x = raw[:, indices].astype(np.float32)
    for j, i in enumerate(indices):
        gain = re.match(r'([\d.]+)(?:\(([-\d]+)\))?/', specs[i][2])
        if gain is None:
            raise ValueError('Unknown gain')
        baseline = float(gain[2] or specs[i][4])
        x[:, j] = (x[:, j] - baseline) / float(gain[1])
    return preprocess(x, fs)

def prepare(root, out):
    ptb = root / 'DESTINATION'
    table = pd.read_csv(ptb / 'ptbxl_database.csv')
    mapping = pd.read_csv(ptb / 'scp_statements.csv', index_col=0)
    xs, ys, masks, rows, errors = [], [], [], [], []
    seen = set()
    def add(path, y, mask, source, patient, split):
        try:
            x = read_record(path)
            digest = hashlib.sha256(x.tobytes()).hexdigest()
            if digest in seen:
                return
            seen.add(digest)
            xs.append(x); ys.append(y); masks.append(mask)
            rows.append(dict(record=str(path), source=source, patient=str(patient), split=split, sha256=digest))
        except Exception as e:
            errors.append(dict(record=str(path), error=str(e)))
    for row in table.itertuples():
        codes = ast.literal_eval(row.scp_codes)
        y, mask = np.zeros(7, np.float32), np.ones(7, np.float32)
        for code in codes:
            if code in mapping.index:
                cls = mapping.loc[code, 'diagnostic_class']
                if cls in CLASSES:
                    y[CLASSES.index(cls)] = 1
        y[5] = float('AFIB' in codes)
        if y[:4].any() or y[5]:
            y[4] = 0
        # Missing quality annotations are not proof of a clean signal.
        quality = [getattr(row, k) for k in ['static_noise', 'burst_noise', 'electrodes_problems']]
        noisy = any(pd.notna(v) and str(v).strip(' ,') for v in quality)
        y[6], mask[6] = float(noisy), float(noisy)
        split = 'test' if row.strat_fold == 10 else 'val' if row.strat_fold == 9 else 'train'
        add(ptb / row.filename_lr, y, mask, 'ptbxl', row.patient_id, split)
    print(f'PTB-XL prepared: {len(rows)}', flush=True)
    for hea in sorted((root / 'WFDB_ChapmanShaoxing').glob('*.hea')):
        dx = next(s.split(':', 1)[1] for s in hea.read_text().splitlines() if s.startswith('#Dx:'))
        codes = set(dx.replace(' ', '').split(','))
        y, mask = np.zeros(7, np.float32), np.zeros(7, np.float32)
        # AF is directly mapped; other diagnostic superclasses remain unknown.
        y[5], mask[5] = float('164889003' in codes), 1
        # Sinus rhythm alone does not certify a normal ECG: NORM stays unknown.
        bucket = int(hashlib.sha256(hea.stem.encode()).hexdigest()[:8], 16) % 10
        split = 'test' if bucket == 9 else 'val' if bucket == 8 else 'train'
        add(hea.with_suffix(''), y, mask, 'chapman', hea.stem, split)
    if not rows or not any(r['source'] == 'chapman' for r in rows):
        raise RuntimeError('Both datasets must be present')
    np.save(out / 'signals.npy', np.asarray(xs))
    np.save(out / 'labels.npy', np.asarray(ys))
    np.save(out / 'masks.npy', np.asarray(masks))
    pd.DataFrame(rows).to_csv(out / 'manifest.csv', index=False)
    (out / 'rejected.json').write_text(json.dumps(errors, indent=2))
    summary = dict(records=len(rows), rejected=len(errors), counts=pd.DataFrame(rows).groupby(['source','split']).size().to_dict())
    summary['counts'] = {str(k):v for k,v in summary['counts'].items()}
    (out / 'dataset_summary.json').write_text(json.dumps(summary, indent=2))
    print(summary, flush=True)

class ECGDataset(Dataset):
    def __init__(self, out, split):
        self.x = np.load(out / 'signals.npy', mmap_mode='r')
        self.y = np.load(out / 'labels.npy')
        self.m = np.load(out / 'masks.npy')
        self.ids = np.flatnonzero(pd.read_csv(out / 'manifest.csv')['split'].values == split)
        self.training = split == 'train'

    def __len__(self):
        return len(self.ids) * 2

    def __getitem__(self, idx):
        i = self.ids[idx // 2]
        x, y, m = self.x[i].copy(), self.y[i].copy(), self.m[i].copy()
        rng = np.random.default_rng(int(np.random.randint(0, 2**31))) if self.training else np.random.default_rng(int(i) + 812)
        if idx % 2:
            kind = rng.integers(4)
            if kind == 0:
                x[:, :2] += rng.normal(0, rng.uniform(1, 4), (1000, 2))
            elif kind == 1:
                x[:] = 0  # electrode disconnection / flatline
            elif kind == 2:
                start = rng.integers(0, 400)
                x[start:start+600, :2] = rng.normal(0, 3, (600, 2))
            else:
                x[:, :2] += 4 * np.sin(np.arange(1000)[:, None] * rng.uniform(.01, .05))
            x[:, 2] = x[:, 1] - x[:, 0]
            x = preprocess(x, 100)
            y[:] = 0; m[:] = 0; y[6] = 1; m[6] = 1
        elif self.training:
            x *= rng.uniform(.8, 1.2)
        return torch.from_numpy(x.T.copy()), torch.from_numpy(y), torch.from_numpy(m)

def evaluate(model, loader, device):
    ps, ys, ms = [], [], []
    model.eval()
    with torch.no_grad():
        for x,y,m in loader:
            ps.append(model(x.to(device)).sigmoid().cpu().numpy()); ys.append(y.numpy()); ms.append(m.numpy())
    p,y,m = map(np.concatenate, (ps,ys,ms))
    metrics = {}
    for j,c in enumerate(CLASSES):
        keep = m[:,j] > 0
        truth, prob = y[keep,j], p[keep,j]
        metrics[c] = dict(n=int(keep.sum()), positive=int(truth.sum()), auroc=float(roc_auc_score(truth,prob)) if len(np.unique(truth)) == 2 else None,
                          average_precision=float(average_precision_score(truth,prob)) if truth.sum() else None)
    return metrics

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', type=Path, default=Path('data'))
    parser.add_argument('--out', type=Path, default=Path('data/training_ads1293'))
    parser.add_argument('--epochs', type=int, default=30)
    parser.add_argument('--batch-size', type=int, default=64)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4)
    torch.manual_seed(42); np.random.seed(42); random.seed(42)
    if not (args.out / 'manifest.csv').exists():
        prepare(args.data, args.out)
    if args.prepare_only:
        return
    train = ECGDataset(args.out, 'train')
    val = ECGDataset(args.out, 'val')
    # Unannotated quality is a weak negative, explicitly used only as such.
    train.m[train.m[:,6] == 0,6] = .2
    val.m[val.m[:,6] == 0,6] = .2
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = ECGNet().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=.0001)
    loaders = [DataLoader(d, batch_size=args.batch_size, shuffle=(d is train)) for d in (train,val)]
    labels, masks = train.y[train.ids], train.m[train.ids]
    positive = (labels*masks).sum(0)
    weights = torch.tensor(np.clip(((1-labels)*masks).sum(0)/np.maximum(positive,1),1,15), device=device)
    weights[6] = 1
    criterion = torch.nn.BCEWithLogitsLoss(reduction='none', pos_weight=weights)
    best, stale, start = -1., 0, 0
    if args.resume:
        saved = torch.load(args.out / 'last.pt', map_location=device, weights_only=False)
        model.load_state_dict(saved['model']); optimizer.load_state_dict(saved['optimizer'])
        start, best, stale = saved['epoch'], saved['best'], saved['stale']
    config = dict(classes=CLASSES, leads=['I','II','III'], derived_lead='III=II-I', sample_rate=100, seconds=10, seed=42,
                  device=str(device), quality_negative_weight=.2, chapman_split='record ID; patient IDs unavailable', epochs=args.epochs)
    (args.out / 'config.json').write_text(json.dumps(config, indent=2))
    print(f'Training on {device}: {len(train.ids)} original training records', flush=True)
    for epoch in range(start, args.epochs):
        model.train(); total = 0.; began = time.time()
        for batch, (x,y,m) in enumerate(loaders[0], 1):
            x,y,m = x.to(device),y.to(device),m.to(device)
            optimizer.zero_grad()
            loss = (criterion(model(x),y)*m).sum()/m.sum().clamp_min(1)
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 5)
            optimizer.step(); total += loss.item()
            if batch == 1 or batch % 100 == 0:
                print(f'epoch={epoch+1} batch={batch}/{len(loaders[0])} loss={loss.item():.5f}', flush=True)
        metrics = evaluate(model, loaders[1], device)
        score = float(np.mean([v['auroc'] for k,v in metrics.items() if k != 'NOISE' and v['auroc'] is not None]))
        improved = score > best
        best, stale = max(best,score), 0 if improved else stale+1
        state = dict(model=model.state_dict(), optimizer=optimizer.state_dict(), epoch=epoch+1, best=best, stale=stale, config=config)
        torch.save(state, args.out / 'last.pt')
        if improved:
            torch.save(state, args.out / 'best.pt')
        report = dict(epoch=epoch+1, loss=total/len(loaders[0]), val_macro_auroc=score, seconds=time.time()-began, metrics=metrics)
        with (args.out / 'history.jsonl').open('a') as f:
            f.write(json.dumps(report)+'\n')
        print(json.dumps(report), flush=True)
        if stale >= 6:
            break
    model.load_state_dict(torch.load(args.out / 'best.pt', map_location=device, weights_only=False)['model'])
    test = ECGDataset(args.out, 'test'); test.m[test.m[:,6] == 0,6] = .2
    results = evaluate(model, DataLoader(test, batch_size=args.batch_size), device)
    (args.out / 'test_metrics.json').write_text(json.dumps(results, indent=2))
    print('COMPLETED: test_metrics.json saved', flush=True)

if __name__ == '__main__':
    main()

"""Select research decision thresholds on validation only; export portable weights."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import torch
from torch.utils.data import DataLoader
from sklearn.metrics import precision_recall_curve
from train import ECGDataset
from ecg_three_lead import ECGNet, CLASSES

if __name__ == '__main__':
    torch.set_num_threads(4)
    source = Path('data/training_ads1293')
    saved = torch.load(source / 'best.pt', map_location='cpu', weights_only=False)
    model = ECGNet(); model.load_state_dict(saved['model']); model.eval()
    val = ECGDataset(source, 'val')
    val.m[val.m[:,6] == 0,6] = .2
    ps, ys, ms = [], [], []
    with torch.inference_mode():
        for x,y,m in DataLoader(val, batch_size=128):
            ps.append(model(x).sigmoid().numpy()); ys.append(y.numpy()); ms.append(m.numpy())
    p,y,m = map(np.concatenate, (ps,ys,ms))
    thresholds, report = {}, {}
    for j,c in enumerate(CLASSES):
        keep = m[:,j] > 0
        precision, recall, cutoffs = precision_recall_curve(y[keep,j], p[keep,j])
        f1 = 2*precision[:-1]*recall[:-1]/np.maximum(precision[:-1]+recall[:-1],1e-9)
        best = int(np.argmax(f1))
        thresholds[c] = float(cutoffs[best])
        report[c] = dict(threshold=thresholds[c], validation_f1=float(f1[best]), precision=float(precision[best]), recall=float(recall[best]))
    destination = Path('backend/model/ecg_ads1293.pt')
    torch.save(dict(model=saved['model'], config=saved['config'], thresholds=thresholds, epoch=saved['epoch']), destination)
    (source / 'validation_thresholds.json').write_text(json.dumps(report, indent=2))
    print(f'Exported epoch {saved["epoch"]}: {destination}', flush=True)
    print(json.dumps(report, indent=2))

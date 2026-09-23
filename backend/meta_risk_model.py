"""
Late Fusion Meta-Model v3 — Кардиологический классификатор риска

Объединяет:
  - Выходы ЭКГ-нейросети (prob_norm/sttc/mi/hyp/cd)
  - Анкетные данные пациента
  - Опросник Роуза (rose_flag)

Target: 4 класса риска → Low / Moderate / High / Critical
Output: класс + 10-летняя смертность (%) + рекомендация
"""

import os
import numpy as np
import pandas as pd
import pickle
import warnings
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report
from sklearn.preprocessing import LabelEncoder

warnings.filterwarnings("ignore")

RISK_LABELS = ["Low", "Moderate", "High", "Critical"]
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model')
MODEL_PATH = os.path.join(MODEL_DIR, "meta_model_v3.pkl")
RANDOM_STATE = 42

MORTALITY_SCALE = {
    "Low":      (0.5,  3.0),
    "Moderate": (3.0,  7.0),
    "High":     (7.0,  10.0),
    "Critical": (10.0, 20.0),
}

RECOMMENDATIONS = {
    "Low":      "Риск в норме. Соблюдайте здоровый образ жизни, плановый осмотр раз в год.",
    "Moderate": "Умеренный риск. Контролируйте давление и холестерин, консультация терапевта.",
    "High":     "Высокий риск. Обратитесь к кардиологу в течение 2–4 недель.",
    "Critical": "Критический риск. Срочно обратитесь к кардиологу — требуется немедленное обследование.",
}

FEATURE_COLS = [
    "prob_norm", "prob_sttc", "prob_mi", "prob_hyp", "prob_cd",
    "age", "sex", "sbp", "cholesterol", "smoking", "rose_flag",
    "hyp_sbp", "ecg_pathology", "age_sex", "excess_chol", "rose_ecg",
]


# ── Dataset generation ────────────────────────────────────────────────────────

def generate_dataset(n: int = 5000, seed: int = RANDOM_STATE) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    alpha = np.array([6.0, 1.2, 0.8, 1.0, 0.9])
    ecg_probs = rng.dirichlet(alpha, size=n)

    prob_norm = ecg_probs[:, 0]
    prob_sttc = ecg_probs[:, 1]
    prob_mi   = ecg_probs[:, 2]
    prob_hyp  = ecg_probs[:, 3]
    prob_cd   = ecg_probs[:, 4]

    age         = rng.integers(30, 86, n)
    sex         = rng.integers(0, 2, n)
    sbp         = rng.integers(100, 201, n).astype(float)
    cholesterol = (rng.random(n) * 5.0 + 3.0).round(1)
    smoking     = rng.integers(0, 2, n)

    rose_prob = (
        0.05
        + 0.003 * (age - 30)
        + 0.05  * smoking
        + 0.002 * np.maximum(0, sbp - 130)
        + 0.15  * prob_sttc
        + 0.10  * prob_cd
    )
    rose_prob  = np.clip(rose_prob, 0.0, 0.85)
    rose_flag  = (rng.random(n) < rose_prob).astype(int)

    df = pd.DataFrame({
        "prob_norm":   prob_norm.round(4),
        "prob_sttc":   prob_sttc.round(4),
        "prob_mi":     prob_mi.round(4),
        "prob_hyp":    prob_hyp.round(4),
        "prob_cd":     prob_cd.round(4),
        "age":         age,
        "sex":         sex,
        "sbp":         sbp.astype(int),
        "cholesterol": cholesterol,
        "smoking":     smoking,
        "rose_flag":   rose_flag,
    })
    return df


# ── Risk labeling rules ───────────────────────────────────────────────────────

def assign_risk_level(df: pd.DataFrame) -> pd.Series:
    critical = (
        (df["prob_mi"] > 0.4) |
        (df["sbp"] > 170)     |
        ((df["prob_hyp"] > 0.5) & (df["sbp"] > 150))
    )
    high = (
        (df["rose_flag"] == 1) |
        (df["prob_cd"] > 0.5)  |
        ((df["age"] > 70) & (df["smoking"] == 1))
    )
    moderate = (
        (df["sbp"] > 140)         |
        (df["cholesterol"] > 6.0) |
        (df["prob_sttc"] > 0.5)
    )
    risk = pd.Series("Low", index=df.index)
    risk[moderate]         = "Moderate"
    risk[high & ~critical] = "High"
    risk[critical]         = "Critical"
    return risk


# ── Feature engineering ───────────────────────────────────────────────────────

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    X = df.copy()
    X["hyp_sbp"]       = X["prob_hyp"] * (X["sbp"] / 200.0)
    X["ecg_pathology"] = 1.0 - X["prob_norm"]
    X["age_sex"]       = X["age"] * (1.0 + 0.3 * X["sex"])
    X["excess_chol"]   = (X["cholesterol"] - 5.0).clip(lower=0)
    X["rose_ecg"]      = X["rose_flag"] * X["ecg_pathology"]
    return X


# ── Training ──────────────────────────────────────────────────────────────────

def train_model(verbose: bool = True) -> dict:
    if verbose:
        print("[1/4] Генерация датасета (20 000 записей)...")

    df = generate_dataset(n=20000)
    df["risk_level"] = assign_risk_level(df)

    if verbose:
        dist = df["risk_level"].value_counts().to_dict()
        print(f"      Распределение: { {k: dist.get(k,0) for k in RISK_LABELS} }")

    X_full = build_features(df)[FEATURE_COLS]
    le     = LabelEncoder().fit(RISK_LABELS)
    y      = le.transform(df["risk_level"])

    X_train, X_test, y_train, y_test = train_test_split(
        X_full, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )

    if verbose:
        print("[2/4] Обучение RandomForestClassifier...")

    clf = RandomForestClassifier(
        n_estimators=300,
        max_depth=12,
        min_samples_leaf=4,
        class_weight="balanced",
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    if verbose:
        cv_scores = cross_val_score(clf, X_train, y_train,
                                    cv=StratifiedKFold(5), scoring="f1_macro")
        print(f"      CV F1-macro: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")

    y_pred = clf.predict(X_test)
    if verbose:
        print("[3/4] Метрики на тестовой выборке:")
        print(classification_report(y_test, y_pred, target_names=le.classes_, digits=3))

    if verbose:
        imp = pd.Series(clf.feature_importances_, index=FEATURE_COLS)
        top5 = imp.nlargest(5)
        print("[4/4] Топ-5 важных признаков:")
        for feat, val in top5.items():
            bar = "█" * int(val * 100)
            print(f"      {feat:<16} {bar} {val:.3f}")

    bundle = {
        "model":         clf,
        "label_encoder": le,
        "feature_cols":  FEATURE_COLS,
        "version":       "meta_model_v3",
    }
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(bundle, f)

    if verbose:
        print(f"\n✅  Модель сохранена → {MODEL_PATH}")

    return bundle


# ── Prediction ────────────────────────────────────────────────────────────────

_cached_bundle = None

def _load_bundle():
    global _cached_bundle
    if _cached_bundle is None:
        with open(MODEL_PATH, "rb") as f:
            _cached_bundle = pickle.load(f)
    return _cached_bundle


def predict_risk(
    *,
    prob_norm: float,
    prob_sttc: float,
    prob_mi:   float,
    prob_hyp:  float,
    prob_cd:   float,
    age:       int,
    sex:       int,
    sbp:       float,
    cholesterol: float,
    smoking:   int,
    rose_flag: int,
) -> dict:
    bundle = _load_bundle()
    clf  = bundle["model"]
    le   = bundle["label_encoder"]
    cols = bundle["feature_cols"]

    ecg_sum = prob_norm + prob_sttc + prob_mi + prob_hyp + prob_cd
    if abs(ecg_sum - 1.0) > 0.05:
        raise ValueError(f"Сумма ЭКГ-вероятностей = {ecg_sum:.4f}, ожидалось ~1.0")

    row = pd.DataFrame([{
        "prob_norm":   prob_norm,
        "prob_sttc":   prob_sttc,
        "prob_mi":     prob_mi,
        "prob_hyp":    prob_hyp,
        "prob_cd":     prob_cd,
        "age":         age,
        "sex":         sex,
        "sbp":         sbp,
        "cholesterol": cholesterol,
        "smoking":     smoking,
        "rose_flag":   rose_flag,
    }])
    row = build_features(row)[cols]

    class_idx  = clf.predict(row)[0]
    class_prob = clf.predict_proba(row)[0]
    risk_class = le.inverse_transform([class_idx])[0]

    lo, hi = MORTALITY_SCALE[risk_class]
    confidence = float(class_prob[class_idx])
    mortality  = lo + confidence * (hi - lo)
    mortality  = round(float(np.clip(mortality, lo, hi)), 1)

    proba_dict = {le.inverse_transform([i])[0]: round(float(p), 4)
                  for i, p in enumerate(class_prob)}

    return {
        "risk_class":     risk_class,
        "mortality_10y":  mortality,
        "recommendation": RECOMMENDATIONS[risk_class],
        "probabilities":  proba_dict,
    }


# ── CLI entry point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    train_model(verbose=True)

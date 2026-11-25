"""Train two compact multiclass text models and export browser-executable weights.
Run inside this directory's parent: python model/train.py
The two text files are hand-authored product examples, not institutional student data.
"""
import base64
import json
import math
import re
import unicodedata
from pathlib import Path
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parent
def read_examples(filename):
    groups = {}
    for line in (ROOT / filename).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("["):
            section = line[1:-1]
            groups[section] = []
        else:
            groups[section].append(line)
    return groups

def features(text):
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"[\u064B-\u065F\u0670\u0640]", "", text)
    text = re.sub("[أإآٱ]", "ا", text).replace("ى", "ي").replace("ة", "ه")
    words = re.findall(r"[a-z0-9\u0621-\u063A\u0641-\u064A\u0660-\u0669]+", text)
    output = []
    for word in words:
        padded = "^" + word + "$"
        output.extend(["@" + word] * 2)
        for length in (2, 3, 4):
            output.extend(padded[j:j+length] for j in range(len(padded) - length + 1))
    return output

def encoded(array):
    return base64.b64encode(np.asarray(array, dtype=np.uint8).tobytes()).decode("ascii")

def train(head, groups, test_groups):
    def corpus(data):
        return [(sample, label.split(".")[1]) for label, rows in data.items()
                if label.startswith(head+".") for sample in rows]
    rows, tests = corpus(groups), corpus(test_groups)
    vectorizer = TfidfVectorizer(analyzer=features, lowercase=False, sublinear_tf=True, min_df=1)
    matrix = vectorizer.fit_transform([s for s, _ in rows])
    model = LogisticRegression(C=20, max_iter=400, random_state=9)
    model.fit(matrix, [label for _, label in rows])
    names = list(model.classes_)
    words = list(vectorizer.get_feature_names_out())
    coefficients = np.array(model.coef_)
    scale = float(abs(coefficients).max() / 127)
    quantized = np.rint(coefficients / scale).astype(np.int8)
    test_x = vectorizer.transform([s for s, _ in tests])
    scores = test_x @ (quantized.astype(float) * scale).T + model.intercept_
    shifted = np.exp(scores - scores.max(axis=1, keepdims=True))
    probabilities = shifted / shifted.sum(axis=1, keepdims=True)
    counts = {"correct":0, "abstained":0, "wrong":0}
    wrong = []
    for row, (sample, expected) in zip(probabilities, tests):
        order = np.argsort(row)[::-1]
        prediction = names[order[0]]
        threshold = .32 if head=="domain" else .32
        if row[order[0]] < threshold or row[order[0]] - row[order[1]] < .09:
            prediction = "unknown"
        if prediction == expected:
            counts["correct"] += 1
        else:
            counts["abstained" if prediction=="unknown" else "wrong"] += 1
            wrong.append([expected, prediction, sample])
    print(head, len(rows),len(tests),counts,wrong)
    return {"labels":names,"vocabulary":words,"idf":[round(float(v),4) for v in vectorizer.idf_],
            "offsets":[round(float(x),6) for x in model.intercept_],
            "scale":round(scale,9),"weights":encoded(quantized.view(np.uint8)),"size":len(rows)}, counts

if __name__ == "__main__":
    train_set, test_set = read_examples("examples.txt"), read_examples("holdout.txt")
    assert not ({s for rows in train_set.values() for s in rows}
                & {s for rows in test_set.values() for s in rows})
    params = {head:train(head,train_set,test_set)[0] for head in ("intent","domain")}
    generated=(ROOT / "runtime.js").read_text().replace("/*PARAMETERS*/null",json.dumps(params,ensure_ascii=False,separators=(",",":")))
    (ROOT.parent/"docs"/"learned.js").write_text(generated)

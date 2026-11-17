# 2-1 해파리 출현 경보 예측 · K-최근접 이웃(KNN) — 실습 코드
# 실습 데이터: data/P4_부산연안_해파리모니터링.csv (수업용 가상 데이터)

import numpy as np, pandas as pd, matplotlib.pyplot as plt, warnings
warnings.filterwarnings("ignore")
import logging; logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = ["NanumGothic", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False
from sklearn.metrics import mean_squared_error
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))

# %% 3단계 · 데이터 불러오기와 점검
# 경보단계 표기와 '없음' 같은 글자 값을 확인한다.
p4 = pd.read_csv("data/P4_부산연안_해파리모니터링.csv")
print(p4.shape, "중복:", p4.duplicated().sum(), "염분 결측:", p4["염분_psu"].isna().sum())
print(p4["경보단계"].value_counts())
print("상류해역출현밀도 '없음':", (p4["상류해역출현밀도"] == "없음").sum())

# %% 3단계 · 정제
# 글자 '없음'은 0으로, 경보단계는 관심·주의·경보 세 가지로 통일한다.
p4 = p4.drop_duplicates()
p4["상류해역출현밀도"] = pd.to_numeric(p4["상류해역출현밀도"].replace("없음", 0))
p4["경보단계"] = p4["경보단계"].replace({"관심단계": "관심", "주의보": "주의", "경보발령": "경보"})
p4["염분_psu"] = p4["염분_psu"].interpolate()
p4["연도"] = p4["조사일"].str[:4].astype(int); p4["월"] = p4["조사일"].str[5:7].astype(int)
print(p4["경보단계"].value_counts())

# %% 4단계 · 탐색적 데이터 분석
# 단계별 평균과 각 변수의 범위(최솟값~최댓값)를 비교한다. 범위 차이가 KNN에 왜 중요할까?
F = ["표층수온_C", "염분_psu", "주간남풍일수", "상류해역출현밀도"]
order = ["관심", "주의", "경보"]
print(p4.groupby("경보단계")[F].mean().loc[order].round(2))
print(p4[F].agg(["min", "max"]).round(1))
for lv, c in zip(order, ["#5aa469", "#f2b134", "#d9534f"]):
    d = p4[p4["경보단계"] == lv]; plt.scatter(d["표층수온_C"], d["상류해역출현밀도"], s=12, c=c, label=lv, alpha=.7)
plt.xlabel("수온(℃)"); plt.ylabel("상류해역 출현밀도"); plt.legend(); plt.title("단계별 분포"); plt.show()

# %% 5단계 · KNN 학습: 스케일링과 K 고르기
# 스케일링 없이/있이 비교하고, 교차검증으로 K를 고른다.
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.model_selection import cross_val_score
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
tr, te = p4[p4["연도"] < 2025], p4[p4["연도"] == 2025]
ks = {k: cross_val_score(make_pipeline(StandardScaler(), KNeighborsClassifier(k)), tr[F], tr["경보단계"], cv=5).mean() for k in [1, 3, 5, 7, 9, 15]}
print({k: round(v, 3) for k, v in ks.items()}); best = max(ks, key=ks.get); print("최적 K =", best)
raw = KNeighborsClassifier(best).fit(tr[F], tr["경보단계"])
model = make_pipeline(StandardScaler(), KNeighborsClassifier(best)).fit(tr[F], tr["경보단계"])
print("스케일링 없음 정확도:", round(accuracy_score(te["경보단계"], raw.predict(te[F])), 3))
pr = model.predict(te[F]); print("스케일링 있음 정확도:", round(accuracy_score(te["경보단계"], pr), 3))
print(confusion_matrix(te["경보단계"], pr, labels=order)); print(classification_report(te["경보단계"], pr))

# %% 6단계 · 이번 주 깃발 정하기
# 이번 주 조건을 넣어 경보 단계를 예측하고, 가장 가까운 이웃 5개를 살펴본다.
week = pd.DataFrame([{"표층수온_C": 26.5, "염분_psu": 31.0, "주간남풍일수": 5, "상류해역출현밀도": 4.0}])
print("예측 단계:", model.predict(week)[0])
dist, idx = model[-1].kneighbors(model[0].transform(week), n_neighbors=5)
print(tr.iloc[idx[0]][F + ["경보단계"]])

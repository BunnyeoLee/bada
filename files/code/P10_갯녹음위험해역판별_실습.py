# 2-2 갯녹음 위험 해역 판별 · 서포트 벡터 머신(SVM) — 실습 코드
# 실습 데이터: data3/P10_부산연안_갯녹음조사.csv (수업용 가상 데이터)

import numpy as np, pandas as pd, matplotlib.pyplot as plt, warnings
warnings.filterwarnings("ignore")
import logging; logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = ["NanumGothic", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False
from sklearn.metrics import mean_squared_error
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))

# %% 3단계 · 데이터 불러오기와 점검
# 라벨 표기, 100%를 넘는 피복률, 결측을 확인한다.
g = pd.read_csv("data3/P10_부산연안_갯녹음조사.csv")
print(g.shape, "중복:", g.duplicated().sum(), "성게 결측:", g["성게밀도_개체perm2"].isna().sum(), "/ 피복률 100 초과:", (g["무절석회조류피복률_pct"] > 100).sum())
print(g["갯녹음"].value_counts())

# %% 3단계 · 정제
# 라벨을 진행/정상으로 통일, 100% 초과는 결측, 결측은 구군별 중앙값으로 채운다.
g = g.drop_duplicates()
g["갯녹음"] = g["갯녹음"].replace({"진행중": "진행", "갯녹음": "진행", "normal": "정상"})
g.loc[g["무절석회조류피복률_pct"] > 100, "무절석회조류피복률_pct"] = np.nan
for c in ["성게밀도_개체perm2", "무절석회조류피복률_pct"]:
    g[c] = g.groupby("구군")[c].transform(lambda s: s.fillna(s.median()))
g["y"] = (g["갯녹음"] == "진행").astype(int)
F = ["수심_m", "여름최고수온_C", "성게밀도_개체perm2", "영양염_umol", "탁도_NTU", "무절석회조류피복률_pct"]
print(g["갯녹음"].value_counts(), "결측:", g[F].isna().sum().sum())

# %% 4단계 · 탐색적 데이터 분석
# 수온과 성게 밀도 평면에서 진행·정상 지점이 어떻게 나뉘는지 본다.
print(g.groupby("y")[F].mean().round(2).T)
for yv, c, lb in [(0, "#3b82c4", "정상"), (1, "#d9534f", "진행")]:
    d = g[g["y"] == yv]; plt.scatter(d["여름최고수온_C"], d["성게밀도_개체perm2"], s=12, c=c, label=lb, alpha=.7)
plt.xlabel("여름 최고수온(℃)"); plt.ylabel("성게 밀도(개체/㎡)"); plt.legend(); plt.title("갯녹음 진행 여부"); plt.show()

# %% 5단계 · SVM 학습: 커널과 C 고르기
# 층화 8:2 분할 후 그리드 탐색으로 커널·C·gamma를 고른다.
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.model_selection import train_test_split, GridSearchCV, StratifiedKFold
from sklearn.metrics import accuracy_score, recall_score, confusion_matrix
tr, te = train_test_split(g, test_size=0.2, random_state=0, stratify=g["y"])
grid = GridSearchCV(make_pipeline(StandardScaler(), SVC()), {"svc__kernel": ["linear", "rbf"], "svc__C": [0.1, 1, 10], "svc__gamma": ["scale", 0.1]},
                    cv=StratifiedKFold(5, shuffle=True, random_state=0)).fit(tr[F], tr["y"])
best = grid.best_estimator_; pr = best.predict(te[F])
print("최적 조합:", grid.best_params_)
print("정확도=%.3f 재현율=%.3f" % (accuracy_score(te["y"], pr), recall_score(te["y"], pr)))
print(confusion_matrix(te["y"], pr))
noscale = SVC(kernel="rbf").fit(tr[F], tr["y"]); print("스케일링 없는 SVM 정확도: %.3f" % accuracy_score(te["y"], noscale.predict(te[F])))

# %% 6단계 · 복원 우선 해역 고르기
# 모든 조사 지점의 갯녹음 진행 가능성을 계산해 구군별로 정리한다.
g["판별"] = best.predict(g[F])
r = g.groupby("구군")["판별"].mean().sort_values(ascending=False) * 100
print(r.round(1)); r.plot.bar(rot=0, color="#2f7d6d", title="구군별 갯녹음 판별 비율(%)"); plt.show()

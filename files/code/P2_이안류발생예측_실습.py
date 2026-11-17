# 1-1 이안류 발생 예측 · 로지스틱 회귀 — 실습 코드
# 실습 데이터: data/P2_해운대_해양관측부이_일별.csv, data/P2_해운대해수욕장_안전관리일지.csv (수업용 가상 데이터)

import numpy as np, pandas as pd, matplotlib.pyplot as plt, warnings
warnings.filterwarnings("ignore")
import logging; logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = ["NanumGothic", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False
from sklearn.metrics import mean_squared_error
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))

# %% 3단계 · 데이터 불러오기와 점검
# 부이 관측 자료와 안전관리일지를 점검한다. 풍향 표기와 날짜 형식을 살펴보자.
buoy = pd.read_csv("data/P2_해운대_해양관측부이_일별.csv")
safe = pd.read_csv("data/P2_해운대해수욕장_안전관리일지.csv")
print(buoy.shape, safe.shape, "일지 중복:", safe.duplicated().sum())
print("파주기 결측:", buoy["파주기_s"].isna().sum(), "/ 음수 파고:", (buoy["유의파고_m"] < 0).sum())
print("풍향 표기:", sorted(buoy["풍향"].unique()))
print(buoy.head(3)); print(safe.head(3))

# %% 3단계 · 정제와 병합
# 중복 삭제, 날짜 통일, 풍향 표기 통일, 음수 파고 처리 후 두 표를 합친다.
safe = safe.drop_duplicates()
safe["관측일"] = pd.to_datetime(safe["날짜"].astype(str), format="%Y%m%d").dt.strftime("%Y-%m-%d")
dmap = {"S": "남", "남풍": "남", "SE": "남동", "남동풍": "남동", "SW": "남서", "E": "동", "NE": "북동", "W": "서", "N": "북"}
buoy["풍향"] = buoy["풍향"].replace(dmap)
buoy.loc[buoy["유의파고_m"] < 0, "유의파고_m"] = np.nan
df = buoy.merge(safe.drop(columns="날짜"), on="관측일")
df["유의파고_m"] = df["유의파고_m"].interpolate()
df["파주기_s"] = df["파주기_s"].fillna(df["파주기_s"].median())
df["y"] = (df["이안류발생"] == "Y").astype(int)
df["연도"] = df["관측일"].str[:4].astype(int)
df["남향파"] = df["풍향"].isin(["남", "남동"]).astype(int)
df = pd.get_dummies(df, columns=["조위단계"], dtype=int)
print(df.shape, "이안류 발생 비율: %.1f%%" % (df["y"].mean() * 100))

# %% 4단계 · 탐색적 데이터 분석
# 이안류가 난 날과 안 난 날의 평균을 비교하고, 파주기별 발생률을 본다.
print(df.groupby("y")[["유의파고_m", "파주기_s", "풍속_ms", "입욕객수_명"]].mean().round(2))
bins = pd.cut(df["파주기_s"], [0, 6, 8, 20], labels=["6초 미만", "6~8초", "8초 이상"])
rate = df.groupby(bins, observed=True)["y"].mean() * 100
rate.plot.bar(color="#e07b39", rot=0, title="파주기별 이안류 발생률(%)"); plt.show()

# %% 5단계 · 로지스틱 회귀 학습과 평가
# 2024년까지 학습, 2025년 검증. 생명이 걸린 문제이므로 재현율을 중심으로 본다.
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import accuracy_score, recall_score, precision_score, confusion_matrix
F = ["유의파고_m", "파주기_s", "풍속_ms", "남향파", "조위단계_간조", "조위단계_만조"]
tr, te = df[df["연도"] < 2025], df[df["연도"] == 2025]
model = make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000)).fit(tr[F], tr["y"])
prob = model.predict_proba(te[F])[:, 1]
print("'항상 없음' 기준선 정확도:", round(accuracy_score(te["y"], np.zeros(len(te))), 3))
for th in [0.5, 0.35]:
    pr = (prob >= th).astype(int)
    print(f"임곗값 {th}: 정확도={accuracy_score(te['y'], pr):.3f} 재현율={recall_score(te['y'], pr):.3f} 정밀도={precision_score(te['y'], pr):.3f}")
    print(confusion_matrix(te["y"], pr))

# %% 6단계 · 위험 깃발 시나리오
# 오늘의 바다 조건을 넣어 이안류 확률을 계산하고, 깃발 색을 정해 보자.
today = pd.DataFrame([{"유의파고_m": 1.2, "파주기_s": 9.0, "풍속_ms": 5.0, "남향파": 1, "조위단계_간조": 1, "조위단계_만조": 0}])
p = model.predict_proba(today[F])[0, 1]
flag = "빨강(입욕 금지)" if p >= 0.5 else ("노랑(주의)" if p >= 0.35 else "초록(안전)")
print(f"이안류 확률 {p*100:.0f}% → 깃발: {flag}")
coef = pd.Series(model[-1].coef_[0], index=F).sort_values()
coef.plot.barh(color="#2f7d6d", title="로지스틱 회귀 계수(표준화)"); plt.show()

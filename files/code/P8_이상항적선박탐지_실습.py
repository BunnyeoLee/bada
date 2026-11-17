# 1-2 이상 항적 선박 탐지 · 아이솔레이션 포레스트 — 실습 코드
# 실습 데이터: data3/P8_부산항_선박항적요약.csv, data3/P8_해경_현장점검결과.csv (수업용 가상 데이터)

import numpy as np, pandas as pd, matplotlib.pyplot as plt, warnings
warnings.filterwarnings("ignore")
import logging; logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = ["NanumGothic", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False
from sklearn.metrics import mean_squared_error
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))

# %% 3단계 · 데이터 불러오기와 점검
# 선박 항적 요약을 점검한다. 선종 표기와 비정상 속력을 찾아보자.
s = pd.read_csv("data3/P8_부산항_선박항적요약.csv"); lab = pd.read_csv("data3/P8_해경_현장점검결과.csv")
print(s.shape, lab.shape, "속력 결측:", s["평균속력_kn"].isna().sum(), "/ 40노트 초과:", (s["평균속력_kn"] > 40).sum())
print(s["선종"].value_counts())

# %% 3단계 · 정제
# 비정상 속력은 결측으로, 선종 표기를 통일한 뒤 같은 선종의 중앙값으로 채운다.
s.loc[s["평균속력_kn"] > 40, "평균속력_kn"] = np.nan
s["선종"] = s["선종"].replace({"cargo": "화물선", "FISHING": "어선", "어 선": "어선"})
s["평균속력_kn"] = s.groupby("선종")["평균속력_kn"].transform(lambda c: c.fillna(c.median()))
F = ["평균속력_kn", "속력표준편차_kn", "침로변화_도per시간", "항로이탈거리_해리", "야간운항비율", "AIS신호끊김_회", "배회시간_h"]
print(s["선종"].value_counts()); print(s[F].describe().round(2))

# %% 4단계 · 탐색적 데이터 분석
# 대부분의 배는 AIS 신호가 끊기지 않는다. 분포를 보고 '이상'이 얼마나 드문지 느껴 보자.
fig, ax = plt.subplots(1, 2, figsize=(11, 3.6))
s["AIS신호끊김_회"].value_counts().sort_index().plot.bar(ax=ax[0], rot=0, color="#3b82c4", title="AIS 신호 끊김 횟수")
ax[1].scatter(s["항로이탈거리_해리"], s["배회시간_h"], s=6, alpha=.5); ax[1].set_xlabel("항로이탈(해리)"); ax[1].set_ylabel("배회시간(h)")
plt.tight_layout(); plt.show()

# %% 5단계 · 아이솔레이션 포레스트로 이상 탐지
# 정답(라벨) 없이 학습한다. 상위 이상 선박을 해경 점검 결과와 맞춰 보며 평가한다.
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
X = StandardScaler().fit_transform(s[F])
iso = IsolationForest(n_estimators=300, contamination=0.03, random_state=0).fit(X)
s["이상점수"] = -iso.score_samples(X); s["이상판정"] = (iso.predict(X) == -1).astype(int)
ev = s.merge(lab, on="선박ID"); ev["위반"] = (ev["해경점검결과"] == "위반 확인").astype(int)
top = ev.sort_values("이상점수", ascending=False)
print("이상 판정:", ev["이상판정"].sum(), "척 / 그중 위반:", ev[ev["이상판정"] == 1]["위반"].sum(), "척")
print("무작위로 골랐을 때 위반 비율: %.1f%%" % (ev["위반"].mean() * 100))
for k in [20, 60, 100]: print(f"이상점수 상위 {k}척 중 위반 비율: {top.head(k)['위반'].mean()*100:.0f}%")

# %% 6단계 · 점검 우선순위 표 만들기
# 해경에게 전달할 '오늘의 점검 우선순위 10척'을 만든다. 왜 이상인지도 함께 보여 주자.
cols = ["선박ID", "선종", "이상점수"] + F
print(top[cols].head(10).round(2).to_string(index=False))

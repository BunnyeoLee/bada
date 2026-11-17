# 2-1 해운대 방문객 예측 · 랜덤 포레스트 — 실습 코드
# 실습 데이터: data3/P6_공휴일_축제일정.csv, data3/P6_해운대_일별기상해양.csv, data3/P6_해운대해수욕장_일별방문객.csv (수업용 가상 데이터)

import numpy as np, pandas as pd, matplotlib.pyplot as plt, warnings
warnings.filterwarnings("ignore")
import logging; logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = ["NanumGothic", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False
from sklearn.metrics import mean_squared_error
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))

# %% 3단계 · 데이터 불러오기와 점검
# 방문객·기상·휴일 세 파일을 불러와 오류값과 결측을 확인한다.
v = pd.read_csv("data3/P6_해운대해수욕장_일별방문객.csv")
w = pd.read_csv("data3/P6_해운대_일별기상해양.csv")
h = pd.read_csv("data3/P6_공휴일_축제일정.csv")
print(v.shape, w.shape, h.shape, "중복:", v.duplicated().sum())
print("방문객 결측:", v["방문객_만명"].isna().sum(), "/ 500 초과:", (v["방문객_만명"] > 500).sum(), "/ 기온 결측:", w["최고기온_C"].isna().sum())
print(v.head(3)); print(w.head(3)); print(h.head(3))

# %% 3단계 · 정제와 특성 만들기
# 오류값 제거 후 병합하고 휴일·축제·해파리 같은 0/1 특성을 만든다.
v = v.drop_duplicates(); v.loc[v["방문객_만명"] > 500, "방문객_만명"] = np.nan; v = v.dropna(subset=["방문객_만명"])
w["날짜"] = pd.to_datetime(w["일자"].astype(str)).dt.strftime("%Y-%m-%d"); w["최고기온_C"] = w["최고기온_C"].interpolate()
df = v.merge(w.drop(columns="일자"), on="날짜")
df["휴일"] = (df["요일"].isin(["토", "일"]) | df["날짜"].isin(h[h["구분"] == "공휴일"]["날짜"])).astype(int)
df["축제"] = df["날짜"].isin(h[h["구분"] == "바다축제"]["날짜"]).astype(int)
df["해파리"] = (df["해파리특보"] == "발령").astype(int)
d = pd.to_datetime(df["날짜"]); df["연도"] = d.dt.year; df["연중일"] = d.dt.dayofyear
print(df.shape); df.head(3)

# %% 4단계 · 탐색적 데이터 분석
# 연도별·휴일 여부·비 여부에 따라 방문객이 어떻게 다른지 본다.
print(df.groupby("연도")["방문객_만명"].mean().round(2))
print("휴일 %.2f / 평일 %.2f 만 명" % (df[df["휴일"] == 1]["방문객_만명"].mean(), df[df["휴일"] == 0]["방문객_만명"].mean()))
plt.figure(figsize=(8, 3.6)); plt.scatter(df["최고기온_C"], df["방문객_만명"], c=df["휴일"], cmap="coolwarm", s=10)
plt.xlabel("최고기온(℃)"); plt.ylabel("방문객(만 명)"); plt.title("기온·휴일과 방문객"); plt.show()

# %% 5단계 · 랜덤 포레스트 학습과 평가
# 2022~2024년 학습, 2025년 검증. 선형 회귀와 비교한다.
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score
F = ["최고기온_C", "강수량_mm", "수온_C", "파고_m", "휴일", "축제", "해파리", "연중일"]
tr, te = df[df["연도"].between(2022, 2024)], df[df["연도"] == 2025]; y = te["방문객_만명"]
lin = LinearRegression().fit(tr[F], tr["방문객_만명"])
rf = RandomForestRegressor(200, min_samples_leaf=3, random_state=0).fit(tr[F], tr["방문객_만명"])
for n, m in [("선형 회귀", lin), ("랜덤 포레스트", rf)]:
    p = m.predict(te[F]); print(f"{n:8s} RMSE={rmse(y, p):.2f}만 명  R²={r2_score(y, p):.3f}")
pd.Series(rf.feature_importances_, index=F).sort_values().plot.barh(color="#2f7d6d", title="변수 중요도"); plt.show()

# %% 6단계 · 주말 시나리오 예측
# 날씨 시나리오별 방문객을 예측해 안전요원 배치 계획에 활용해 보자.
base = dict(최고기온_C=33, 강수량_mm=0, 수온_C=25, 파고_m=0.6, 휴일=1, 축제=0, 해파리=0, 연중일=215)
scen = {"맑은 토요일 33℃": {}, "비 오는 토요일(30mm)": dict(최고기온_C=27, 강수량_mm=30), "맑은 평일": dict(휴일=0), "토요일+해파리특보": dict(해파리=1)}
for n, ch in scen.items():
    x = pd.DataFrame([{**base, **ch}])[F]; print(f"{n:16s} → {rf.predict(x)[0]:.1f}만 명")

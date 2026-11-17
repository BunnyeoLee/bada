# 1-1 해수면 상승 예측 · 선형 회귀 — 실습 코드
# 실습 데이터: data/P1_부산연안_해양기상_월별.csv, data/P1_부산조위관측소_월평균해수면.csv (수업용 가상 데이터)

import numpy as np, pandas as pd, matplotlib.pyplot as plt, warnings
warnings.filterwarnings("ignore")
import logging; logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = ["NanumGothic", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False
from sklearn.metrics import mean_squared_error
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))

# %% 3단계 · 데이터 불러오기와 점검
# 두 파일을 불러와 행 수, 중복, 결측, 최댓값을 확인한다. 이상한 값이 보이는가?
sl = pd.read_csv("data/P1_부산조위관측소_월평균해수면.csv")
mc = pd.read_csv("data/P1_부산연안_해양기상_월별.csv")
print("해수면:", sl.shape, "/ 기상:", mc.shape)
print("중복 행:", sl.duplicated().sum())
print("결측(해수면):", sl["평균해수면_cm"].isna().sum(), "/ 결측(수온):", mc["표층수온_C"].isna().sum())
print(sl["평균해수면_cm"].describe().round(1))
print(sl.head(3)); print(mc.head(3))

# %% 3단계 · 정제와 병합
# 중복 삭제 → 오류값을 결측으로 → 날짜 형식 통일 → 병합 → 보간 순서로 정제한다.
sl = sl.drop_duplicates()
sl.loc[sl["평균해수면_cm"] > 500, "평균해수면_cm"] = np.nan      # 센서 오류 코드 999.9
mc["관측월"] = mc["연월"].astype(str).str[:4] + "-" + mc["연월"].astype(str).str[4:]
df = sl.merge(mc.drop(columns="연월"), on="관측월")
df[["평균해수면_cm", "표층수온_C"]] = df[["평균해수면_cm", "표층수온_C"]].interpolate()
df["연도"] = df["관측월"].str[:4].astype(int); df["월"] = df["관측월"].str[5:].astype(int)
df["경과연수"] = (df["연도"] - 1990) + (df["월"] - 1) / 12
print(df.shape, "남은 결측:", df.isna().sum().sum())
df.head()

# %% 4단계 · 탐색적 데이터 분석
# 연평균 추세와 월별 계절성을 그래프로 비교하고 상관계수를 구한다.
ann = df.groupby("연도")["평균해수면_cm"].mean()
mon = df.groupby("월")["평균해수면_cm"].mean()
print("1990년 %.1fcm → 2025년 %.1fcm" % (ann.loc[1990], ann.loc[2025]))
print("계절 진폭: %.1fcm" % (mon.max() - mon.min()))
print(df[["평균해수면_cm", "표층수온_C", "해면기압_hPa", "월강수량_mm"]].corr()["평균해수면_cm"].round(2))
fig, ax = plt.subplots(1, 2, figsize=(11, 3.6))
ax[0].plot(ann.index, ann.values, marker="o"); ax[0].set_title("연평균 해수면(cm)")
ax[1].bar(mon.index, mon.values, color="#3b82c4"); ax[1].set_title("월별 평균 해수면"); ax[1].set_ylim(mon.min() - 5, mon.max() + 3)
plt.tight_layout(); plt.show()

# %% 5단계 · 선형 회귀 모델 학습과 평가
# 2017년까지 학습, 2018년부터 검증(시간 순서 분할). 단순 회귀와 다중 회귀를 비교한다.
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score
tr, te = df[df["연도"] < 2018], df[df["연도"] >= 2018]
y_tr, y_te = tr["평균해수면_cm"], te["평균해수면_cm"]
for name, X in {"단순(경과연수)": ["경과연수"], "다중(경과연수·수온·기압)": ["경과연수", "표층수온_C", "해면기압_hPa"]}.items():
    m = LinearRegression().fit(tr[X], y_tr); p = m.predict(te[X])
    print(f"{name:20s} RMSE={rmse(y_te, p):.2f}cm  R²={r2_score(y_te, p):.3f}  기울기={np.round(m.coef_, 3)}")

# %% 6단계 · 2050년 예측과 공유
# 연평균 해수면으로 추세선을 만들고 2050년을 예측한다. 결과를 한 문장 메시지로 정리해 보자.
a = ann.reset_index()
lr = LinearRegression().fit(a[["연도"]], a["평균해수면_cm"])
fut = pd.DataFrame({"연도": [2025, 2050, 2100]})
pred = lr.predict(fut)
print("상승 속도: 연 %.2fmm" % (lr.coef_[0] * 10))
for y, v in zip(fut["연도"], pred): print(f"{y}년 예측: {v:.1f}cm")
yy = np.arange(1990, 2051)
plt.figure(figsize=(8, 3.6)); plt.plot(a["연도"], a["평균해수면_cm"], "o", label="관측(연평균)")
plt.plot(yy, lr.predict(pd.DataFrame({"연도": yy})), "--", label="추세선")
plt.title("부산 해수면 추세와 2050년 예측"); plt.legend(); plt.show()

# 1-2 기장 멸치 어획량 예측 · 결정 트리 — 실습 코드
# 실습 데이터: data/P3_기장연안_멸치어획_해양환경_월별.csv (수업용 가상 데이터)

import numpy as np, pandas as pd, matplotlib.pyplot as plt, warnings
warnings.filterwarnings("ignore")
import logging; logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = ["NanumGothic", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False
from sklearn.metrics import mean_squared_error
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))

# %% 3단계 · 데이터 불러오기와 점검
# 수온 단위 열을 꼭 확인하자. 화씨와 섭씨가 섞여 있지 않은가?
p3 = pd.read_csv("data/P3_기장연안_멸치어획_해양환경_월별.csv")
print(p3.shape, "중복:", p3.duplicated().sum(), "클로로필 결측:", p3["클로로필a_mgm3"].isna().sum())
print(p3["수온단위"].value_counts()); print("최고 수온:", p3["표층수온"].max())
p3.head()

# %% 3단계 · 정제
# 중복 삭제, 화씨 → 섭씨 변환, 클로로필 결측은 같은 달의 중앙값으로 채운다.
p3 = p3.drop_duplicates()
f = p3["수온단위"] == "F"
p3.loc[f, "표층수온"] = ((p3.loc[f, "표층수온"] - 32) * 5 / 9).round(1)
p3 = p3.drop(columns="수온단위").rename(columns={"표층수온": "표층수온_C"})
p3["월"] = p3["연월"].str[5:].astype(int); p3["연도"] = p3["연월"].str[:4].astype(int)
p3["클로로필a_mgm3"] = p3.groupby("월")["클로로필a_mgm3"].transform(lambda s: s.fillna(s.median()))
print(p3.shape, "최고 수온:", p3["표층수온_C"].max(), "결측:", p3.isna().sum().sum())

# %% 4단계 · 탐색적 데이터 분석
# 수온 구간별 평균 어획량을 보자. 직선 관계일까, 산 모양일까?
bins = pd.cut(p3["표층수온_C"], [0, 14, 19, 22.5, 24, 40], labels=["<14", "14~19", "19~22.5", "22.5~24", ">24"])
by_t = p3.groupby(bins, observed=True)["멸치어획량_톤"].mean().round(1)
print(by_t); print("수온과의 상관계수:", round(p3["멸치어획량_톤"].corr(p3["표층수온_C"]), 2))
fig, ax = plt.subplots(1, 2, figsize=(11, 3.6))
ax[0].scatter(p3["표층수온_C"], p3["멸치어획량_톤"], s=12, alpha=.6); ax[0].set_xlabel("수온(℃)"); ax[0].set_title("수온과 어획량")
by_t.plot.bar(ax=ax[1], rot=0, color="#3b82c4", title="수온 구간별 평균 어획량(톤)"); plt.tight_layout(); plt.show()

# %% 5단계 · 결정 트리 학습과 깊이 조절
# 2022년까지 학습, 2023년부터 검증. 깊이에 따라 성능이 어떻게 변하는지 비교한다.
from sklearn.tree import DecisionTreeRegressor, export_text
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score
F = ["표층수온_C", "염분_psu", "클로로필a_mgm3", "월강수량_mm", "출어일수", "월"]
tr, te = p3[p3["연도"] <= 2022], p3[p3["연도"] >= 2023]
y_tr, y_te = tr["멸치어획량_톤"], te["멸치어획량_톤"]
lin = LinearRegression().fit(tr[F], y_tr); print("선형 회귀 RMSE: %.1f" % rmse(y_te, lin.predict(te[F])))
for d in [2, 3, 4, 6, None]:
    dt = DecisionTreeRegressor(max_depth=d, random_state=0).fit(tr[F], y_tr)
    print(f"깊이 {str(d):4s} 학습 RMSE={rmse(y_tr, dt.predict(tr[F])):6.1f}  검증 RMSE={rmse(y_te, dt.predict(te[F])):6.1f}")

# %% 6단계 · 규칙 읽기와 공유
# 깊이 3 트리의 규칙과 변수 중요도를 보고, 어민에게 전할 한 문장을 만들어 보자.
dt = DecisionTreeRegressor(max_depth=3, random_state=0).fit(tr[F], y_tr)
print(export_text(dt, feature_names=F))
pd.Series(dt.feature_importances_, index=F).sort_values().plot.barh(color="#2f7d6d", title="변수 중요도"); plt.show()

# 2-2 고등어 위판 가격 예측 · 인공신경망 — 실습 코드
# 실습 데이터: data3/P9_부산공동어시장_고등어위판_일별.csv (수업용 가상 데이터)

import numpy as np, pandas as pd, matplotlib.pyplot as plt, warnings
warnings.filterwarnings("ignore")
import logging; logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = ["NanumGothic", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False
from sklearn.metrics import mean_squared_error
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))

# %% 3단계 · 데이터 불러오기와 점검
# 가격이 0인 날, 중복, 수입량 결측을 찾는다.
p9 = pd.read_csv("data3/P9_부산공동어시장_고등어위판_일별.csv")
print(p9.shape, "중복:", p9.duplicated().sum(), "가격 0:", (p9["평균가격_원perkg"] == 0).sum(), "수입 결측:", p9["수입고등어_백톤"].isna().sum())
p9.head()

# %% 3단계 · 정제와 로그 변환
# 휴장일(가격 0) 제거, 수입량 보간, 위판량에 로그를 씌운다.
p9 = p9.drop_duplicates(); p9 = p9[p9["평균가격_원perkg"] > 0].copy()
p9["수입고등어_백톤"] = p9["수입고등어_백톤"].interpolate()
d = pd.to_datetime(p9["위판일"]); p9["연도"] = d.dt.year; p9["월"] = d.dt.month
p9["로그위판량"] = np.log(p9["위판량_톤"])
print(p9.shape)

# %% 4단계 · 탐색적 데이터 분석
# 위판량과 가격의 관계를 원자료와 로그 축으로 비교한다.
print("상관(원자료): %.2f / 상관(로그-로그): %.2f" % (p9["평균가격_원perkg"].corr(p9["위판량_톤"]), np.log(p9["평균가격_원perkg"]).corr(p9["로그위판량"])))
fig, ax = plt.subplots(1, 2, figsize=(11, 3.6))
ax[0].scatter(p9["위판량_톤"], p9["평균가격_원perkg"], s=5, alpha=.4); ax[0].set_title("원자료"); ax[0].set_xlabel("위판량(톤)")
ax[1].scatter(p9["로그위판량"], np.log(p9["평균가격_원perkg"]), s=5, alpha=.4, color="#e07b39"); ax[1].set_title("로그-로그"); ax[1].set_xlabel("log 위판량")
plt.tight_layout(); plt.show()

# %% 5단계 · 인공신경망 학습과 비교
# 2024년까지 학습, 2025년 검증. 선형 회귀와 신경망, 스케일링 유무를 비교한다(실행에 몇십 초 걸릴 수 있다).
from sklearn.neural_network import MLPRegressor
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
F = ["로그위판량", "대형어비율", "수온_C", "면세유가_원per리터", "수입고등어_백톤", "명절전2주", "월"]
tr, te = p9[p9["연도"] <= 2024], p9[p9["연도"] == 2025]; y = te["평균가격_원perkg"]
ylog = np.log(tr["평균가격_원perkg"])
mape = lambda a, p: float(np.mean(np.abs(p - a) / a) * 100)
lin = LinearRegression().fit(tr[F], ylog)
nn = make_pipeline(StandardScaler(), MLPRegressor(hidden_layer_sizes=(16,), solver="lbfgs", alpha=0.01, max_iter=3000, random_state=0)).fit(tr[F], ylog)
for n, m in [("선형 회귀(로그)", lin), ("신경망 16노드", nn)]:
    p = np.exp(m.predict(te[F])); print(f"{n:12s} RMSE={rmse(y, p):.0f}원  MAPE={mape(y, p):.1f}%")

# %% 6단계 · 위판량 민감도 분석
# 다른 조건은 그대로 두고 위판량만 바꿔 가격이 어떻게 변하는지 본다.
base = te[F].median().to_frame().T; base["명절전2주"] = 0
vols = [20, 30, 60, 120, 250]; prices = []
for vt in vols:
    x = base.copy(); x["로그위판량"] = np.log(vt); prices.append(float(np.exp(nn.predict(x)[0])))
for vt, pz in zip(vols, prices): print(f"위판량 {vt:4d}톤 → 예측 가격 {pz:,.0f}원/kg")
plt.plot(vols, prices, "o-"); plt.xlabel("위판량(톤)"); plt.ylabel("가격(원/kg)"); plt.title("위판량 민감도"); plt.show()

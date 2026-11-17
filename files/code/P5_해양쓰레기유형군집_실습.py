# 1-1 해양쓰레기 유형 군집 · K-Means — 실습 코드
# 실습 데이터: data/P5_부산해변_기본정보.csv, data/P5_부산해변_해양쓰레기_분기조사.csv (수업용 가상 데이터)

import numpy as np, pandas as pd, matplotlib.pyplot as plt, warnings
warnings.filterwarnings("ignore")
import logging; logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = ["NanumGothic", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False
from sklearn.metrics import mean_squared_error
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))

# %% 3단계 · 데이터 불러오기와 점검
# 해변 이름 표기, 음수 개수, 결측을 확인한다.
info = pd.read_csv("data/P5_부산해변_기본정보.csv")
sv = pd.read_csv("data/P5_부산해변_해양쓰레기_분기조사.csv")
print(sv.shape, "중복:", sv.duplicated().sum(), "결측:", sv.isna().sum().sum())
print("해변 이름 종류:", sv["해변명"].nunique(), "/ 기본정보 해변 수:", len(info))
print(sorted(sv["해변명"].unique()))

# %% 3단계 · 정제와 구성비 만들기
# 이름 통일, 음수 → 절댓값, 결측 → 해변별 중앙값. 해변 규모 차이를 없애려고 구성비로 바꾼다.
sv = sv.drop_duplicates()
sv["해변명"] = sv["해변명"].replace({"해운대": "해운대해수욕장", "광안리 해수욕장": "광안리해수욕장", "대변항": "기장 대변항", "감지해변": "태종대 감지해변"})
cnt = [c for c in sv.columns if c.endswith("_개")]
sv[cnt] = sv[cnt].abs()
sv[cnt] = sv.groupby("해변명")[cnt].transform(lambda s: s.fillna(s.median()))
site = sv.groupby("해변명")[cnt].sum()
ratio = site.div(site.sum(axis=1), axis=0); ratio.columns = [c.replace("_개", "") for c in cnt]
print(site.shape); ratio.round(2).head()

# %% 4단계 · 탐색적 데이터 분석
# 전체에서 많은 쓰레기 종류와 해변별 총량을 본다.
tot = site.sum().sort_values(ascending=False); tot.index = [c.replace("_개", "") for c in tot.index]
print((tot / tot.sum() * 100).round(1).head(5))
site.sum(axis=1).sort_values().plot.barh(figsize=(7, 5), color="#3b82c4", title="해변별 쓰레기 총량(개)"); plt.show()

# %% 5단계 · K-Means 군집과 K 고르기
# 표준화한 뒤 K=2~7의 엘보(관성)와 실루엣 계수를 비교해 K를 고른다.
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
Xs = StandardScaler().fit_transform(ratio)
iner, sil = {}, {}
for k in range(2, 8):
    km = KMeans(k, n_init=20, random_state=0).fit(Xs); iner[k] = km.inertia_; sil[k] = silhouette_score(Xs, km.labels_)
print({k: round(v, 3) for k, v in sil.items()}); best = max(sil, key=sil.get); print("실루엣 최대 K =", best)
fig, ax = plt.subplots(1, 2, figsize=(10, 3.4))
ax[0].plot(list(iner), list(iner.values()), "o-"); ax[0].set_title("엘보(관성)")
ax[1].plot(list(sil), list(sil.values()), "o-", color="#e07b39"); ax[1].set_title("실루엣 계수"); plt.tight_layout(); plt.show()

# %% 6단계 · 군집에 이름 붙이기
# 군집별 평균 구성비를 보고 '어업형', '관광형' 같은 이름을 붙여 보자.
km = KMeans(best, n_init=20, random_state=0).fit(Xs)
ratio["군집"] = km.labels_
print((ratio.groupby("군집").mean() * 100).round(1).T)
for g, d in ratio.groupby("군집"): print(f"군집 {g}:", ", ".join(d.index))

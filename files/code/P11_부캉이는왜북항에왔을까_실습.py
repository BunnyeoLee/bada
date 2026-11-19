# 2-3 부캉이는 왜 북항에 왔을까 · 선형 회귀(추세 분석) — 실습 코드
# 실습 데이터: data3/P11_부산연안_수온_일별_연습용.csv (수업용 가상 데이터)

import numpy as np, pandas as pd, matplotlib.pyplot as plt, warnings
warnings.filterwarnings("ignore")
import logging; logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = ["NanumGothic", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False
from sklearn.metrics import mean_squared_error
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))

# %% 3단계 · 데이터 불러오기와 점검
# 연습용 가상 수온 데이터를 불러와 행 수, 중복, 빈칸, 최솟값·최댓값을 점검한다. 관측 지점이 몇 곳인지도 확인하자. (실제 데이터를 올렸다면 파일 경로를 mydata/파일이름.csv 로 바꾼다)
df = pd.read_csv("data3/P11_부산연안_수온_일별_연습용.csv")   # 실제 데이터: "mydata/내려받은파일.csv"
print("행 수:", len(df), "/ 중복:", df.duplicated().sum(), "/ 빈칸:", df["수온"].isna().sum())
print(df["관측지점"].value_counts())
print(df["수온"].describe().round(1))
df.head()

# %% 3단계 · 정제: 지점 고르기, 중복·오류값·장기 결측
# 한 지점(기장)을 고르고, 중복 삭제 → 불가능한 값은 결측 → 짧은 빈칸 보간 → 한 달 넘게 빈 해는 제외한다.
g = df[df["관측지점"] == "기장"].drop_duplicates().copy()
g.loc[(g["수온"] < -2) | (g["수온"] > 35), "수온"] = np.nan        # 오류 코드·불가능한 값
g["연도"] = pd.to_datetime(g["관측일"]).dt.year
miss = g.groupby("연도")["수온"].apply(lambda s: s.isna().sum())     # 해마다 빈 날 수
print("빈 날이 많은 해:", miss[miss > 5].to_dict())
g["수온"] = g["수온"].interpolate(limit=5)                            # 5일 이하 짧은 빈칸만 보간
drop_years = miss[miss > 30].index.tolist()
g = g[~g["연도"].isin(drop_years)]
print("제외한 연도:", drop_years, "/ 남은 행:", len(g), "/ 남은 빈칸:", g["수온"].isna().sum())

# %% 4단계 · 탐색: 선호 수온대 일수와 연평균 수온
# 흑상어가 좋아하는 18~26℃에 머문 날을 해마다 세고, 연평균 수온과 함께 그린다.
g["선호수온"] = g["수온"].between(18, 26)
days = g.groupby("연도")["선호수온"].sum()        # 연도별 선호 수온대 일수(Target 1)
year_mean = g.groupby("연도")["수온"].mean()      # 연평균 수온(Target 2)
print(pd.DataFrame({"선호수온일수": days, "연평균수온": year_mean.round(2)}).T)
fig, a1 = plt.subplots(figsize=(9, 3.8))
a1.bar(days.index, days.values, color="#7FC6D9"); a1.set_ylabel("선호 수온대 일수(일)"); a1.set_ylim(0, days.max() * 1.25)
a2 = a1.twinx(); a2.plot(year_mean.index, year_mean.values, "o-", color="#C0392B"); a2.set_ylabel("연평균 수온(℃)")
plt.title("연도별 선호 수온대 일수(막대)와 연평균 수온(선)"); plt.show()

# %% 5단계 · 선형 회귀로 추세 구하고 검증하기
# 연도를 입력으로 회귀선을 그어 10년당 변화를 구한다. 앞쪽 연도로 학습하고 최근 해로 검증하며, 학습 기간에 따라 기울기가 얼마나 흔들리는지도 본다.
from sklearn.linear_model import LinearRegression
for name, s in [("연평균 수온(℃)", year_mean), ("선호 수온대 일수(일)", days.astype(float))]:
    d = s.reset_index(); d.columns = ["연도", "y"]
    m = LinearRegression().fit(d[["연도"]], d["y"])
    tr, te = d[d["연도"] <= 2017], d[d["연도"] >= 2018]
    mt = LinearRegression().fit(tr[["연도"]], tr["y"])
    base = rmse(te["y"], np.full(len(te), tr["y"].mean()))          # 기준선: 학습 기간 평균
    print(f"[{name}] 10년당 변화 {m.coef_[0]*10:+.2f} | 검증 RMSE 회귀 {rmse(te['y'], mt.predict(te[['연도']])):.2f} vs 기준선(평균) {base:.2f}")
    for start in [2000, 2005, 2010]:
        dd = d[d["연도"] >= start]; k = LinearRegression().fit(dd[["연도"]], dd["y"]).coef_[0] * 10
        print(f"    {start}년부터 학습하면 10년당 {k:+.2f}")

# %% 6단계 · 핵심 메시지와 한계 정리
# 확인한 것과 확인하지 못한 것을 나누어 쓴다. 숫자는 위 결과에서 가져온다. 연습용 가상 데이터의 결과는 실제 결론으로 쓰지 않는다.
k_t = LinearRegression().fit(year_mean.reset_index()[["연도"]], year_mean.values).coef_[0] * 10
k_d = LinearRegression().fit(days.reset_index()[["연도"]], days.values).coef_[0] * 10
print("✅ 확인한 것")
print(f"  - (연습용 데이터 기준) 연평균 수온은 10년마다 약 {k_t:.2f}℃, 선호 수온대 일수는 10년마다 약 {k_d:.1f}일 변했다.")
print("❓ 확인하지 못한 것")
print("  - 상어 한 마리(개별 사건)가 북항 수로에 들어온 이유")
print("  - 수온 상승과 상어 출현 증가 사이의 인과관계(먹이 생물·해류 자료 필요)")
print("📌 출처 기록: 기관명 / 데이터 이름 / 관측 지점 / 수집 기간 / 내려받은 날짜")
import os; print("내가 올린 데이터:", os.listdir("mydata") if os.path.isdir("mydata") else "없음")

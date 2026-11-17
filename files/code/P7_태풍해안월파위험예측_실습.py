# 1-2 태풍 해안 월파 위험 예측 · 결정 트리 분류 — 실습 코드
# 실습 데이터: data3/P7_부산영향태풍_목록.csv, data3/P7_태풍별_해안구역_월파기록.csv (수업용 가상 데이터)

import numpy as np, pandas as pd, matplotlib.pyplot as plt, warnings
warnings.filterwarnings("ignore")
import logging; logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = ["NanumGothic", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False
from sklearn.metrics import mean_squared_error
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))

# %% 3단계 · 데이터 불러오기와 점검
# 태풍 목록과 해안구역별 월파 기록을 점검한다. 음수 거리, 결측 기압을 찾아보자.
ty = pd.read_csv("data3/P7_부산영향태풍_목록.csv"); z = pd.read_csv("data3/P7_태풍별_해안구역_월파기록.csv")
print(ty.shape, z.shape)
print("음수 거리:", (ty["최근접거리_km"] < 0).sum(), "/ 기압 결측:", ty["근접시중심기압_hPa"].isna().sum())
print("해안향 표기:", z["해안향"].unique())
print(ty.head(3)); print(z.head(3))

# %% 3단계 · 정제와 병합
# 음수 거리는 중앙값, 결측 기압은 풍속과의 회귀로 추정한다. 두 표를 태풍ID로 합친다.
from sklearn.linear_model import LinearRegression
ty.loc[ty["최근접거리_km"] < 0, "최근접거리_km"] = np.nan
ty["최근접거리_km"] = ty["최근접거리_km"].fillna(ty["최근접거리_km"].median())
ok = ty["근접시중심기압_hPa"].notna()
reg = LinearRegression().fit(ty.loc[ok, ["최대풍속_ms"]], ty.loc[ok, "근접시중심기압_hPa"])
ty.loc[~ok, "근접시중심기압_hPa"] = reg.predict(ty.loc[~ok, ["최대풍속_ms"]]).round()
z["해안향"] = z["해안향"].replace({"S": "남"})
df = z.merge(ty, on="태풍ID")
df["서쪽통과"] = (df["통과위치"] == "서쪽").astype(int); df["만조"] = (df["만조여부"] == "만조 겹침").astype(int)
df["남향해안"] = df["해안향"].isin(["남", "남동"]).astype(int); df["방파제있음"] = (df["방파제"] == "있음").astype(int)
df["저지대"] = (df["지형"] == "저지대").astype(int); df["y"] = (df["월파발생"] == "Y").astype(int)
print(df.shape, "월파 비율: %.1f%%" % (df["y"].mean() * 100))

# %% 4단계 · 탐색적 데이터 분석
# 태풍 통과 위치와 만조 여부에 따라 월파율이 어떻게 달라지는지 본다.
t = df.pivot_table(index="서쪽통과", columns="만조", values="y", aggfunc="mean") * 100
t.index = ["동쪽 통과", "서쪽 통과"]; t.columns = ["만조 아님", "만조 겹침"]; print(t.round(1))
(df.groupby("해안구역")["y"].mean() * 100).sort_values().plot.barh(figsize=(7, 4.5), color="#d9534f", title="해안구역별 월파율(%)"); plt.show()

# %% 5단계 · 결정 트리 분류 학습
# 같은 태풍이 학습·검증에 섞이지 않도록 태풍 단위로 나눈다(과거 36개 / 최근 12개).
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.metrics import accuracy_score, recall_score, precision_score, confusion_matrix
F = ["최대풍속_ms", "근접시중심기압_hPa", "최근접거리_km", "서쪽통과", "만조", "남향해안", "방파제있음", "저지대"]
ids = ty.sort_values("연도")["태풍ID"].tolist()
tr, te = df[df["태풍ID"].isin(ids[:36])], df[df["태풍ID"].isin(ids[36:])]
for d in [2, 3, 4, 6, None]:
    m = DecisionTreeClassifier(max_depth=d, random_state=0).fit(tr[F], tr["y"]); pr = m.predict(te[F])
    print(f"깊이 {str(d):4s} 정확도={accuracy_score(te['y'], pr):.3f} 재현율={recall_score(te['y'], pr):.3f} 정밀도={precision_score(te['y'], pr):.3f}")

# %% 6단계 · 대피 규칙 만들기
# 깊이 3 트리의 규칙을 읽고, 구청에 전할 '대피 판단표'로 바꿔 보자.
dt = DecisionTreeClassifier(max_depth=3, random_state=0).fit(tr[F], tr["y"])
print(export_text(dt, feature_names=F))
storm = pd.DataFrame([{"최대풍속_ms": 40, "근접시중심기압_hPa": 955, "최근접거리_km": 60, "서쪽통과": 1, "만조": 1, "남향해안": 1, "방파제있음": 0, "저지대": 1}])
print("월파 위험 예측:", "위험" if dt.predict(storm)[0] else "안전", f"(확률 {dt.predict_proba(storm)[0,1]*100:.0f}%)")

import pandas as pd
import numpy as np
from math import radians, sin, cos, sqrt, atan2
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier
import matplotlib.pyplot as plt
import seaborn as sns

# 1. Load
df = pd.read_csv('upd_singleuser.csv')
df['trans_date_trans_time'] = pd.to_datetime(df['trans_date_trans_time'])
df = df.sort_values('unix_time').reset_index(drop=True)

# 2. Feature Engineering
def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2-lat1)/2)**2 + cos(lat1)*cos(lat2)*sin((lon2-lon1)/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

df['hour']        = df['trans_date_trans_time'].dt.hour
df['day_of_week'] = df['trans_date_trans_time'].dt.dayofweek
df['is_night']    = df['hour'].apply(lambda h: 1 if h < 6 or h >= 22 else 0)
df['distance_km'] = df.apply(lambda r: haversine(r['lat'], r['long'], r['merch_lat'], r['merch_long']), axis=1)
df['avg_amt']     = df['amt'].expanding().mean().shift(1).fillna(df['amt'].mean())
df['max_amt']     = df['amt'].expanding().max().shift(1).fillna(df['amt'].mean())
df['amt_zscore']  = (df['amt'] - df['avg_amt']) / (df['amt'].std() + 1e-9)
df['tx_count']    = range(1, len(df)+1)

# 3. Prepare X and y
FEATURES = ['amt', 'hour', 'day_of_week', 'is_night',
            'distance_km', 'avg_amt', 'max_amt', 'amt_zscore', 'tx_count']

X = df[FEATURES]
y = df['is_fraud']

# 4. Train / Test Split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42
)
print(f"Train: {len(X_train)} | Test: {len(X_test)}")
print(f"Fraud in test: {y_test.sum()} / {len(y_test)}")

# 5. Random Forest
print("\n── Random Forest ──")
rf = RandomForestClassifier(
    n_estimators=100,
    class_weight='balanced',
    random_state=42
)
rf.fit(X_train, y_train)
print(classification_report(y_test, rf.predict(X_test), target_names=['Genuine', 'Fraud']))

# 6. XGBoost
print("\n── XGBoost ──")
xgb = XGBClassifier(scale_pos_weight=19, random_state=42, eval_metric='logloss')
xgb.fit(X_train, y_train)
print(classification_report(y_test, xgb.predict(X_test), target_names=['Genuine', 'Fraud']))

# 7. Logistic Regression
print("\n── Logistic Regression ──")
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled  = scaler.transform(X_test)
lr = LogisticRegression(class_weight='balanced', random_state=42)
lr.fit(X_train_scaled, y_train)
print(classification_report(y_test, lr.predict(X_test_scaled), target_names=['Genuine', 'Fraud']))

# 8. Confusion Matrix for best model (XGBoost)
cm = confusion_matrix(y_test, xgb.predict(X_test))
plt.figure(figsize=(6,4))
sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
            xticklabels=['Genuine','Fraud'],
            yticklabels=['Genuine','Fraud'])
plt.title('XGBoost Confusion Matrix')
plt.ylabel('Actual')
plt.xlabel('Predicted')
plt.tight_layout()
plt.show()

# 9. Feature Importance (Random Forest)
importances = pd.Series(rf.feature_importances_, index=FEATURES).sort_values(ascending=False)
print("\n── Feature Importance (Random Forest) ──")
print(importances)
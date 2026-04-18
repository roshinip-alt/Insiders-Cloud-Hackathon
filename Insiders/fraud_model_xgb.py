import pandas as pd
import numpy as np
import joblib

from xgboost import XGBClassifier
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.model_selection import train_test_split

TREE1_NUM = [
    "amt", "amt_vs_avg_ratio", "amt_vs_max_ratio", "amt_vs_category_avg_ratio",
    "session_seconds", "is_new_merchant", "merchant_txn_count"
]
TREE1_CAT = ["category"]

TREE2_NUM = [
    "merch_dist_km", "merch_dist_ratio", "hour", "is_night",
    "hour_deviation", "location_jump_km", "speed_kmh",
    "location_sus", "city_changed", "time_since_last_txn_hr"
]

TREE3_NUM = [
    "txn_count_last_1hr", "txn_count_last_24hr", "freq_vs_avg_ratio",
    "session_seconds", "day_of_week", "is_weekend",
    "hour", "is_night", "time_since_last_txn_hr"
]

FRAUD_THRESHOLD = 1.2


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    lat1, lon1, lat2, lon2 = (np.radians(np.array(x, dtype=float)) for x in [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat/2)**2 + np.cos(lat1)*np.cos(lat2)*np.sin(dlon/2)**2
    return R * 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def engineer_features(df):
    df = df.copy()

    df["trans_dt"]    = pd.to_datetime(df["trans_date_trans_time"], dayfirst=True)
    df["hour"]        = df["trans_dt"].dt.hour
    df["day_of_week"] = df["trans_dt"].dt.dayofweek
    df["is_weekend"]  = (df["day_of_week"] >= 5).astype(int)
    df["is_night"]    = ((df["hour"] >= 23) | (df["hour"] <= 5)).astype(int)

    st = pd.to_datetime(df["session_time"], format="%H:%M:%S", errors="coerce")
    df["session_seconds"] = (st.dt.hour * 3600 + st.dt.minute * 60 + st.dt.second).fillna(0)

    df = df.sort_values(["cc_num", "unix_time"]).reset_index(drop=True)

    user_amt = df.groupby("cc_num")["amt"].agg(["mean", "max"]).reset_index()
    user_amt.columns = ["cc_num", "avg_amt", "max_amt"]
    df = df.merge(user_amt, on="cc_num", how="left")
    df["amt_vs_avg_ratio"] = df["amt"] / df["avg_amt"].replace(0, 1)
    df["amt_vs_max_ratio"] = df["amt"] / df["max_amt"].replace(0, 1)

    user_cat_avg = df.groupby(["cc_num", "category"])["amt"].mean().rename("cat_avg_amt").reset_index()
    df = df.merge(user_cat_avg, on=["cc_num", "category"], how="left")
    df["cat_avg_amt"].fillna(df["avg_amt"], inplace=True)
    df["amt_vs_category_avg_ratio"] = df["amt"] / df["cat_avg_amt"].replace(0, 1)

    df["merchant_txn_count"] = df.groupby(["cc_num", "merchant"]).cumcount()
    df["is_new_merchant"]    = (df["merchant_txn_count"] == 0).astype(int)

    df["merch_dist_km"] = haversine_km(df["lat"], df["long"], df["merch_lat"], df["merch_long"])
    user_merch = df.groupby("cc_num")["merch_dist_km"].mean().rename("avg_merch_dist").reset_index()
    df = df.merge(user_merch, on="cc_num", how="left")
    df["merch_dist_ratio"] = df["merch_dist_km"] / df["avg_merch_dist"].replace(0, 1)

    user_hour = df.groupby("cc_num")["hour"].agg(["mean", "std"]).reset_index()
    user_hour.columns = ["cc_num", "mean_hour", "std_hour"]
    df = df.merge(user_hour, on="cc_num", how="left")
    df["std_hour"] = df["std_hour"].fillna(3)
    df["hour_deviation"] = abs(df["hour"] - df["mean_hour"])

    df["prev_lat"]  = df.groupby("cc_num")["lat"].shift(1).fillna(df["lat"])
    df["prev_long"] = df.groupby("cc_num")["long"].shift(1).fillna(df["long"])
    df["prev_unix"] = df.groupby("cc_num")["unix_time"].shift(1).fillna(df["unix_time"])
    df["location_jump_km"] = haversine_km(df["prev_lat"], df["prev_long"], df["lat"], df["long"])
    df["time_since_last_txn_hr"] = ((df["unix_time"] - df["prev_unix"]) / 3600).clip(lower=1e-3)
    df["speed_kmh"]    = df["location_jump_km"] / df["time_since_last_txn_hr"]
    df["location_sus"] = (df["speed_kmh"] > 900).astype(int)

    df["prev_city"]    = df.groupby("cc_num")["city"].shift(1).fillna(df["city"])
    df["city_changed"] = (df["city"] != df["prev_city"]).astype(int)

    def rolling_count(group, window_sec):
        times  = group["unix_time"].values
        counts = np.array([np.sum((times[i] - times[:i]) <= window_sec) for i in range(len(times))])
        return pd.Series(counts, index=group.index)

    df["txn_count_last_1hr"]  = df.groupby("cc_num", group_keys=False).apply(lambda g: rolling_count(g, 3600))
    df["txn_count_last_24hr"] = df.groupby("cc_num", group_keys=False).apply(lambda g: rolling_count(g, 86400))

    span_days = df.groupby("cc_num").apply(
        lambda g: max((g["unix_time"].max() - g["unix_time"].min()) / 86400, 1)
    ).rename("span_days").reset_index()
    total_txn = df.groupby("cc_num").size().rename("total_txn").reset_index()
    daily_freq = span_days.merge(total_txn, on="cc_num")
    daily_freq["avg_daily_txn"] = daily_freq["total_txn"] / daily_freq["span_days"]
    df = df.merge(daily_freq[["cc_num", "avg_daily_txn"]], on="cc_num", how="left")
    df["freq_vs_avg_ratio"] = df["txn_count_last_24hr"] / df["avg_daily_txn"].replace(0, 1)

    return df


def _make_xgb(spw):
    return XGBClassifier(
        n_estimators=300, max_depth=4, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        scale_pos_weight=spw,
        eval_metric="logloss", random_state=42, n_jobs=-1
    )


def train_xgb():
    df = pd.read_csv("../Dataset/data.csv")
    feat = engineer_features(df)
    y    = feat["is_fraud"].reset_index(drop=True)

    spw = (1 - y.mean()) / y.mean()

    idx_train, idx_test = train_test_split(feat.index, test_size=0.2, random_state=42, stratify=y)
    tr = feat.loc[idx_train]
    te = feat.loc[idx_test]
    y_tr = y.loc[idx_train].reset_index(drop=True)
    y_te = y.loc[idx_test].reset_index(drop=True)

    enc1 = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    def make_X1(d, fit=False):
        cat = enc1.fit_transform(d[TREE1_CAT]) if fit else enc1.transform(d[TREE1_CAT])
        cat_df = pd.DataFrame(cat, columns=enc1.get_feature_names_out(TREE1_CAT), index=d.index)
        return pd.concat([d[TREE1_NUM].reset_index(drop=True), cat_df.reset_index(drop=True)], axis=1)

    X1_tr = make_X1(tr, fit=True)
    X1_te = make_X1(te)
    sc1 = StandardScaler()
    X1_tr_s = pd.DataFrame(sc1.fit_transform(X1_tr), columns=X1_tr.columns)
    X1_te_s = pd.DataFrame(sc1.transform(X1_te),     columns=X1_te.columns)

    X2_tr = tr[TREE2_NUM].reset_index(drop=True)
    X2_te = te[TREE2_NUM].reset_index(drop=True)
    sc2 = StandardScaler()
    X2_tr_s = pd.DataFrame(sc2.fit_transform(X2_tr), columns=X2_tr.columns)
    X2_te_s = pd.DataFrame(sc2.transform(X2_te),     columns=X2_te.columns)

    X3_tr = tr[TREE3_NUM].reset_index(drop=True)
    X3_te = te[TREE3_NUM].reset_index(drop=True)
    sc3 = StandardScaler()
    X3_tr_s = pd.DataFrame(sc3.fit_transform(X3_tr), columns=X3_tr.columns)
    X3_te_s = pd.DataFrame(sc3.transform(X3_te),     columns=X3_te.columns)

    t1 = _make_xgb(spw)
    t1.fit(X1_tr_s, y_tr, eval_set=[(X1_te_s, y_te)], verbose=50)

    t2 = _make_xgb(spw)
    t2.fit(X2_tr_s, y_tr, eval_set=[(X2_te_s, y_te)], verbose=50)

    t3 = _make_xgb(spw)
    t3.fit(X3_tr_s, y_tr, eval_set=[(X3_te_s, y_te)], verbose=50)

    joblib.dump(t1,  "xgb_t1.pkl"); joblib.dump(t2,  "xgb_t2.pkl"); joblib.dump(t3,  "xgb_t3.pkl")
    joblib.dump(enc1,"xgb_enc1.pkl")
    joblib.dump(sc1, "xgb_sc1.pkl"); joblib.dump(sc2, "xgb_sc2.pkl"); joblib.dump(sc3, "xgb_sc3.pkl")
    joblib.dump(list(X1_tr_s.columns), "xgb_cols1.pkl")
    joblib.dump(list(X2_tr_s.columns), "xgb_cols2.pkl")
    joblib.dump(list(X3_tr_s.columns), "xgb_cols3.pkl")
    print("XGB trained and saved.")


def predict_xgb(input_dict):
    t1   = joblib.load("xgb_t1.pkl");   t2  = joblib.load("xgb_t2.pkl");  t3  = joblib.load("xgb_t3.pkl")
    enc1 = joblib.load("xgb_enc1.pkl")
    sc1  = joblib.load("xgb_sc1.pkl");  sc2 = joblib.load("xgb_sc2.pkl"); sc3 = joblib.load("xgb_sc3.pkl")
    cols1 = joblib.load("xgb_cols1.pkl"); cols2 = joblib.load("xgb_cols2.pkl"); cols3 = joblib.load("xgb_cols3.pkl")

    history = pd.read_csv("../Dataset/data.csv")
    history = history[history["cc_num"] == input_dict["cc_num"]]
    df = pd.concat([history, pd.DataFrame([input_dict])], ignore_index=True)
    feat = engineer_features(df)
    row  = feat.tail(1)

    cat    = enc1.transform(row[TREE1_CAT])
    cat_df = pd.DataFrame(cat, columns=enc1.get_feature_names_out(TREE1_CAT))
    X1 = pd.concat([row[TREE1_NUM].reset_index(drop=True), cat_df], axis=1).fillna(0)
    X1 = X1.reindex(columns=cols1, fill_value=0)
    X1 = pd.DataFrame(sc1.transform(X1), columns=cols1)

    X2 = row[TREE2_NUM].reset_index(drop=True).fillna(0).reindex(columns=cols2, fill_value=0)
    X2 = pd.DataFrame(sc2.transform(X2), columns=cols2)

    X3 = row[TREE3_NUM].reset_index(drop=True).fillna(0).reindex(columns=cols3, fill_value=0)
    X3 = pd.DataFrame(sc3.transform(X3), columns=cols3)

    p1 = float(t1.predict_proba(X1)[0][1])
    p2 = float(t2.predict_proba(X2)[0][1])
    p3 = float(t3.predict_proba(X3)[0][1])

    total = p1 + p2 + p3
    decision = "LOGOUT_BLOCK" if total >= FRAUD_THRESHOLD else "AUTHENTICATE"

    return {
        "tree1_finance":    round(p1, 4),
        "tree2_context":    round(p2, 4),
        "tree3_behavioral": round(p3, 4),
        "sum_prob":         round(total, 4),
        "decision":         decision
    }


if __name__ == "__main__":
    train_xgb()

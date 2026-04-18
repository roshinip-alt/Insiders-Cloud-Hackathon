import pandas as pd
import numpy as np
import joblib

from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.model_selection import train_test_split

CAT_COLS = ["category"]
NUM_COLS = [
    "amt", "session_seconds", "hour", "is_night",
    "hour_deviation", "time_sus",
    "location_jump_km", "time_since_last_txn_hr", "speed_kmh", "location_sus",
    "amt_vs_avg_ratio", "amt_vs_max_ratio", "amount_sus",
    "merch_dist_km", "merch_dist_ratio", "merchant_sus",
    "sus_score"
]


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat/2)**2 + np.cos(lat1)*np.cos(lat2)*np.sin(dlon/2)**2
    return 2 * R * np.arcsin(np.sqrt(a))


def engineer_features(df):
    df = df.copy()

    df["trans_dt"] = pd.to_datetime(df["trans_date_trans_time"], dayfirst=True)
    df["hour"] = df["trans_dt"].dt.hour
    df["is_night"] = ((df["hour"] >= 23) | (df["hour"] <= 5)).astype(int)

    st = pd.to_datetime(df["session_time"], format="%H:%M:%S", errors="coerce")
    df["session_seconds"] = (st.dt.hour * 3600 + st.dt.minute * 60 + st.dt.second).fillna(0)

    df = df.sort_values(["cc_num", "unix_time"]).reset_index(drop=True)

    user_hour = df.groupby("cc_num")["hour"].agg(["mean", "std"]).reset_index()
    user_hour.columns = ["cc_num", "mean_hour", "std_hour"]
    df = df.merge(user_hour, on="cc_num", how="left")
    df["std_hour"] = df["std_hour"].fillna(3)
    df["hour_deviation"] = abs(df["hour"] - df["mean_hour"])
    df["time_sus"] = ((df["hour_deviation"] > df["std_hour"]) & (df["is_night"] == 1)).astype(int)

    df["prev_lat"]  = df.groupby("cc_num")["lat"].shift(1).fillna(df["lat"])
    df["prev_long"] = df.groupby("cc_num")["long"].shift(1).fillna(df["long"])
    df["prev_time"] = df.groupby("cc_num")["unix_time"].shift(1).fillna(df["unix_time"])
    df["location_jump_km"] = haversine_km(df["prev_lat"], df["prev_long"], df["lat"], df["long"])
    df["time_since_last_txn_hr"] = ((df["unix_time"] - df["prev_time"]) / 3600).clip(lower=1e-3)
    df["speed_kmh"] = df["location_jump_km"] / df["time_since_last_txn_hr"]
    df["location_sus"] = (df["speed_kmh"] > 900).astype(int)

    user_amt = df.groupby("cc_num")["amt"].agg(["mean", "max"]).reset_index()
    user_amt.columns = ["cc_num", "avg_amt", "max_amt"]
    df = df.merge(user_amt, on="cc_num", how="left")
    df["amt_vs_avg_ratio"] = df["amt"] / df["avg_amt"].replace(0, 1)
    df["amt_vs_max_ratio"] = df["amt"] / df["max_amt"].replace(0, 1)
    df["amount_sus"] = ((df["amt_vs_avg_ratio"] > 5) | (df["amt_vs_max_ratio"] > 0.9)).astype(int)

    df["merch_dist_km"] = haversine_km(df["lat"], df["long"], df["merch_lat"], df["merch_long"])
    user_merch = df.groupby("cc_num")["merch_dist_km"].mean().reset_index()
    user_merch.columns = ["cc_num", "avg_merch_dist"]
    df = df.merge(user_merch, on="cc_num", how="left")
    df["merch_dist_ratio"] = df["merch_dist_km"] / df["avg_merch_dist"].replace(0, 1)
    df["merchant_sus"] = ((df["merch_dist_ratio"] > 5) & (df["amt_vs_avg_ratio"] > 3)).astype(int)

    df["sus_score"] = df["time_sus"] + df["location_sus"] + df["amount_sus"] + df["merchant_sus"]

    return df


def train_lr():
    df = pd.read_csv("../Dataset/data.csv")
    df = engineer_features(df)

    encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    cat = encoder.fit_transform(df[CAT_COLS])
    cat_df = pd.DataFrame(cat, columns=encoder.get_feature_names_out(CAT_COLS))

    X = pd.concat([df[NUM_COLS].reset_index(drop=True), cat_df], axis=1).fillna(0)
    y = df["is_fraud"]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, _, y_train, _ = train_test_split(X_scaled, y, test_size=0.2, stratify=y)

    model = LogisticRegression(max_iter=1000, class_weight="balanced")
    model.fit(X_train, y_train)

    joblib.dump(model,   "lr_model.pkl")
    joblib.dump(encoder, "lr_encoder.pkl")
    joblib.dump(scaler,  "lr_scaler.pkl")
    joblib.dump(list(X.columns), "lr_columns.pkl")
    print("LR trained and saved.")


def predict_lr(input_dict):
    model   = joblib.load("lr_model.pkl")
    encoder = joblib.load("lr_encoder.pkl")
    scaler  = joblib.load("lr_scaler.pkl")
    columns = joblib.load("lr_columns.pkl")

    history = pd.read_csv("../Dataset/data.csv")
    history = history[history["cc_num"] == input_dict["cc_num"]]
    df = pd.concat([history, pd.DataFrame([input_dict])], ignore_index=True)
    df = engineer_features(df)

    row    = df.tail(1)
    cat    = encoder.transform(row[CAT_COLS])
    cat_df = pd.DataFrame(cat, columns=encoder.get_feature_names_out(CAT_COLS))
    X      = pd.concat([row[NUM_COLS].reset_index(drop=True), cat_df], axis=1).fillna(0)
    X      = X.reindex(columns=columns, fill_value=0)
    X_scaled = scaler.transform(X)

    prob = float(model.predict_proba(X_scaled)[0][1])

    if prob < 0.2:
        decision = "AUTHENTICATE"
    elif prob > 0.8:
        decision = "FRAUD_ALERT"
    else:
        decision = "ROUTE_TO_MODEL2"

    return {
        "fraud_probability": round(prob, 4),
        "decision": decision,
        "sus_flags": {
            "time_sus":     int(row["time_sus"].values[0]),
            "location_sus": int(row["location_sus"].values[0]),
            "amount_sus":   int(row["amount_sus"].values[0]),
            "merchant_sus": int(row["merchant_sus"].values[0]),
            "sus_score":    int(row["sus_score"].values[0]),
        }
    }


if __name__ == "__main__":
    train_lr()

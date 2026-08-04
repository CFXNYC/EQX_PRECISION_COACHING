#!/usr/bin/env python3
"""
Capture a dated weekly benchmark snapshot of the pilot's key metrics into
data/history/weekly_snapshots.json.

Run this each time a fresh data/*.json drop lands (the Monday data point is
the week's benchmark, per Carlos). Re-running for a week_of that already
exists in history REPLACES that week's entry (idempotent, safe to re-run
same-week corrections) rather than duplicating it.

Usage:
    python3 scripts/capture_weekly_snapshot.py [--week-of YYYY-MM-DD]

If --week-of is omitted, uses the most recent Monday on or before today.

This intentionally recomputes a simplified, independent aggregate — NOT a
call into the frontend's calculations.js — so it has no dependency on a
browser/DOM. Numbers here are close to, but not guaranteed byte-identical
to, the dashboard's own live-rendered aggregates (e.g. club-exclusion edge
cases). That's acceptable for week-over-week trend direction; if exact
parity ever matters, port this logic from calculations.js explicitly.
"""
import argparse
import datetime
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
HISTORY_PATH = os.path.join(DATA_DIR, "history", "weekly_snapshots.json")


def load(name):
    with open(os.path.join(DATA_DIR, name)) as f:
        return json.load(f)


def most_recent_monday(d):
    return d - datetime.timedelta(days=d.weekday())


def norm_email(e):
    return (e or "").strip().lower()


# Mirrors js/data.js's ALIAS_MAP exactly — only exact, human-confirmed
# exceptions, never a fuzzy guess. Keep in sync if data.js's map changes.
ALIAS_MAP = {
    "ryanmartinez01": "ryanmartinez",
    "cesarsanchez01": "cesarsanchez",
}


def normalize_coach_name(raw_name):
    """Mirrors js/data.js's normalizeCoachName exactly: lowercase, strip
    diacritics, remove apostrophes/hyphens/periods, remove whitespace,
    strip remaining punctuation, apply the confirmed alias map."""
    if raw_name is None:
        return ""
    n = unicodedata.normalize("NFKD", str(raw_name))
    n = "".join(c for c in n if not unicodedata.combining(c))
    n = n.lower().strip()
    n = re.sub(r"[''\-.]", "", n)
    n = re.sub(r"\s+", "", n)
    n = re.sub(r"[^a-z0-9]", "", n)
    return ALIAS_MAP.get(n, n)


def safe_avg(values):
    values = [v for v in values if v is not None]
    return round(sum(values) / len(values), 4) if values else None


def build_snapshot(week_of):
    directory = load("pilot_coach_directory.json")
    perf = load("pilot_coach_data.json")
    curriculum = load("coach_curriculum_completion.json")
    leads = load("lead_tracker_summary.json")
    competencies_raw = load("danny_competencies_3ps.json")
    competencies = competencies_raw["records"] if isinstance(competencies_raw, dict) else competencies_raw

    dir_by_email = {}
    for d in directory:
        dir_by_email.setdefault(norm_email(d.get("email")), []).append(d)

    # pilot_coach_data.json carries no email field at all — the real join
    # key (per js/data.js) is normalized preferred_name vs. directory
    # coach_name, not email.
    perf_by_name = {}
    for p in perf:
        key = normalize_coach_name(p.get("preferred_name"))
        if key:
            perf_by_name.setdefault(key, []).append(p)

    curriculum_by_email = {}
    for c in curriculum:
        curriculum_by_email.setdefault(norm_email(c.get("email")), []).append(c)

    competency_by_email = {}
    for c in competencies:
        competency_by_email[norm_email(c.get("email"))] = c

    PILLAR_FIELDS = {
        "performance": ["PERFORMANCE | Engaging", "PERFORMANCE | Closing", "PERFORMANCE | Reframing"],
        "professionalism": ["PROFESSIONALISM | Mindset", "PROFESSIONALISM | Elevator Pitch", "PROFESSIONALISM | Floor Presence"],
        "programming": ["PROGRAMMING | Structure", "PROGRAMMING | Coaching", "PROGRAMMING | Recommendation"],
    }
    WEIGHTS = {"performance": 0.50, "professionalism": 0.30, "programming": 0.20}

    coach_rows = []
    conv_rates, active_clients_list, weekly_sessions_list, recurring_rates = [], [], [], []
    matched_perf_count = 0
    scored_count = 0
    pillar_scores = {"performance": [], "professionalism": [], "programming": []}
    overall_scores = []

    for d in directory:
        email = norm_email(d.get("email"))
        name_key = normalize_coach_name(d.get("coach_name"))
        p = (perf_by_name.get(name_key) or [None])[0]
        c = (curriculum_by_email.get(email) or [None])[0]
        comp = competency_by_email.get(email)
        if p:
            matched_perf_count += 1

        conv = p.get("conversion_rate") if p else None
        ac = p.get("active_clients") if p else None
        aws = p.get("avg_weekly_sessions") if p else None
        rr = p.get("pct_recurring_clients") if p else None
        if p and p.get("conversion_eqfs"):
            conv_rates.append(conv)
        if ac is not None:
            active_clients_list.append(ac)
        if aws is not None:
            weekly_sessions_list.append(aws)
        if p and p.get("active_clients"):
            recurring_rates.append(rr)

        pillar_pcts = {}
        any_rating = False
        if comp:
            for pillar, fields in PILLAR_FIELDS.items():
                vals = [comp.get(f) for f in fields if comp.get(f) is not None]
                if vals:
                    any_rating = True
                    pillar_pcts[pillar] = round((sum(vals) / len(vals)) / 5 * 100, 1)
        overall = None
        if pillar_pcts:
            wsum = sum(WEIGHTS[k] for k in pillar_pcts)
            overall = round(sum(pillar_pcts[k] * WEIGHTS[k] for k in pillar_pcts) / wsum, 1)
            for k, v in pillar_pcts.items():
                pillar_scores[k].append(v)
            overall_scores.append(overall)
        if any_rating:
            scored_count += 1

        coach_rows.append({
            "coach_id": d.get("coach_id"),
            "conversion_rate": conv,
            "active_clients": ac,
            "avg_weekly_sessions": aws,
            "recurring_rate": rr,
            "overall_score": overall,
            "curriculum_progress": c.get("progress") if c else None,
            "curriculum_status": c.get("learner_status") if c else None,
        })

    enrolled = sum(1 for c in curriculum if c.get("employee_id"))
    completed = sum(1 for c in curriculum if c.get("learner_completion_date"))
    on_time = sum(1 for c in curriculum if c.get("learner_status") == "On time")
    not_started = sum(1 for c in curriculum if c.get("learner_status") == "Not yet started")
    avg_progress = safe_avg([c.get("progress") for c in curriculum])

    total_leads = sum(l.get("total_leads", 0) for l in leads)
    fs_leads = sum(l.get("fitness_specialist_leads", 0) for l in leads)
    se_leads = sum(l.get("special_event_leads", 0) for l in leads)

    snapshot = {
        "week_of": week_of,
        "captured_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "is_benchmark": False,  # set by main() based on whether this week already has one
        "org": {
            "pilot_coaches": len(directory),
            "kpi": {
                "avg_conversion_rate": safe_avg(conv_rates),
                "avg_active_clients_per_coach": safe_avg(active_clients_list),
                "avg_weekly_sessions": safe_avg(weekly_sessions_list),
                "avg_recurring_rate": safe_avg(recurring_rates),
                "matched_coaches": matched_perf_count,
            },
            "competency": {
                "scored_coaches": scored_count,
                "coverage_pct": round(scored_count / len(directory) * 100, 1) if directory else None,
                "avg_overall_score": safe_avg(overall_scores),
                "avg_performance_score": safe_avg(pillar_scores["performance"]),
                "avg_professionalism_score": safe_avg(pillar_scores["professionalism"]),
                "avg_programming_score": safe_avg(pillar_scores["programming"]),
            },
            "curriculum": {
                "enrolled": enrolled,
                "completed": completed,
                "on_time": on_time,
                "not_started": not_started,
                "avg_progress_pct": avg_progress,
            },
            "leads": {
                "total_leads": total_leads,
                "fitness_specialist_leads": fs_leads,
                "special_event_leads": se_leads,
                "clubs_reporting": len(leads),
            },
        },
        "coaches": coach_rows,
    }
    return snapshot


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--week-of", help="YYYY-MM-DD; defaults to the most recent Monday")
    parser.add_argument(
        "--force-benchmark", action="store_true",
        help="Replace this week's existing benchmark instead of adding an intraweek capture "
             "(use only to correct a wrong Monday baseline — demotes the old benchmark to a "
             "regular intraweek capture rather than deleting it).",
    )
    args = parser.parse_args()

    if args.week_of:
        week_of = args.week_of
    else:
        week_of = most_recent_monday(datetime.date.today()).isoformat()

    snapshot = build_snapshot(week_of)

    os.makedirs(os.path.dirname(HISTORY_PATH), exist_ok=True)
    if os.path.exists(HISTORY_PATH):
        with open(HISTORY_PATH) as f:
            history = json.load(f)
    else:
        history = {
            "schema_version": "1.1",
            "description": (
                "Every capture is preserved (never overwritten) so intraweek spikes are "
                "visible, not just Monday-to-Monday movement. Exactly one entry per week_of "
                "has is_benchmark=true — the first capture taken that week, meant to be the "
                "Monday data point per the team's benchmarking convention. Later captures in "
                "the same week are intraweek updates (is_benchmark=false) layered onto that "
                "baseline. Re-run with --force-benchmark to correct a wrong benchmark."
            ),
            "snapshots": [],
        }

    week_has_benchmark = any(s["week_of"] == week_of and s.get("is_benchmark") for s in history["snapshots"])

    if args.force_benchmark:
        for s in history["snapshots"]:
            if s["week_of"] == week_of and s.get("is_benchmark"):
                s["is_benchmark"] = False  # demoted, not deleted
        snapshot["is_benchmark"] = True
    elif not week_has_benchmark:
        snapshot["is_benchmark"] = True

    history["snapshots"].append(snapshot)
    history["snapshots"].sort(key=lambda s: s["captured_at"])

    with open(HISTORY_PATH, "w") as f:
        json.dump(history, f, indent=2)

    kind = "benchmark" if snapshot["is_benchmark"] else "intraweek"
    weeks = len({s["week_of"] for s in history["snapshots"]})
    print(f"Captured {kind} snapshot for week_of={week_of}. History now has {len(history['snapshots'])} capture(s) across {weeks} week(s).")


if __name__ == "__main__":
    main()

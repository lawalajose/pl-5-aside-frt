"""PL 5-Aside — roster backend (FastAPI + one JSON file).

Run it:
    cd backend
    python3 -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    uvicorn main:app --reload

The API and the static frontend are served by the same process, so
http://localhost:8000 opens the site and http://localhost:8000/api/roster
is the roster itself.
"""

from __future__ import annotations

import uvicorn
import json
import os
import random
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("API_KEY")
SECRET_KEY = os.getenv("SECRET_KEY")


HERE = Path(__file__).resolve().parent
FRONTEND_DIR = HERE.parent / "frontend"
DATA_FILE = HERE / "roster.json"
PLAYERS_FILE = HERE / "players.json"

# Must match frontend/teams.js: same squad ids, same slots per squad.
CAPACITY = 8
TEAMS = ("python", "go", "ts", "java")
POSITIONS = ("MF", "DF", "FW")
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,39}$")

# The 32 handles — same list as PLAYERS in frontend/teams.js (keep in sync).
PLAYERS: tuple[str, ...] = tuple(
    p for p in json.loads(PLAYERS_FILE.read_text(encoding="utf-8")) if isinstance(p, str)
)
PLAYER_SET = frozenset(PLAYERS)

# floor(positions / squads) — a squad may only take its LAST slot once it
# holds at least this many of every position (e.g. 11 MF / 4 squads = 2).
POSITION_FLOOR = {
    q: len([p for p in PLAYERS if p.rsplit("_", 1)[-1].upper() == q]) // len(TEAMS)
    for q in POSITIONS
}

_LOCK = threading.Lock()


# ---------------------------------------------------------------- storage

def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _load() -> Dict[str, Any]:
    if not DATA_FILE.exists():
        return {"roster": {}, "updated_at": None}
    try:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8") or "{}")
    except (json.JSONDecodeError, OSError):
        return {"roster": {}, "updated_at": None}
    roster = raw.get("roster")
    if not isinstance(roster, dict):
        roster = {}
    clean = {
        str(k): str(v)
        for k, v in roster.items()
        if isinstance(k, str) and isinstance(v, str) and v in TEAMS
    }
    updated = raw.get("updated_at")
    return {"roster": clean, "updated_at": updated if isinstance(updated, str) else None}


def _save(data: Dict[str, Any]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp, DATA_FILE)


# ------------------------------------------------------------ balance rules

def _position_of(player: str) -> str:
    suffix = player.rsplit("_", 1)[-1].upper()
    return suffix if suffix in POSITIONS else "ANY"


def _counts(roster: Dict[str, str]) -> Dict[str, Dict[str, int]]:
    counts: Dict[str, Dict[str, int]] = {
        t: {"size": 0, "MF": 0, "DF": 0, "FW": 0, "ANY": 0} for t in TEAMS
    }
    for player, team in roster.items():
        bucket = counts.get(team)
        if bucket is None:
            continue
        bucket["size"] += 1
        bucket[_position_of(player)] += 1
    return counts


def choose_team(roster: Dict[str, str], player: str) -> str | None:
    """Random but balanced pick — the same five steps as teams.js.

    1. only squads with a free slot
    2. among those, the squads with the FEWEST players of this position
    3. among those, the squads with the FEWEST players overall
    4. drop any squad that would take its LAST slot while still below the
       guaranteed minimum of some position
    5. random tie-break
    """
    counts = _counts(roster)
    pos = _position_of(player)
    open_teams = [t for t in TEAMS if counts[t]["size"] < CAPACITY]
    if not open_teams:
        return None

    best = min(counts[t][pos] for t in open_teams)
    candidates = [t for t in open_teams if counts[t][pos] == best]
    smallest = min(counts[t]["size"] for t in candidates)
    candidates = [t for t in candidates if counts[t]["size"] == smallest]

    safe = []
    for team in candidates:
        if counts[team]["size"] + 1 < CAPACITY:
            safe.append(team)
        else:
            after = {
                q: counts[team][q] + (1 if q == pos else 0) for q in POSITIONS
            }
            if all(after[q] >= POSITION_FLOOR[q] for q in POSITIONS):
                safe.append(team)

    pool = safe or candidates
    return random.choice(pool)


# ------------------------------------------------------------------ routes

class AssignIn(BaseModel):
    player: str = Field(..., min_length=3, max_length=40)


app = FastAPI(title="PL 5-Aside — roster API", version="1.0.0")


@app.get("/api/roster")
def get_roster() -> Dict[str, Any]:
    data = _load()
    roster = data["roster"]
    return {
        "roster": roster,
        "players": list(PLAYERS),
        "capacity": CAPACITY,
        "teams": list(TEAMS),
        "assigned": len(roster),
        "updated_at": data["updated_at"],
    }


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "capacity": CAPACITY, "teams": list(TEAMS)}


@app.post("/api/assign")
def assign(payload: AssignIn) -> Dict[str, Any]:
    player = payload.player.strip().lower()
    if not NAME_RE.match(player) or player not in PLAYER_SET:
        raise HTTPException(status_code=404, detail="UNKNOWN_PLAYER")

    with _LOCK:
        data = _load()
        roster = data["roster"]
        if player in roster:
            return {
                "ok": True,
                "already": True,
                "player": player,
                "team": roster[player],
                "roster": roster,
            }
        team = choose_team(roster, player)
        if team is None or len(roster) >= len(PLAYERS):
            raise HTTPException(status_code=409, detail="ROSTER_FULL")
        roster[player] = team
        data["roster"] = roster
        data["updated_at"] = _now()
        _save(data)
        return {
            "ok": True,
            "already": False,
            "player": player,
            "team": team,
            "roster": roster,
        }


# @app.post("/api/reset")
# def reset() -> Dict[str, Any]:
#     with _LOCK:
#         _save({"roster": {}, "updated_at": _now()})
#     return {"ok": True, "roster": {}}


# Static site last: API routes above win over this catch-all mount.
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="site")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
    )



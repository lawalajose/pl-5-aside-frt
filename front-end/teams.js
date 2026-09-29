/* PL 5-ASIDE — roster allocator (frontend only, localStorage) */
(function () {
  "use strict";

  var PLAYERS = [
    "lawal_ajose_mf",
    "ope_fawaz_df",
    "bolrinwa_emmanuel_fw",
    "olalekan_olatunbosun_fw",
    "olanrewaju_ayodeji_df",
    "chima_s.t_mf",
    "brodapeethar_df",
    "hassankorey_mf",
    "francis_bello_fw",
    "peter_df",
    "godswill_fw",
    "akinwale_fw",
    "taki_emmanuel_mf",
    "omitogun_ayobami_mf",
    "matthew_df",
    "idris_mf",
    "victor_fw",
    "marvelous_df",
    "bishop_mf",
    "godbless_fw",
    "sodiqson_marizuq_df",
    "chizu_mf",
    "thobad_df",
    "bato_omo_werey_fw",
    "olapade_abayomi_df_mf",
    "ghost_df",
    "cholo_mf",
    "afeez_df",
    "kabeer_fw",
    "ebuka_fw",
    "chidi_df",
    "dimeji_mf",
  ];

  var TEAMS = [
    {
      id: "python",
      name: "Python FC",
      seed: "01",
      ext: ".py",
      glyph: "🐍",
      bg: "#1e293b",
      glyphClass: "text-[18px]",
      accent: "#0284C7",
    },
    {
      id: "go",
      name: "Go United",
      seed: "02",
      ext: ".go",
      glyph: "⚡",
      bg: "#0284c7",
      glyphClass: "text-[18px]",
      accent: "#006398",
    },
    {
      id: "ts",
      name: "TypeScript City",
      seed: "03",
      ext: ".ts",
      glyph: "TS",
      bg: "#1d4ed8",
      glyphClass: "font-label-md font-bold text-xs",
      accent: "#0284C7",
    },
    {
      id: "java",
      name: "Java Athletic",
      seed: "04",
      ext: ".java",
      glyph: "☕",
      bg: "#b91c1c",
      glyphClass: "text-[18px]",
      accent: "#ba1a1a",
    },
  ];

  var CAPACITY = 8;
  var STORAGE_KEY = "pl5aside.roster.v1"; /* offline fallback only */
  var API = "/api";

  /* Live roster. mode = "remote" while the JSON backend answers,
     "local" when it is unreachable (localStorage fallback). */
  var state = {};
  var mode = "local";

  /* Positions + the guaranteed minimum of each position every squad must hold
     before it is allowed to take its last slot (e.g. 10 MF / 4 teams = 2). */
  var POSITIONS = ["MF", "DF", "FW"];
  var POSITION_FLOOR = {};
  POSITIONS.forEach(function (q) {
    var total = PLAYERS.filter(function (p) {
      return positionKey(p) === q;
    }).length;
    POSITION_FLOOR[q] = Math.floor(total / TEAMS.length);
  });

  var selectEl = document.getElementById("player-select");
  var assignBtn = document.getElementById("assign-btn");
  var resetBtn = document.getElementById("reset-btn");
  var gridEl = document.getElementById("roster-grid");
  var resultEl = document.getElementById("assign-result");
  var statAssigned = document.getElementById("stat-assigned");
  var statRemaining = document.getElementById("stat-remaining");
  var statTotal = document.getElementById("stat-total");
  var badgePlayers = document.getElementById("badge-players");
  var statusEl = document.getElementById("sync-status");

  function positionOf(player) {
    var i = player.lastIndexOf("_");
    return i === -1 ? "" : player.slice(i + 1).toUpperCase();
  }

  /* Position bucket used by the balancer (MF / DF / FW, anything else = ANY) */
  function positionKey(player) {
    var p = positionOf(player);
    return p === "MF" || p === "DF" || p === "FW" ? p : "ANY";
  }

  function normalize(source) {
    var clean = {};
    if (!source || typeof source !== "object") return clean;
    PLAYERS.forEach(function (p) {
      if (source[p] && teamById(source[p])) clean[p] = source[p];
    });
    return clean;
  }

  function readLocal() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return normalize(raw ? JSON.parse(raw) : {});
    } catch (e) {
      return {};
    }
  }

  function writeLocal(s) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {
      /* storage unavailable — session stays in memory */
    }
  }

  function apiUrl(path) {
    return API + path;
  }

  function fetchJson(url, options) {
    return window.fetch(url, options).then(function (res) {
      if (res.ok) return res.json();
      var err = new Error("HTTP_" + res.status);
      err.status = res.status;
      return res
        .json()
        .then(function (body) {
          err.body = body;
          throw err;
        })
        .catch(function () {
          throw err;
        });
    });
  }

  var STATUS_TONE = {
    pending: "text-on-surface-variant",
    ok: "text-[#0284C7]",
    warn: "text-[#B45309]",
    error: "text-error",
  };

  function setStatus(text, tone) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className =
      "font-label-sm text-label-sm uppercase tracking-wider " +
      (STATUS_TONE[tone] || STATUS_TONE.pending);
  }

  /* First paint: ask the JSON backend, fall back to localStorage. */
  function loadRoster() {
    setStatus("SYNC // CONNECTING…", "pending");
    return fetchJson(apiUrl("/roster"), { cache: "no-store" })
      .then(function (data) {
        mode = "remote";
        if (typeof data.capacity === "number" && data.capacity > 0) {
          CAPACITY = data.capacity;
        }
        state = normalize(data.roster);
        setStatus("SYNC // LIVE · JSON BACKEND", "ok");
        render(state);
      })
      .catch(function () {
        mode = "local";
        state = readLocal();
        setStatus("SYNC // OFFLINE · LOCAL ONLY", "warn");
        render(state);
      });
  }

  function teamById(id) {
    for (var i = 0; i < TEAMS.length; i++) {
      if (TEAMS[i].id === id) return TEAMS[i];
    }
    return null;
  }

  function countsByTeam(state) {
    var counts = {};
    TEAMS.forEach(function (t) {
      counts[t.id] = { size: 0, MF: 0, DF: 0, FW: 0, ANY: 0 };
    });
    Object.keys(state).forEach(function (player) {
      var bucket = counts[state[player]];
      if (!bucket) return;
      bucket.size++;
      bucket[positionKey(player)]++;
    });
    return counts;
  }

  function assignedPlayers(state, teamId) {
    return PLAYERS.filter(function (p) {
      return state[p] === teamId;
    });
  }

  /*
   * Random but balanced pick:
   *   1. only squads that still have a free slot (size < CAPACITY)
   *   2. among those, the squads with the FEWEST players of this position
   *   3. among those, the squads with the FEWEST players overall
   *   4. drop any squad that would take its LAST slot while still missing the
   *      guaranteed minimum of some position (keeps squads balanced to the end)
   *   5. random tie-break
   */
  function chooseTeam(state, player) {
    var counts = countsByTeam(state);
    var pos = positionKey(player);
    var open = TEAMS.filter(function (t) {
      return counts[t.id].size < CAPACITY;
    });
    if (!open.length) return null;

    var candidates = open.filter(function (t) {
      return counts[t.id][pos] === minOf(counts, open, pos);
    });
    var smallest = Math.min.apply(
      null,
      candidates.map(function (t) {
        return counts[t.id].size;
      }),
    );
    candidates = candidates.filter(function (t) {
      return counts[t.id].size === smallest;
    });

    var safe = candidates.filter(function (t) {
      if (counts[t.id].size + 1 < CAPACITY) return true;
      return !POSITIONS.some(function (q) {
        var after = counts[t.id][q] + (q === pos ? 1 : 0);
        return after < POSITION_FLOOR[q];
      });
    });

    var pool = safe.length ? safe : candidates;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function minOf(counts, teams, position) {
    return Math.min.apply(
      null,
      teams.map(function (t) {
        return counts[t.id][position];
      }),
    );
  }

  function positionSummary(roster) {
    var c = { MF: 0, DF: 0, FW: 0 };
    roster.forEach(function (p) {
      var k = positionKey(p);
      if (c[k] !== undefined) c[k]++;
    });
    return "MF " + c.MF + " · DF " + c.DF + " · FW " + c.FW;
  }

  /* Offline mode: the same balance rules, kept on this device only. */
  function assignLocal(player) {
    if (state[player]) {
      return { team: teamById(state[player]), already: true };
    }
    var team = chooseTeam(state, player);
    if (!team) return { team: null, full: true };
    state[player] = team.id;
    writeLocal(state);
    return { team: team };
  }

  /* Normal mode: the server owns the roster, so every browser sees the same
     squads and the balance rules are applied once, in one place. */
  function assignPlayer(player) {
    if (mode === "remote") {
      return fetchJson(apiUrl("/assign"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: player }),
      }).then(function (data) {
        state = normalize(data.roster);
        render(state);
        return { team: teamById(data.team), already: !!data.already };
      });
    }
    var outcome = assignLocal(player);
    render(state);
    return Promise.resolve(outcome);
  }

  function slotMarkup(player, index) {
    if (!player) {
      return (
        '<li class="flex items-center justify-between gap-3 px-3 py-2.5 rounded border border-dashed border-surface-container-high bg-surface-container-low/40">' +
        '<div class="flex items-center gap-2.5 min-w-0">' +
        '<span class="font-label-sm text-[10px] font-bold text-outline">SLOT 0' +
        index +
        "</span>" +
        '<span class="font-body-sm text-body-sm text-outline italic">awaiting player…</span>' +
        "</div>" +
        '<span class="font-label-sm text-[10px] text-outline uppercase">empty</span>' +
        "</li>"
      );
    }
    return (
      '<li class="flex items-center justify-between gap-3 px-3 py-2.5 rounded border border-[#BAE6FD] bg-[#E0F2FE]">' +
      '<div class="flex items-center gap-2.5 min-w-0">' +
      '<span class="w-6 h-6 rounded-full bg-[#0284C7] text-white flex items-center justify-center font-label-sm text-[10px] font-extrabold flex-shrink-0">' +
      index +
      "</span>" +
      '<span class="font-headline-sm text-headline-sm font-bold uppercase text-on-surface truncate">' +
      player +
      "</span>" +
      "</div>" +
      '<span class="font-label-sm text-[10px] px-1.5 py-0.5 rounded bg-surface-container-lowest border border-[#BAE6FD] text-[#0284C7] font-bold flex-shrink-0">' +
      positionOf(player) +
      "</span>" +
      "</li>"
    );
  }

  function teamCardMarkup(team, roster, index) {
    var full = roster.length >= CAPACITY;
    var slots = "";
    for (var i = 0; i < CAPACITY; i++) {
      slots += slotMarkup(roster[i], i + 1);
    }
    return (
      '<article class="bg-surface-container-lowest rounded-xl border border-surface-container-high/80 shadow-sm hover:shadow-md transition-all overflow-hidden">' +
      '<div class="flex items-center justify-between gap-3 p-4 border-b border-surface-container-high bg-surface-container-low">' +
      '<div class="flex items-center gap-3 min-w-0">' +
      '<div class="w-10 h-10 rounded flex items-center justify-center shadow-inner flex-shrink-0 text-on-primary ' +
      team.glyphClass +
      '" style="background:' +
      team.bg +
      '">' +
      team.glyph +
      "</div>" +
      '<div class="min-w-0">' +
      '<span class="font-label-sm text-label-sm text-primary uppercase font-semibold">Seed ' +
      team.seed +
      "</span>" +
      '<h3 class="font-headline-sm text-headline-sm uppercase font-bold text-on-surface truncate">' +
      team.name +
      "</h3>" +
      "</div></div>" +
      '<div class="flex items-center gap-2 flex-shrink-0">' +
      '<span class="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">' +
      team.ext +
      "</span>" +
      '<span class="font-label-sm text-label-sm px-2 py-0.5 rounded-full ' +
      (full
        ? "bg-primary-container text-on-primary-container font-bold"
        : "bg-surface-container-low text-on-surface-variant") +
      ' font-bold">' +
      roster.length +
      "/" +
      CAPACITY +
      "</span>" +
      "</div></div>" +
      '<div class="px-4 py-2 flex items-center justify-between gap-2 border-b border-surface-container-high/60 bg-surface-container-low/40 font-label-sm text-label-sm text-on-surface-variant">' +
      "<span>POSITION MIX</span>" +
      '<span class="font-mono text-[11px] text-secondary font-bold">' +
      positionSummary(roster) +
      "</span>" +
      "</div>" +
      '<ul class="p-3 flex flex-col gap-2">' +
      slots +
      "</ul>" +
      '<div class="px-4 py-2.5 bg-surface-container-low/60 border-t border-surface-container-high/60 font-label-sm text-label-sm text-on-surface-variant flex items-center justify-between">' +
      "<span>" +
      (full ? "ROSTER_LOCKED" : "OPEN_FOR_SIGNUPS") +
      "</span>" +
      '<span class="font-mono text-[11px]">' +
      "team." +
      team.id +
      "()" +
      "</span>" +
      "</div></article>"
    );
  }

  function render(state) {
    var counts = countsByTeam(state);
    var assigned = Object.keys(state).length;
    var remaining = PLAYERS.length - assigned;

    statAssigned.textContent = assigned + " / " + PLAYERS.length;
    statRemaining.textContent = String(remaining);
    if (statTotal) statTotal.textContent = PLAYERS.length + " Total";
    if (badgePlayers) {
      badgePlayers.textContent =
        "< 4 TEAMS / ROSTER ALLOCATOR / " + PLAYERS.length + " PLAYERS />";
    }

    gridEl.innerHTML = TEAMS.map(function (team, i) {
      return teamCardMarkup(team, assignedPlayers(state, team.id), i + 1);
    }).join("");

    var current = selectEl.value;
    var free = PLAYERS.filter(function (p) {
      return !state[p];
    });
    selectEl.innerHTML =
      '<option value="">— SELECT YOUR NAME —</option>' +
      free
        .map(function (p) {
          return (
            '<option value="' +
            p +
            '">' +
            p +
            " · " +
            positionOf(p) +
            "</option>"
          );
        })
        .join("");
    if (current && free.indexOf(current) !== -1) selectEl.value = current;

    var locked = remaining === 0;
    assignBtn.disabled = locked;
    if (locked) {
      selectEl.innerHTML =
        "<option value=\"\">— ALL " +
        PLAYERS.length +
        " PLAYERS ASSIGNED —</option>";
      selectEl.disabled = true;
    }
  }

  function showResult(player, team, note) {
    resultEl.classList.remove("hidden");
    resultEl.classList.add("flex");
    resultEl.innerHTML =
      '<div class="flex items-center gap-3 min-w-0">' +
      '<div class="w-9 h-9 rounded flex items-center justify-center shadow-inner flex-shrink-0 text-on-primary ' +
      team.glyphClass +
      '" style="background:' +
      team.bg +
      '">' +
      team.glyph +
      "</div>" +
      '<div class="min-w-0">' +
      '<p class="font-label-sm text-[11px] text-[#0284C7] uppercase tracking-widest font-bold">' +
      note +
      "</p>" +
      '<p class="font-headline-sm text-headline-sm uppercase font-bold text-on-surface truncate">' +
      player +
      " → " +
      team.name +
      "</p></div></div>" +
      '<span class="font-label-sm text-[10px] px-2 py-1 rounded bg-surface-container-lowest border border-[#BAE6FD] text-[#0284C7] font-bold flex-shrink-0 uppercase">' +
      "SEED " +
      team.seed +
      "</span>";
  }

  function showFull() {
    resultEl.classList.remove("hidden");
    resultEl.classList.add("flex");
    resultEl.innerHTML =
      '<div class="min-w-0">' +
      '<p class="font-label-sm text-[11px] text-error uppercase tracking-widest font-bold">ERROR: ROSTER_FULL</p>' +
      '<p class="font-headline-sm text-headline-sm uppercase font-bold text-on-surface">ALL ' +
      PLAYERS.length +
      ' PLAYERS ARE ALREADY IN A SQUAD</p>' +
      "</div>";
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[ch];
    });
  }

  function showError(err) {
    if (err && err.status === 409) {
      showFull();
      return;
    }
    var detail =
      err && err.body && err.body.detail
        ? err.body.detail
        : err && err.message
          ? err.message
          : "UNKNOWN_ERROR";
    var code =
      err && err.status ? "HTTP_" + err.status : "NETWORK_ERROR";
    setStatus("SYNC // " + code, "error");
    resultEl.classList.remove("hidden");
    resultEl.classList.add("flex");
    resultEl.innerHTML =
      '<div class="min-w-0">' +
      '<p class="font-label-sm text-[11px] text-error uppercase tracking-widest font-bold">ERROR: ' +
      code +
      "</p>" +
      '<p class="font-headline-sm text-headline-sm uppercase font-bold text-on-surface">' +
      escapeHtml(detail) +
      "</p>" +
      '<p class="font-label-sm text-label-sm text-on-surface-variant uppercase mt-0.5">' +
      (mode === "remote"
        ? "Backend rejected the request — nothing was saved"
        : "Local mode — assignments stay on this device") +
      "</p></div>";
  }

  function wireRosterUI() {
    selectEl.addEventListener("change", function () {
      resultEl.classList.add("hidden");
      resultEl.classList.remove("flex");
    });

    assignBtn.addEventListener("click", function () {
      var player = selectEl.value;
      if (!player) {
        selectEl.focus();
        return;
      }
      assignBtn.disabled = true;
      assignPlayer(player)
        .then(function (outcome) {
          if (outcome.full) {
            showFull();
            return;
          }
          if (!outcome.team) {
            showError({ message: "UNKNOWN_TEAM_RETURNED" });
            return;
          }
          showResult(
            player,
            outcome.team,
            outcome.already ? "ALREADY ASSIGNED →" : "ASSIGNED →",
          );
        })
        .catch(function (err) {
          showError(err);
          render(state);
        });
    });

    resetBtn.addEventListener("click", function () {
      if (
        !window.confirm(
          mode === "remote"
            ? "Reset the whole roster? Every player becomes unassigned — on every device."
            : "Reset the local roster? Every player on this device becomes unassigned.",
        )
      ) {
        return;
      }
      var done =
        mode === "remote"
          ? fetchJson(apiUrl("/reset"), { method: "POST" })
          : Promise.resolve().then(function () {
              writeLocal({});
              return { roster: {} };
            });
      done
        .then(function (data) {
          state = normalize(data.roster || {});
          resultEl.classList.add("hidden");
          resultEl.classList.remove("flex");
          render(state);
          setStatus(
            mode === "remote"
              ? "SYNC // LIVE · JSON BACKEND"
              : "SYNC // OFFLINE · LOCAL ONLY",
            mode === "remote" ? "ok" : "warn",
          );
        })
        .catch(function (err) {
          showError(err);
        });
    });

    loadRoster();
  }

  /* Shared data + helpers for the other pages (players.html). */
  window.PL5 = {
    PLAYERS: PLAYERS,
    TEAMS: TEAMS,
    positionOf: positionOf,
    positionKey: positionKey,
    teamById: teamById,
    apiUrl: apiUrl,
    fetchJson: fetchJson,
    setStatus: setStatus,
    getState: function () {
      return state;
    },
    getMode: function () {
      return mode;
    },
  };

  /* On pages without the allocator panel only the data is exposed. */
  if (gridEl && selectEl && assignBtn && resetBtn && resultEl) {
    wireRosterUI();
  }
})();

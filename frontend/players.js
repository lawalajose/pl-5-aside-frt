(function () {
  var P = window.PL5;
  var badgeEl = document.getElementById("badge-players");
  var statTotal = document.getElementById("stat-total");
  var statDf = document.getElementById("stat-df");
  var statMf = document.getElementById("stat-mf");
  var statFw = document.getElementById("stat-fw");
  var statAssigned = document.getElementById("stat-assigned");

  var GROUPS = [
    { key: "DF", label: "DEFENDERS", slug: "df" },
    { key: "MF", label: "MIDFIELDERS", slug: "mf" },
    { key: "FW", label: "FORWARDS", slug: "fw" },
  ];

  if (!P) {
    var statusFallback = document.getElementById("sync-status");
    if (statusFallback) statusFallback.textContent = "SYNC // DATA UNAVAILABLE";
    return;
  }

  var players = P.PLAYERS;
  var roster = {};

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        ch
      ];
    });
  }

  function readLocal() {
    try {
      var raw = window.localStorage.getItem("pl5aside.roster.v1");
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function cardMarkup(player, index, team) {
    var assigned = !!team;
    var wrap = assigned
      ? "flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[#BAE6FD] bg-[#E0F2FE] shadow-sm"
      : "flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-dashed border-surface-container-high bg-surface-container-low/40";
    var num = index < 10 ? "0" + index : String(index);
    var teamLine = assigned
      ? '<span class="inline-flex items-center gap-1.5 min-w-0">' +
        '<span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:' +
        team.bg +
        '"></span>' +
        '<span class="truncate">' +
        escapeHtml(team.name) +
        "</span>" +
        '<span class="text-outline flex-shrink-0">' +
        team.ext +
        "</span></span>"
      : '<span class="text-outline italic">awaiting sign-up…</span>';
    return (
      '<article class="' +
      wrap +
      '">' +
      '<div class="flex items-center gap-3 min-w-0">' +
      '<span class="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center font-label-sm text-[10px] font-extrabold ' +
      (assigned
        ? "bg-[#0284C7] text-white"
        : "bg-surface-container-high text-on-surface-variant") +
      '">' +
      num +
      "</span>" +
      '<div class="min-w-0">' +
      '<p class="font-headline-sm text-headline-sm font-bold uppercase text-on-surface truncate">' +
      escapeHtml(player) +
      "</p>" +
      '<p class="font-label-sm text-[11px] uppercase mt-0.5 flex items-center gap-1.5 text-on-surface-variant">' +
      teamLine +
      "</p>" +
      "</div></div>" +
      '<span class="font-label-sm text-[10px] px-1.5 py-0.5 rounded bg-surface-container-lowest border border-[#BAE6FD] text-[#0284C7] font-bold flex-shrink-0">' +
      P.positionKey(player) +
      "</span>" +
      "</article>"
    );
  }

  function render() {
    if (badgeEl) {
      badgeEl.textContent =
        "< 4 TEAMS / REGISTERED PLAYERS / " + players.length + " />";
    }
    if (statTotal) statTotal.textContent = String(players.length);

    var assignedTotal = 0;
    GROUPS.forEach(function (group) {
      var list = players.filter(function (p) {
        return P.positionKey(p) === group.key;
      });
      var label = document.getElementById("label-" + group.slug);
      var grid = document.getElementById("grid-" + group.slug);
      if (label) {
        label.textContent =
          group.label + " // " + group.key + " // " + list.length + " PLAYERS";
      }
      if (grid) {
        grid.innerHTML = list
          .map(function (player, i) {
            var teamId = roster[player];
            var team = teamId ? P.teamById(teamId) : null;
            if (team) assignedTotal++;
            return cardMarkup(player, i + 1, team);
          })
          .join("");
      }
      if (group.key === "DF" && statDf) statDf.textContent = String(list.length);
      if (group.key === "MF" && statMf) statMf.textContent = String(list.length);
      if (group.key === "FW" && statFw) statFw.textContent = String(list.length);
    });

    if (statAssigned) {
      statAssigned.textContent = assignedTotal + " / " + players.length;
    }
  }

  P.setStatus("SYNC // CONNECTING…", "pending");
  P.fetchJson(P.apiUrl("/roster"), { cache: "no-store" })
    .then(function (data) {
      roster = data.roster || {};
      if (data.players && data.players.length) players = data.players;
      P.setStatus("SYNC // LIVE · JSON BACKEND", "ok");
      render();
    })
    .catch(function () {
      roster = readLocal();
      P.setStatus("SYNC // OFFLINE · LOCAL ONLY", "warn");
      render();
    });
})();

(function () {
  "use strict";

  var loadingState = document.getElementById("loadingState");
  var pendingState = document.getElementById("pendingState");
  var notFoundState = document.getElementById("notFoundState");
  var passState = document.getElementById("passState");

  function show(el) {
    [loadingState, pendingState, notFoundState, passState].forEach(function (node) {
      if (node) {
        node.hidden = node !== el;
      }
    });
  }

  function getProspectIdFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var fromUrl = String(params.get("id") || "").trim();
      if (fromUrl) {
        return fromUrl;
      }
      return window.localStorage.getItem("becaVeneziaLastSolicitud") || "";
    } catch (error) {
      return "";
    }
  }

  function formatDate(isoOrDateString) {
    if (!isoOrDateString) {
      return "—";
    }
    var date = new Date(isoOrDateString);
    if (isNaN(date.getTime())) {
      return String(isoOrDateString);
    }
    return date.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
  }

  function renderPass(record) {
    var Prospect = window.BecaVeneziaProspect;
    var notes = record.notes || "";
    var asesora = Prospect.decodeAdvisorValue(Prospect.extractMetadata(notes, "Asesora asignada"));

    document.getElementById("passNombre").textContent = record.full_name || "—";
    document.getElementById("passCurso").textContent = record.course_interest || "—";
    document.getElementById("passAsesora").textContent = asesora || "Instituto Venezia";
    document.getElementById("passFecha").textContent = formatDate(record.created_at);
    document.getElementById("pageTitle").textContent = "Tu pase de Beca Venezia";

    show(passState);
  }

  function handleRecord(record) {
    if (!record) {
      show(notFoundState);
      return;
    }

    var Prospect = window.BecaVeneziaProspect;
    var confirmado = Prospect.extractMetadata(record.notes || "", "Confirmación beca enviada");

    if (String(confirmado).trim().toLowerCase() === "sí" || String(confirmado).trim().toLowerCase() === "si") {
      renderPass(record);
    } else {
      show(pendingState);
    }
  }

  function init() {
    var id = getProspectIdFromUrl();
    if (!id) {
      show(notFoundState);
      return;
    }

    var client = window.BecaVeneziaSupabase ? window.BecaVeneziaSupabase.client : null;
    if (!client) {
      show(notFoundState);
      return;
    }

    client
      .from("prospects")
      .select("*")
      .eq("id", id)
      .limit(1)
      .then(function (result) {
        if (result.error || !result.data || !result.data.length) {
          show(notFoundState);
          return;
        }
        handleRecord(result.data[0]);
      })
      .catch(function () {
        show(notFoundState);
      });
  }

  var downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", function () {
      window.print();
    });
  }

  show(loadingState);
  init();
})();

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

  // Se guarda el registro ya resuelto para poder dibujar la imagen del pase
  // cuando la persona le dé a "Descargar mi pase", sin tener que volver a
  // consultar Supabase.
  var currentPassData = null;

  // El pase es válido solo por 48 horas a partir de la confirmación real
  // (petición del CEO, 29/oct/2026; ampliado de 24 a 48 horas el 14/nov/2026): que no se presenten semanas o meses
  // después esperando que la beca siga en pie. El timestamp "Confirmada el"
  // lo escribe markBecaConfirmationSent() en Venezia One en el momento
  // exacto de la confirmación (y se borra si se reabre/reintenta). Si el
  // registro no tiene ese timestamp (pases confirmados antes de este
  // cambio), no se muestra ningún aviso de vigencia, para no inventar una
  // fecha que no existe.
  var PASS_VALIDITY_HOURS = 48;

  function getValidityInfo(record) {
    var Prospect = window.BecaVeneziaProspect;
    var confirmadoEl = Prospect.extractMetadata(record.notes || "", "Confirmada el");
    if (!confirmadoEl) {
      return null;
    }
    var confirmedDate = new Date(confirmadoEl);
    if (isNaN(confirmedDate.getTime())) {
      return null;
    }
    var hoursElapsed = (Date.now() - confirmedDate.getTime()) / 3600000;
    var hoursLeft = PASS_VALIDITY_HOURS - hoursElapsed;
    return {
      expired: hoursLeft <= 0,
      hoursLeft: hoursLeft,
    };
  }

  function formatHoursLabel(hours) {
    var rounded = Math.max(1, Math.round(hours));
    return rounded === 1 ? "1 hora" : rounded + " horas";
  }

  // En el pase se muestra, de preferencia, lo que la SOLICITANTE dijo en el
  // formulario sobre quién la atendió ("Asesora que te atendió (según la
  // solicitante)") -- petición explícita del CEO, 29/oct/2026: el pase debe
  // reflejar eso directo, sin esperar a que una asesora lo asigne a mano en
  // el CRM. Si la solicitante contestó "No lo sé / nadie en particular" (o
  // no contestó -- solicitudes de antes de esta pregunta), se usa lo que la
  // asesora sí haya asignado manualmente en el CRM ("Asesora asignada"), y
  // si tampoco hay eso, el nombre genérico del instituto.
  function resolveAsesoraLabel(notes) {
    var Prospect = window.BecaVeneziaProspect;
    var declarada = Prospect.decodeAdvisorValue(
      Prospect.extractMetadata(notes, "Asesora que te atendió (según la solicitante)")
    );
    if (declarada && declarada.indexOf("No lo sé") !== 0) {
      return declarada;
    }
    var asignada = Prospect.decodeAdvisorValue(Prospect.extractMetadata(notes, "Asesora asignada"));
    if (asignada) {
      return asignada;
    }
    return "Instituto Venezia";
  }

  function renderPass(record) {
    var Prospect = window.BecaVeneziaProspect;
    var notes = record.notes || "";

    var nombre = record.full_name || "—";
    var curso = record.course_interest || "—";
    var asesoraLabel = resolveAsesoraLabel(notes);
    var fecha = formatDate(record.created_at);
    var validity = getValidityInfo(record);

    // Folio corto para identificar el pase en recepción (sale del id de la
    // solicitud, no se inventa nada).
    var folio = "BV-" + String(record.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
    document.getElementById("passNombre").textContent = nombre + "!";
    var folioEl = document.getElementById("passFolio");
    if (folioEl) {
      folioEl.textContent = folio;
    }
    document.getElementById("passCurso").textContent = curso;
    document.getElementById("passAsesora").textContent = asesoraLabel;
    document.getElementById("passFecha").textContent = fecha;
    document.getElementById("pageTitle").textContent = "Tu pase de Beca Venezia";

    var validityEl = document.getElementById("passValidity");
    if (validityEl) {
      if (!validity) {
        validityEl.hidden = true;
      } else if (validity.expired) {
        validityEl.hidden = false;
        validityEl.className = "pass-validity pass-validity-expired";
        validityEl.textContent =
          "Este pase ya venció (era válido por 48 horas). Escríbenos por WhatsApp para confirmar si tu lugar sigue disponible.";
      } else {
        validityEl.hidden = false;
        validityEl.className = "pass-validity pass-validity-ok";
        validityEl.textContent =
          "Válido por 48 horas desde tu confirmación — te quedan " + formatHoursLabel(validity.hoursLeft) + ".";
      }
    }

    currentPassData = {
      nombre: nombre,
      curso: curso,
      asesora: asesoraLabel,
      fecha: fecha,
      inscripcion: "$1,149.99",
      mensualidad: "$1,599.99",
      material: "80% del material",
      // Precio regular de comparación = Plan Platinum (mismos beneficios:
      // 80% de material). Petición del CEO, 18/nov/2026: que la alumna vea
      // cuánto se ahorra con la beca en vez de solo la cifra final.
      inscripcionRegular: "$2,300",
      mensualidadRegular: "$1,800",
      ahorro: "Te ahorras más de $2,000 en tu curso",
      notaRegular: "Precio regular: Plan Platinum, con los mismos beneficios",
      folio: folio,
      validity: validity,
    };

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

  // Dibuja el pase como una imagen (canvas) y la descarga directo como PNG
  // -- antes esto era window.print(), que en celular manda al dialogo de
  // imprimir/compartir en vez de bajar la imagen tal cual. Petición del CEO
  // (29/oct/2026): que "Descargar pase" sí descargue la imagen que se ve.
  function wrapText(ctx, text, maxWidth) {
    var words = String(text || "").split(" ");
    var lines = [];
    var current = "";
    for (var i = 0; i < words.length; i += 1) {
      var test = current ? current + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = words[i];
      } else {
        current = test;
      }
    }
    if (current) {
      lines.push(current);
    }
    return lines;
  }

  // Diseño premium (petición del CEO, 18/nov/2026): negro profundo, dorado
  // metálico, Cinzel / Cormorant, marco doble con diamantes, banda dorada de
  // ahorro y talón con folio -- igual que la página. Se dibuja dos veces: la
  // primera solo para medir la altura total (todo depende de cuántas líneas
  // ocupan nombre, aviso de vigencia y pie) y la segunda ya en el canvas con
  // la altura exacta, para que nada se encime ni quede cortado.
  var LX_SERIF = "'Cinzel', 'Cormorant Garamond', Georgia, serif";
  var LX_SERIF_ALT = "'Cormorant Garamond', Georgia, serif";
  var LX_SANS = "'Manrope', 'Helvetica Neue', Arial, sans-serif";

  function lxGold(ctx, x0, y0, x1, y1) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "#8a6a2f");
    g.addColorStop(0.2, "#d4af6a");
    g.addColorStop(0.42, "#f7e7b4");
    g.addColorStop(0.6, "#c9a05a");
    g.addColorStop(0.78, "#f3dc9c");
    g.addColorStop(1, "#9c7a3c");
    return g;
  }

  function lxSpacing(ctx, px) {
    if ("letterSpacing" in ctx) {
      ctx.letterSpacing = px + "px";
    }
  }

  function lxRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
  }

  function lxDiamond(ctx, cx, cy, size, fill) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = fill;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function lxFitFont(ctx, text, weight, family, maxSize, minSize, maxWidth) {
    var size = maxSize;
    ctx.font = weight + " " + size + "px " + family;
    while (size > minSize && ctx.measureText(text).width > maxWidth) {
      size -= 2;
      ctx.font = weight + " " + size + "px " + family;
    }
    return size;
  }

  function renderPassCanvas(ctx, data, width, height, draw) {
    var cx = width / 2;
    var ivory = "#f6efe1";
    var champagne = "#c9b896";
    var muted = "#8f8573";
    var line = "rgba(212, 175, 106, 0.38)";
    var danger = "#e6786b";

    if (draw) {
      var bg = ctx.createRadialGradient(cx, -80, 40, cx, 300, height);
      bg.addColorStop(0, "#2a2216");
      bg.addColorStop(0.35, "#0e0c09");
      bg.addColorStop(1, "#050505");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Marco doble: lámina dorada exterior + filete fino interior con
      // diamantes en las esquinas.
      ctx.strokeStyle = lxGold(ctx, 0, 0, width, height);
      ctx.lineWidth = 4;
      lxRoundRect(ctx, 30, 30, width - 60, height - 60, 26);
      ctx.stroke();
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5;
      lxRoundRect(ctx, 46, 46, width - 92, height - 92, 18);
      ctx.stroke();
      var gd = lxGold(ctx, 0, 0, width, height);
      [[46, 46], [width - 46, 46], [46, height - 46], [width - 46, height - 46]].forEach(function (p) {
        lxDiamond(ctx, p[0], p[1], 14, gd);
      });
    }

    var y = 112;
    // Corona.
    if (draw) {
      ctx.save();
      ctx.translate(cx - 48, y - 30);
      ctx.scale(1.5, 1.5);
      var cg = lxGold(ctx, 0, 0, 64, 40);
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(4, 34); ctx.lineTo(8, 10); ctx.lineTo(20, 22); ctx.lineTo(32, 4);
      ctx.lineTo(44, 22); ctx.lineTo(56, 10); ctx.lineTo(60, 34); ctx.closePath();
      ctx.fill();
      ctx.fillRect(4, 35, 56, 4);
      ctx.fillStyle = "#f7e7b4";
      [[8, 9, 2.6], [32, 3.5, 2.8], [56, 9, 2.6]].forEach(function (c) {
        ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    y += 92;
    if (draw) {
      ctx.font = "700 60px " + LX_SERIF;
      lxSpacing(ctx, 12);
      ctx.fillStyle = lxGold(ctx, cx - 220, y - 60, cx + 220, y);
      ctx.fillText("VENEZIA", cx + 6, y);
      ctx.font = "600 19px " + LX_SANS;
      lxSpacing(ctx, 8);
      ctx.fillStyle = champagne;
      ctx.fillText("INSTITUTO DE BELLEZA", cx + 4, y + 38);
      lxSpacing(ctx, 0);
    }

    // Divisor con diamante.
    y += 84;
    if (draw) {
      var dl = ctx.createLinearGradient(cx - 240, 0, cx + 240, 0);
      dl.addColorStop(0, "rgba(212,175,106,0)");
      dl.addColorStop(0.5, "#d4af6a");
      dl.addColorStop(1, "rgba(212,175,106,0)");
      ctx.fillStyle = dl;
      ctx.fillRect(cx - 240, y, 480, 1.5);
      lxDiamond(ctx, cx, y + 1, 14, lxGold(ctx, cx - 10, y - 10, cx + 10, y + 10));
    }

    y += 64;
    if (draw) {
      ctx.font = "700 20px " + LX_SANS;
      lxSpacing(ctx, 10);
      ctx.fillStyle = champagne;
      ctx.fillText("PASE OFICIAL", cx + 5, y);
      ctx.font = "700 74px " + LX_SERIF;
      lxSpacing(ctx, 5);
      ctx.fillStyle = lxGold(ctx, cx - 330, y, cx + 330, y + 80);
      ctx.fillText("BECA VENEZIA", cx + 2, y + 82);
      lxSpacing(ctx, 0);
    }
    y += 82;

    // Aviso de vigencia (texto fijo: la imagen es una foto, no un contador).
    var validityText = "";
    if (data.validity) {
      validityText = data.validity.expired
        ? "Este pase ya venció (vigencia de 48 horas). Contáctanos por WhatsApp para confirmar tu lugar."
        : "Válido por 48 horas a partir de tu confirmación";
    }
    if (validityText) {
      y += 52;
      ctx.font = "700 20px " + LX_SANS;
      lxSpacing(ctx, 1);
      var vLines = wrapText(ctx, validityText, width - 320);
      var vW = 0;
      vLines.forEach(function (l) { vW = Math.max(vW, ctx.measureText(l).width); });
      vW += 56;
      var vH = vLines.length * 26 + 20;
      if (draw) {
        var expired = data.validity.expired;
        ctx.fillStyle = expired ? "rgba(230,120,107,0.1)" : "rgba(212,175,106,0.08)";
        ctx.strokeStyle = expired ? danger : line;
        ctx.lineWidth = 1.5;
        lxRoundRect(ctx, cx - vW / 2, y - 26, vW, vH, vH / 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = expired ? danger : champagne;
        vLines.forEach(function (l, i) { ctx.fillText(l, cx, y + i * 26); });
      }
      lxSpacing(ctx, 0);
      y += (vLines.length - 1) * 26;
    }

    // Felicitación + nombre en dorado (se achica si es muy largo; si aun
    // así no cabe, se parte en dos líneas).
    y += 82;
    if (draw) {
      ctx.font = "italic 600 44px " + LX_SERIF_ALT;
      ctx.fillStyle = ivory;
      ctx.fillText("¡Felicidades,", cx, y);
    }
    var nameText = String(data.nombre || "—") + "!";
    ctx.font = "700 58px " + LX_SERIF;
    lxSpacing(ctx, 2);
    var nameLines = [nameText];
    var nameSize = lxFitFont(ctx, nameText, "700", LX_SERIF, 58, 40, width - 200);
    if (ctx.measureText(nameText).width > width - 200) {
      nameSize = 46;
      ctx.font = "700 46px " + LX_SERIF;
      nameLines = wrapText(ctx, nameText, width - 200);
    }
    y += nameSize + 18;
    nameLines.forEach(function (l, i) {
      if (draw) {
        ctx.fillStyle = lxGold(ctx, cx - 400, y - nameSize, cx + 400, y);
        ctx.fillText(l, cx, y + i * (nameSize + 10));
      }
    });
    y += (nameLines.length - 1) * (nameSize + 10);
    lxSpacing(ctx, 0);

    // Datos de la alumna.
    var left = 110;
    var right = width - 110;
    y += 52;
    if (draw) {
      ctx.fillStyle = line;
      ctx.fillRect(left, y, right - left, 1.5);
    }
    var rows = [
      ["CURSO", data.curso],
      ["ASESORA QUE TE ATENDIÓ", data.asesora],
      ["FECHA DE SOLICITUD", data.fecha],
    ];
    rows.forEach(function (row, i) {
      y += 58;
      if (draw) {
        ctx.textAlign = "left";
        ctx.font = "700 17px " + LX_SANS;
        lxSpacing(ctx, 3);
        ctx.fillStyle = muted;
        ctx.fillText(row[0], left, y);
        lxSpacing(ctx, 0);
        var labelW = ctx.measureText(row[0]).width + row[0].length * 3 + 30;
        ctx.textAlign = "right";
        ctx.fillStyle = ivory;
        lxFitFont(ctx, String(row[1] || "—"), "600", LX_SANS, 27, 18, right - left - labelW);
        ctx.fillText(String(row[1] || "—"), right, y + 1);
        if (i < rows.length - 1) {
          ctx.fillStyle = "rgba(212,175,106,0.16)";
          ctx.fillRect(left, y + 22, right - left, 1);
        }
      }
    });
    y += 30;
    if (draw) {
      ctx.fillStyle = line;
      ctx.fillRect(left, y, right - left, 1.5);
    }

    // Panel de montos (negro con filete dorado, como Accesos Venezia).
    y += 36;
    var panelX = 100;
    var panelW = width - 200;
    var panelY = y;
    var panelH = 318;
    if (draw) {
      var pg = ctx.createLinearGradient(0, panelY, 0, panelY + panelH);
      pg.addColorStop(0, "#030303");
      pg.addColorStop(1, "#0f0d0a");
      ctx.fillStyle = pg;
      lxRoundRect(ctx, panelX, panelY, panelW, panelH, 22);
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.font = "italic 500 25px " + LX_SERIF_ALT;
      ctx.fillStyle = muted;
      ctx.fillText(String(data.notaRegular || ""), cx, panelY + 50);

      var amounts = [
        ["INSCRIPCIÓN CON BECA", data.inscripcion, data.inscripcionRegular, 46],
        ["MENSUALIDAD CON BECA", data.mensualidad, data.mensualidadRegular, 46],
        ["APOYO DE MATERIAL", data.material, "", 34],
      ];
      var ay = panelY + 120;
      amounts.forEach(function (row) {
        ctx.textAlign = "left";
        ctx.font = "700 18px " + LX_SANS;
        lxSpacing(ctx, 2.5);
        ctx.fillStyle = champagne;
        ctx.fillText(row[0], panelX + 40, ay - 6);
        lxSpacing(ctx, 0);

        var pr = panelX + panelW - 40;
        ctx.textAlign = "right";
        ctx.font = "700 " + row[3] + "px " + LX_SERIF;
        var priceText = String(row[1] || "—");
        var pw = ctx.measureText(priceText).width;
        ctx.fillStyle = lxGold(ctx, pr - pw, ay - row[3], pr, ay);
        ctx.fillText(priceText, pr, ay);
        if (row[2]) {
          ctx.font = "600 24px " + LX_SANS;
          ctx.fillStyle = "#7c7770";
          var oldText = String(row[2]);
          var ow = ctx.measureText(oldText).width;
          var oldRight = pr - pw - 22;
          ctx.fillText(oldText, oldRight, ay - 8);
          ctx.strokeStyle = "#b04b4b";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(oldRight - ow - 3, ay - 16);
          ctx.lineTo(oldRight + 3, ay - 16);
          ctx.stroke();
        }
        ay += 74;
      });
    }
    y = panelY + panelH;

    // Banda dorada de ahorro.
    y += 30;
    var bandH = 78;
    if (draw && data.ahorro) {
      ctx.fillStyle = lxGold(ctx, panelX, y, panelX + panelW, y + bandH);
      lxRoundRect(ctx, panelX, y, panelW, bandH, 16);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "#1b1407";
      ctx.font = "800 26px " + LX_SANS;
      lxSpacing(ctx, 2.5);
      ctx.fillText(String(data.ahorro).toUpperCase(), cx + 1, y + 49);
      lxSpacing(ctx, 0);
    }
    y += bandH;

    // Talón perforado con folio.
    y += 48;
    if (draw) {
      ctx.strokeStyle = "rgba(212,175,106,0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 9]);
      ctx.beginPath();
      ctx.moveTo(66, y);
      ctx.lineTo(width - 66, y);
      ctx.stroke();
      ctx.setLineDash([]);
      [30, width - 30].forEach(function (nx) {
        ctx.fillStyle = "#050505";
        ctx.beginPath();
        ctx.arc(nx, y, 18, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    y += 50;
    if (draw) {
      ctx.font = "700 17px " + LX_SANS;
      lxSpacing(ctx, 3.5);
      ctx.textAlign = "left";
      ctx.fillStyle = muted;
      ctx.fillText("FOLIO", left, y);
      var fw = ctx.measureText("FOLIO").width + 24;
      ctx.fillStyle = ivory;
      ctx.fillText(String(data.folio || "—"), left + fw, y);
      ctx.textAlign = "right";
      ctx.fillStyle = muted;
      ctx.fillText("PERSONAL E INTRANSFERIBLE", right, y);
      lxSpacing(ctx, 0);
    }

    // Pie.
    ctx.font = "400 21px " + LX_SANS;
    var footerLines = wrapText(
      ctx,
      "Preséntalo (impreso o en tu celular) en Instituto de Belleza Venezia, Tlaxcala, " +
        "para validar tu beca y completar tu inscripción.",
      width - 240
    );
    y += 22;
    footerLines.forEach(function (l) {
      y += 32;
      if (draw) {
        ctx.textAlign = "center";
        ctx.fillStyle = muted;
        ctx.fillText(l, cx, y);
      }
    });

    return y + 80;
  }

  function drawPassImage(data) {
    var width = 1080;
    var measureCanvas = document.createElement("canvas");
    measureCanvas.width = width;
    measureCanvas.height = 10;
    var height = Math.ceil(renderPassCanvas(measureCanvas.getContext("2d"), data, width, 2400, false));

    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    renderPassCanvas(canvas.getContext("2d"), data, width, height, true);
    return canvas;
  }

  function triggerImageDownload(canvas, filename) {
    canvas.toBlob(function (blob) {
      if (!blob) {
        return;
      }
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 2000);
    }, "image/png");
  }

  var downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", function () {
      if (!currentPassData) {
        return;
      }
      var finish = function () {
        var canvas = drawPassImage(currentPassData);
        var slug = String(currentPassData.nombre || "pase")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        triggerImageDownload(canvas, "pase-beca-venezia-" + (slug || "pase") + ".png");
      };
      if (document.fonts && document.fonts.load) {
        // Las fuentes de lujo (Cinzel / Cormorant / Manrope) deben estar
        // cargadas antes de dibujar el canvas, o saldría con letra genérica.
        Promise.all([
          document.fonts.load("700 60px Cinzel"),
          document.fonts.load("italic 600 44px 'Cormorant Garamond'"),
          document.fonts.load("700 52px 'Cormorant Garamond'"),
          document.fonts.load("700 20px Manrope"),
          document.fonts.load("800 26px Manrope"),
        ])
          .then(function () { return document.fonts.ready; })
          .then(finish)
          .catch(finish);
      } else {
        finish();
      }
    });
  }

  show(loadingState);
  init();
})();

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

  // El pase es válido solo por 24 horas a partir de la confirmación real
  // (petición del CEO, 29/oct/2026): que no se presenten semanas o meses
  // después esperando que la beca siga en pie. El timestamp "Confirmada el"
  // lo escribe markBecaConfirmationSent() en Venezia One en el momento
  // exacto de la confirmación (y se borra si se reabre/reintenta). Si el
  // registro no tiene ese timestamp (pases confirmados antes de este
  // cambio), no se muestra ningún aviso de vigencia, para no inventar una
  // fecha que no existe.
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
    var hoursLeft = 24 - hoursElapsed;
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

    document.getElementById("passNombre").textContent = nombre;
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
          "Este pase ya venció (era válido por 24 horas). Escríbenos por WhatsApp para confirmar si tu lugar sigue disponible.";
      } else {
        validityEl.hidden = false;
        validityEl.className = "pass-validity pass-validity-ok";
        validityEl.textContent =
          "Válido por 24 horas desde tu confirmación — te quedan " + formatHoursLabel(validity.hoursLeft) + ".";
      }
    }

    currentPassData = {
      nombre: nombre,
      curso: curso,
      asesora: asesoraLabel,
      fecha: fecha,
      inscripcion: "$999.99",
      mensualidad: "$1,599.99",
      material: "80% del material",
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

  function drawPassImage(data) {
    var width = 1080;

    // Texto de vigencia (petición del CEO, 29/oct/2026): la imagen
    // descargada es una foto fija, así que aquí va el texto estático de
    // "válido por 24 horas", no un contador en vivo como en la página.
    var validityText = "";
    if (data.validity) {
      validityText = data.validity.expired
        ? "Este pase ya venció (vigencia de 24 horas). Contáctanos por WhatsApp para confirmar tu lugar."
        : "Válido por 24 horas a partir de tu confirmación.";
    }

    // El canvas se crea una vez, con una altura provisional, solo para medir
    // cuántas líneas ocupan el pie de página y el aviso de vigencia (el
    // wrapping depende de la fuente, que ya está lista en este punto).
    // Luego se recalcula la altura exacta y se redimensiona ANTES de
    // dibujar nada, para que ningún bloque de texto se encime con otro
    // (ya pasó una vez con el pie de página cuando se hizo esta función).
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = 2000;
    var ctx = canvas.getContext("2d");

    ctx.font = "400 22px Arial, sans-serif";
    var footerText =
      "Este pase es personal e intransferible. Preséntalo (impreso o en tu celular) en " +
      "Instituto de Belleza Venezia, Tlaxcala, para validar tu beca y completar tu inscripción.";
    var footerLines = wrapText(ctx, footerText, width - 180);

    ctx.font = "700 21px Arial, sans-serif";
    var validityLines = validityText ? wrapText(ctx, validityText, width - 260) : [];

    var cardH = 580;
    var validityBlockHeight = validityLines.length ? 44 + (validityLines.length - 1) * 26 : 0;
    var topHeight = 100 + 80 + 56 + validityBlockHeight + 70; // hasta el título inclusive
    var cardY = topHeight + 50;
    var footerY = cardY + cardH + 70;
    var footerBlockHeight = footerLines.length * 32;
    var height = footerY + footerBlockHeight + 50;

    canvas.height = height; // redimensionar limpia el canvas; aún no se dibujó nada arriba.
    ctx = canvas.getContext("2d");

    var bg = "#0b0a0c";
    var card = "#18161a";
    var cardBorder = "rgba(214, 178, 105, 0.35)";
    var gold = "#d6b269";
    var goldBright = "#f0d48a";
    var cream = "#f6efe2";
    var muted = "#a99f93";
    var danger = "#e6786b";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Marco dorado exterior.
    ctx.strokeStyle = cardBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, width - 48, height - 48);

    var centerX = width / 2;
    var y = 100;

    // Marca V.
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, y, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = goldBright;
    ctx.font = "600 34px Georgia, 'Cormorant Garamond', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("V", centerX, y + 2);

    y += 80;
    ctx.fillStyle = gold;
    ctx.font = "700 22px Arial, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("INSTITUTO DE BELLEZA VENEZIA", centerX, y);

    y += 56;
    ctx.fillStyle = goldBright;
    ctx.font = "600 30px Arial, sans-serif";
    ctx.fillText("PASE · BECA VENEZIA", centerX, y);

    if (validityLines.length) {
      y += 44;
      var pillPaddingX = 24;
      var pillLineHeight = 26;
      var pillHeight = validityLines.length * pillLineHeight + 18;
      var pillWidth = 0;
      ctx.font = "700 21px Arial, sans-serif";
      validityLines.forEach(function (line) {
        pillWidth = Math.max(pillWidth, ctx.measureText(line).width);
      });
      pillWidth += pillPaddingX * 2;
      var pillX = centerX - pillWidth / 2;
      var pillY = y - pillLineHeight;
      var pillColor = data.validity && data.validity.expired ? danger : gold;
      ctx.strokeStyle = pillColor;
      ctx.fillStyle =
        data.validity && data.validity.expired ? "rgba(230, 120, 107, 0.12)" : "rgba(214, 178, 105, 0.12)";
      ctx.lineWidth = 1.5;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(pillX, pillY, pillWidth, pillHeight);
        ctx.strokeRect(pillX, pillY, pillWidth, pillHeight);
      }
      ctx.fillStyle = pillColor;
      validityLines.forEach(function (line, index) {
        ctx.fillText(line, centerX, y + index * pillLineHeight);
      });
      y += (validityLines.length - 1) * pillLineHeight + 26;
    }

    y += 70;
    ctx.fillStyle = cream;
    ctx.font = "700 54px Georgia, 'Cormorant Garamond', serif";
    ctx.fillText("¡Felicidades, " + (data.nombre || "—") + "!", centerX, y);

    // Tarjeta interior con los datos.
    var cardX = 80;
    var cardW = width - 160;
    ctx.fillStyle = card;
    ctx.strokeStyle = cardBorder;
    ctx.lineWidth = 1.5;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 18);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeRect(cardX, cardY, cardW, cardH);
    }

    var rowY = cardY + 60;
    var rows = [
      ["CURSO", data.curso],
      ["ASESORA QUE TE ATENDIÓ", data.asesora],
      ["FECHA DE SOLICITUD", data.fecha],
    ];
    rows.forEach(function (row) {
      ctx.textAlign = "left";
      ctx.fillStyle = muted;
      ctx.font = "700 20px Arial, sans-serif";
      ctx.fillText(row[0], cardX + 40, rowY);
      ctx.fillStyle = cream;
      ctx.font = "600 30px Arial, sans-serif";
      ctx.fillText(String(row[1] || "—"), cardX + 40, rowY + 38);
      rowY += 92;
    });

    // Linea separadora.
    ctx.strokeStyle = cardBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 40, rowY - 10);
    ctx.lineTo(cardX + cardW - 40, rowY - 10);
    ctx.stroke();

    var amounts = [
      ["INSCRIPCIÓN CON BECA", data.inscripcion],
      ["MENSUALIDAD CON BECA", data.mensualidad],
      ["APOYO DE MATERIAL", data.material],
    ];
    var amountY = rowY + 36;
    amounts.forEach(function (row) {
      ctx.textAlign = "left";
      ctx.fillStyle = muted;
      ctx.font = "700 20px Arial, sans-serif";
      ctx.fillText(row[0], cardX + 40, amountY);
      ctx.textAlign = "right";
      ctx.fillStyle = goldBright;
      ctx.font = "700 32px Arial, sans-serif";
      ctx.fillText(String(row[1] || "—"), cardX + cardW - 40, amountY + 2);
      amountY += 56;
    });

    // Nota al pie, con salto de linea automatico (footerLines ya se calculó
    // arriba, al medir la altura total del canvas).
    ctx.textAlign = "center";
    ctx.fillStyle = muted;
    ctx.font = "400 22px Arial, sans-serif";
    var drawFooterY = footerY;
    footerLines.forEach(function (line) {
      ctx.fillText(line, centerX, drawFooterY);
      drawFooterY += 32;
    });

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
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(finish).catch(finish);
      } else {
        finish();
      }
    });
  }

  show(loadingState);
  init();
})();

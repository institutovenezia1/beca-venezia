// Construye el registro que se inserta en la tabla "prospects" de Supabase,
// replicando EXACTAMENTE el mapeo de columnas que usa Venezia One
// (dataService.js -> prospects.toDb) para que esta solicitud de beca
// aparezca correcta en el CRM que ya usan las asesoras, sin romper nada.
//
// Columnas reales de la tabla "prospects":
// id, full_name, phone, contact_date, branch_interest, course_interest,
// origin, contact_channel, info_status, prospect_status, notes,
// access_interest, enrolled_by, appointment_time, suggested_time,
// request_type, created_at
//
// Los campos propios de la beca que no tienen columna (ocupación, edad,
// dependientes económicos, quién compartió el link, el timestamp de
// registro para el recordatorio de 10 min, y si ya se envió la
// confirmación de WhatsApp) se codifican dentro de "notes" como líneas
// "Etiqueta: valor" separadas por " | ", igual que ya hace Venezia One con
// "Asesora asignada"/"Temperatura"/"Próximo seguimiento".
(function (globalScope) {
  const ACTIVE_BRANCH = "Tlaxcala";

  // Mismos nombres EXACTOS que ya usa el <select id="asesoraAsignada"> del
  // CRM en Venezia One (index.html), para que el dato coincida tal cual con
  // lo que ya existe en el sistema.
  const ASESORES = {
    "ceo-ismael": "Ismael Capir | CEO",
    mariflores: "Mari Flores | Coordinadora del IBV",
    monse: "Monserrat Hernandez | Asesora",
  };

  function normalizePhone(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function createId() {
    if (globalScope.crypto && typeof globalScope.crypto.randomUUID === "function") {
      try {
        return globalScope.crypto.randomUUID();
      } catch (error) {
        console.warn("[Beca Venezia] crypto.randomUUID no disponible, usando fallback.", error);
      }
    }
    return "beca-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function resolveAsesorFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const slug = String(params.get("asesor") || "").trim().toLowerCase();
      if (!slug) {
        return "";
      }
      return ASESORES[slug] || "";
    } catch (error) {
      return "";
    }
  }

  // El valor del asesor viene como "Nombre | Rol" (mismo formato que usa
  // Venezia One para "Asesora asignada"), pero " | " es también el separador
  // que usamos entre líneas de "notes". Si se guardara tal cual, el propio
  // " | " interno partiría la línea a la mitad y se perdería el rol al
  // leerlo de vuelta. Por eso se codifica ese " | " interno como " :: " antes
  // de guardar (mismo truco que encodeProspectAdvisorValue en Venezia One) y
  // se revierte al leerlo con decodeAdvisorValue.
  function encodeAdvisorValue(value) {
    return String(value || "").split(" | ").join(" :: ");
  }

  function buildNotes(fields) {
    const now = new Date().toISOString();
    const segments = [
      "Aplicación de Beca Venezia (formulario en línea).",
      fields.ocupacion ? `Ocupación: ${fields.ocupacion}` : "",
      fields.edad ? `Edad: ${fields.edad}` : "",
      fields.dependientes ? `Personas que dependen económicamente: ${fields.dependientes}` : "",
      fields.asesorReferente ? `Registrada vía link de: ${encodeAdvisorValue(fields.asesorReferente)}` : "",
      `Registro beca: ${now}`,
      "Confirmación beca enviada: no",
    ];
    return segments.filter(Boolean).join(" | ");
  }

  function buildProspectRow(fields) {
    const today = formatDateForInput(new Date());
    const id = createId();
    const createdAt = new Date().toISOString();

    return {
      row: {
        id,
        full_name: String(fields.nombre || "").trim(),
        phone: normalizePhone(fields.whatsapp),
        contact_date: today,
        branch_interest: ACTIVE_BRANCH,
        course_interest: String(fields.curso || "").trim(),
        origin: "Beca Venezia — Aplicación en línea",
        contact_channel: "WhatsApp",
        info_status: "Aplicación de beca recibida",
        prospect_status: "Prospecto nuevo",
        notes: buildNotes(fields),
        access_interest: "Beca Venezia",
        enrolled_by: "",
        appointment_time: "",
        suggested_time: "",
        request_type: "Aplicación de Beca",
        created_at: createdAt,
      },
      id,
    };
  }

  // Lee una línea "Etiqueta: valor" dentro de "notes" (mismo formato que usa
  // extractProspectMetadata en Venezia One). Devuelve "" si no existe.
  function extractMetadata(notes, label) {
    var source = String(notes || "");
    var segments = source.split(" | ");
    var prefix = label + ": ";
    for (var i = 0; i < segments.length; i += 1) {
      if (segments[i].indexOf(prefix) === 0) {
        return segments[i].slice(prefix.length).trim();
      }
    }
    return "";
  }

  function decodeAdvisorValue(value) {
    return String(value || "")
      .split(" :: ")
      .join(" | ");
  }

  globalScope.BecaVeneziaProspect = {
    ACTIVE_BRANCH,
    ASESORES,
    resolveAsesorFromUrl,
    buildProspectRow,
    normalizePhone,
    extractMetadata,
    decodeAdvisorValue,
  };
})(window);

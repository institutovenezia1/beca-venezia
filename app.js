(function () {
  "use strict";

  var form = document.getElementById("becaForm");
  var card = document.querySelector(".card");
  var allSteps = Array.prototype.slice.call(document.querySelectorAll(".step"));
  var formSteps = Array.prototype.slice.call(document.querySelectorAll(".step[data-step]")).filter(
    function (el) {
      return /^\d+$/.test(el.getAttribute("data-step"));
    }
  );
  var indicatorDots = Array.prototype.slice.call(document.querySelectorAll("#stepsIndicator span"));
  var submitBtn = document.getElementById("submitBtn");

  var currentStep = 1;
  var lastProspectId = null;

  function showStep(stepKey) {
    allSteps.forEach(function (el) {
      el.classList.toggle("is-active", el.getAttribute("data-step") === String(stepKey));
    });
  }

  function updateIndicator(stepNumber) {
    indicatorDots.forEach(function (dot) {
      var dotStep = parseInt(dot.getAttribute("data-step"), 10);
      dot.classList.toggle("is-active", dotStep === stepNumber);
      dot.classList.toggle("is-done", dotStep < stepNumber);
    });
  }

  function setError(stepNumber, message) {
    var el = document.getElementById("errorStep" + stepNumber);
    if (el) {
      el.textContent = message || "";
    }
  }

  function goToStep(stepNumber) {
    currentStep = stepNumber;
    showStep(stepNumber);
    updateIndicator(stepNumber);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function validateStep(stepNumber) {
    setError(stepNumber, "");

    if (stepNumber === 1) {
      var cursoChecked = form.querySelector('input[name="curso"]:checked');
      if (!cursoChecked) {
        setError(1, "Elige un curso para continuar.");
        return false;
      }
      return true;
    }

    if (stepNumber === 2) {
      var nombre = form.nombre.value.trim();
      var edad = form.edad.value.trim();
      if (nombre.length < 3) {
        setError(2, "Escribe tu nombre completo.");
        return false;
      }
      var edadNum = parseInt(edad, 10);
      if (!edadNum || edadNum < 15 || edadNum > 99) {
        setError(2, "Escribe una edad válida (15 años en adelante).");
        return false;
      }
      return true;
    }

    if (stepNumber === 3) {
      var asesorAtendio = form.asesorAtendio.value.trim();
      if (!asesorAtendio) {
        setError(3, "Selecciona una opción sobre quién te atendió.");
        return false;
      }
      var apoyoGobiernoChecked = form.querySelector('input[name="apoyoGobierno"]:checked');
      if (!apoyoGobiernoChecked) {
        setError(3, "Indica si recibes apoyo del gobierno.");
        return false;
      }
      var ocupacion = form.ocupacion.value.trim();
      var dependientes = form.dependientes.value.trim();
      if (ocupacion.length < 2) {
        setError(3, "Cuéntanos a qué te dedicas.");
        return false;
      }
      if (dependientes === "" || parseInt(dependientes, 10) < 0) {
        setError(3, "Escribe cuántas personas dependen de ti (puede ser 0).");
        return false;
      }
      return true;
    }

    if (stepNumber === 4) {
      var whatsapp = form.whatsapp.value.replace(/\D/g, "");
      if (whatsapp.length < 10) {
        setError(4, "Escribe un número de WhatsApp válido a 10 dígitos.");
        return false;
      }
      return true;
    }

    return true;
  }

  document.querySelectorAll("[data-next]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!validateStep(currentStep)) {
        return;
      }
      goToStep(currentStep + 1);
    });
  });

  document.querySelectorAll("[data-prev]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      goToStep(currentStep - 1);
    });
  });

  document.querySelectorAll("[data-retry]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      goToStep(formSteps.length);
    });
  });

  function collectFields() {
    var cursoChecked = form.querySelector('input[name="curso"]:checked');
    var apoyoGobiernoChecked = form.querySelector('input[name="apoyoGobierno"]:checked');
    return {
      curso: cursoChecked ? cursoChecked.value : "",
      nombre: form.nombre.value.trim(),
      edad: form.edad.value.trim(),
      asesorAtendio: form.asesorAtendio.value.trim(),
      apoyoGobierno: apoyoGobiernoChecked ? apoyoGobiernoChecked.value : "",
      ocupacion: form.ocupacion.value.trim(),
      dependientes: form.dependientes.value.trim(),
      whatsapp: form.whatsapp.value.trim(),
      asesorReferente: window.BecaVeneziaProspect.resolveAsesorFromUrl(),
    };
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!validateStep(4)) {
      return;
    }

    var allValid = [1, 2, 3, 4].every(validateStep);
    if (!allValid) {
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando...";

    var fields = collectFields();
    var built = window.BecaVeneziaProspect.buildProspectRow(fields);
    var client = window.BecaVeneziaSupabase ? window.BecaVeneziaSupabase.client : null;

    if (!client) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Enviar mi solicitud";
      document.getElementById("submitErrorText").textContent =
        "No se pudo conectar con el servidor. Por favor intenta de nuevo o escríbenos por WhatsApp.";
      goToStep("error");
      return;
    }

    client
      .from("prospects")
      .upsert([built.row], { onConflict: "id" })
      .select()
      .then(function (result) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar mi solicitud";
        if (result.error) {
          console.error("[Beca Venezia] Error al guardar solicitud", result.error);
          document.getElementById("submitErrorText").textContent =
            "No se pudo guardar tu solicitud en este momento. Por favor intenta de nuevo o escríbenos por WhatsApp.";
          goToStep("error");
          return;
        }
        lastProspectId = built.id;
        try {
          window.localStorage.setItem("becaVeneziaLastSolicitud", built.id);
        } catch (storageError) {
          // Si el navegador bloquea localStorage, no es crítico: seguimos sin guardar.
        }
        goToStep("evaluating");
      })
      .catch(function (error) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar mi solicitud";
        console.error("[Beca Venezia] Error inesperado al guardar solicitud", error);
        document.getElementById("submitErrorText").textContent =
          "No se pudo guardar tu solicitud en este momento. Por favor intenta de nuevo o escríbenos por WhatsApp.";
        goToStep("error");
      });
  });

  goToStep(1);
})();

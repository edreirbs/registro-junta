(function () {
  "use strict";
  var C = window.CONFIG || {};
  var TZ = "America/New_York";
  var $ = function (id) { return document.getElementById(id); };
  var reducir = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Supabase (fetch, sin librerías; la llave publishable no lleva Authorization) ----------
  function encabezados(extra) {
    var h = { apikey: C.SUPABASE_KEY, "Content-Type": "application/json" };
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  function rpc(nombre) {
    return fetch(C.SUPABASE_URL + "/rest/v1/rpc/" + nombre, { method: "POST", headers: encabezados(), body: "{}" })
      .then(function (r) { if (!r.ok) throw new Error(nombre + " " + r.status); return r.json(); });
  }

  // ---------- Fechas en la zona de Nueva York ----------
  function partesNY(d) {
    var o = {};
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric" })
      .formatToParts(d).forEach(function (p) { o[p.type] = +p.value; });
    return o;
  }
  function nyAUtc(y, m, d, h) {
    var t = Date.UTC(y, m - 1, d, h);
    for (var i = 0; i < 3; i++) {
      var p = partesNY(new Date(t));
      t -= Date.UTC(p.year, p.month - 1, p.day, p.hour) - Date.UTC(y, m - 1, d, h);
    }
    return new Date(t);
  }
  // Respaldo si la base no responde: primer jueves a 28 días o más de hoy, 10:00 h de Nueva York.
  function juntaRespaldo() {
    var p = partesNY(new Date());
    var base = new Date(Date.UTC(p.year, p.month - 1, p.day + 28));
    base.setUTCDate(base.getUTCDate() + (4 - base.getUTCDay() + 7) % 7);
    var fecha = nyAUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), 10);
    var vispera = new Date(base.getTime() - 864e5);
    return { fecha: fecha, cierre: nyAUtc(vispera.getUTCFullYear(), vispera.getUTCMonth() + 1, vispera.getUTCDate(), 18) };
  }
  function fmtPartes(d) {
    var dia = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
    var hora = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
    return { dia: dia.charAt(0).toUpperCase() + dia.slice(1), hora: hora + "\u00a0h" };
  }

  var junta = null;       // { fecha: Date, cierre: Date }
  var cierreAbierto = true;

  function pintarJunta() {
    var f = fmtPartes(junta.fecha);
    var cierre = fmtPartes(junta.cierre);
    var el = $("fecha-junta");
    el.textContent = "";
    var s = document.createElement("strong");
    s.textContent = f.dia;
    el.appendChild(s);
    el.appendChild(document.createTextNode(f.hora + ", hora de Nueva York"));
    $("cierre-junta").textContent = "El registro cierra el " + cierre.dia.toLowerCase() + " a las " + cierre.hora + ".";
    $("aviso-cierre").textContent = "El registro cierra el " + cierre.dia.toLowerCase() + " a las " + cierre.hora + ", hora de Nueva York.";
    $("faq-fecha").textContent = "Es el " + f.dia.toLowerCase() + " a las " + f.hora + ", hora de Nueva York.";
    $("faq-cierre").textContent = "Hasta el " + cierre.dia.toLowerCase() + " a las " + cierre.hora + ", hora de Nueva York.";
    actualizarTextos();
  }

  function cuentaRegresiva() {
    if (!junta) return;
    var ms = junta.fecha - Date.now();
    var v = ms > 0 ? ms : 0;
    var s = Math.floor(v / 1000);
    var vals = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
    ["c-d", "c-h", "c-m", "c-s"].forEach(function (id, i) {
      $(id).textContent = i === 0 ? String(vals[i]) : String(vals[i]).padStart(2, "0");
    });
    var abierto = Date.now() < junta.cierre;
    if (abierto !== cierreAbierto) { cierreAbierto = abierto; bloquearSiCerro(); }
  }
  function bloquearSiCerro() {
    var cerro = !cierreAbierto;
    $("enviar").disabled = cerro;
    if (cerro) $("e-general").textContent = "El registro ya cerró.";
  }

  function cargarJunta() {
    return rpc("datos_junta").then(function (r) {
      var f = new Date(r.fecha), c = new Date(r.cierre_registro);
      if (isNaN(f) || isNaN(c)) throw new Error("fecha");
      junta = { fecha: f, cierre: c };
    }).catch(function () {
      junta = juntaRespaldo();
    }).then(function () { pintarJunta(); cuentaRegresiva(); bloquearSiCerro(); });
  }

  // ---------- Contador de accionistas ----------
  var total = null;
  function pintarTotal(n) {
    total = n;
    var el = $("contador-n");
    el.textContent = n.toLocaleString("es-MX");
    $("contador-texto").lastChild.textContent = n === 1 ? " accionista registrado" : " accionistas registrados";
  }
  function cargarContador() {
    return rpc("contar_asistentes").then(function (n) {
      n = Number(n);
      if (isFinite(n)) pintarTotal(n);
    }).catch(function () { if (total === null) $("contador-n").textContent = "varios"; });
  }

  // ---------- Modalidad ----------
  var MOD = {
    "En persona": {
      img: "img/credencial-persona.webp",
      alt: "Credencial de accionista, modalidad En persona, de la junta anual de Waystar RoyCo",
      texto: "Asiste en el auditorio de Waystar RoyCo, en Nueva York. Se entra con la credencial que le llega por correo."
    },
    "En línea": {
      img: "img/credencial-linea.webp",
      alt: "Credencial de accionista, modalidad En línea, de la junta anual de Waystar RoyCo",
      texto: "Asiste por la transmisión en vivo. Su liga personal le llega por correo un día antes de la junta."
    }
  };
  var modalidad = "En persona";
  function actualizarTextos() {
    $("explica").textContent = MOD[modalidad].texto;
  }
  function elegir(m, desdeForma) {
    modalidad = m;
    var img = $("img-credencial");
    if (img.getAttribute("src") !== MOD[m].img) {
      img.style.opacity = "0";
      setTimeout(function () {
        img.src = MOD[m].img; img.alt = MOD[m].alt; img.style.opacity = "1";
      }, reducir ? 0 : 160);
    }
    img.style.transition = reducir ? "none" : "opacity .16s";
    document.querySelectorAll(".sel").forEach(function (b) {
      var on = b.getAttribute("data-mod") === m;
      b.classList.toggle("activo", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll('input[name="modalidad"]').forEach(function (r) { r.checked = r.value === m; });
    actualizarTextos();
  }
  document.querySelectorAll(".sel").forEach(function (b) {
    b.addEventListener("click", function () { elegir(b.getAttribute("data-mod")); });
  });
  document.querySelectorAll('input[name="modalidad"]').forEach(function (r) {
    r.addEventListener("change", function () { if (r.checked) elegir(r.value, true); });
  });

  // ---------- Credencial 3D ----------
  (function () {
    if (reducir) return;
    var cred = $("credencial"), escena = $("escena");
    function inclinar(nx, ny) { // -1..1
      cred.style.transform = "rotateY(" + (nx * 14).toFixed(2) + "deg) rotateX(" + (-ny * 11).toFixed(2) + "deg)";
      cred.style.setProperty("--bx", ((nx + 1) * 50).toFixed(1) + "%");
      cred.style.setProperty("--by", ((ny + 1) * 50).toFixed(1) + "%");
    }
    function reposo() { cred.classList.remove("mueve"); cred.style.transform = ""; }
    escena.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var r = escena.getBoundingClientRect();
      cred.classList.add("mueve");
      inclinar(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)),
               Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)));
    });
    escena.addEventListener("pointerleave", reposo);

    var activo = false;
    function alMover(e) {
      if (e.gamma == null || e.beta == null) return;
      cred.classList.add("mueve");
      inclinar(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
    }
    function activarMovimiento() {
      if (activo) return; activo = true;
      window.addEventListener("deviceorientation", alMover);
    }
    var tactil = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    if (!tactil || typeof DeviceOrientationEvent === "undefined") return;
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      // iPhone: el permiso se pide en el primer toque.
      var pedir = function () {
        document.removeEventListener("pointerdown", pedir, true);
        DeviceOrientationEvent.requestPermission().then(function (r) {
          if (r === "granted") activarMovimiento();
        }).catch(function () {});
      };
      document.addEventListener("pointerdown", pedir, true);
    } else {
      activarMovimiento();
    }
    $("pista").hidden = false;
  })();

  // ---------- Registro ----------
  var pregunta = $("pregunta");
  pregunta.addEventListener("input", function () {
    var n = pregunta.value.length;
    $("car-n").textContent = n;
    $("car-n").parentNode.classList.toggle("limite", n >= 280);
  });

  function marcar(campo, idError, msg) {
    $(campo).classList.toggle("invalido", !!msg);
    $(idError).textContent = msg || "";
    return !msg;
  }
  var RE_CORREO = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

  function festejar() {
    if (reducir) return;
    var cont = $("festejo");
    cont.textContent = "";
    for (var i = 0; i < 36; i++) {
      var p = document.createElement("i");
      p.style.left = (Math.random() * 100) + "%";
      p.style.setProperty("--x", ((Math.random() - .5) * 120) + "px");
      p.style.setProperty("--r", ((Math.random() - .5) * 900) + "deg");
      p.style.setProperty("--t", (2.4 + Math.random() * 1.6) + "s");
      p.style.setProperty("--d", (Math.random() * .5) + "s");
      cont.appendChild(p);
    }
    setTimeout(function () { cont.textContent = ""; }, 4600);
  }

  $("forma").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!cierreAbierto) return;
    var nombre = $("nombre").value.trim();
    var correo = $("correo").value.trim();
    var preg = pregunta.value.trim();
    $("e-general").textContent = "";
    var ok = marcar("nombre", "e-nombre", nombre.length >= 2 && nombre.length <= 80 ? "" : "Escriba su nombre completo.");
    ok = marcar("correo", "e-correo", RE_CORREO.test(correo) && correo.length <= 120 ? "" : "Escriba un correo válido.") && ok;
    if (!ok) { (document.querySelector(".invalido") || {focus: function () {}}).focus(); return; }

    var btn = $("enviar");
    btn.disabled = true; btn.textContent = "Registrando…";
    var cuerpo = { nombre: nombre, correo: correo, modalidad: modalidad };
    if (preg) cuerpo.pregunta = preg.slice(0, 280);

    fetch(C.SUPABASE_URL + "/rest/v1/asistentes", {
      method: "POST",
      headers: encabezados({ Prefer: "return=minimal" }),
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      if (r.ok) return exito(nombre);
      return r.json().catch(function () { return {}; }).then(function (e) {
        if (r.status === 409 || (e && e.code === "23505")) {
          marcar("correo", "e-correo", "Ya está registrado con ese correo.");
          $("correo").focus();
        } else {
          $("e-general").textContent = "No pudimos completar su registro. Inténtelo de nuevo en un momento.";
        }
        btn.disabled = !cierreAbierto; btn.textContent = "Registrarme";
      });
    }).catch(function () {
      $("e-general").textContent = "No hay conexión. Revise su internet e inténtelo de nuevo.";
      btn.disabled = false; btn.textContent = "Registrarme";
    });
  });

  function exito(nombre) {
    $("forma").hidden = true;
    $("aviso-cierre").hidden = true;
    $("exito-nombre").textContent = nombre;   // textContent: el texto de la persona nunca se interpreta como HTML
    var ex = $("exito"); ex.hidden = false; ex.focus({ preventScroll: true });
    ex.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "center" });
    if (total !== null) pintarTotal(total + 1);
    festejar();
    setTimeout(cargarContador, 1200);
  }

  // ---------- Arranque ----------
  elegir("En persona");
  cargarJunta();
  cargarContador();
  setInterval(cuentaRegresiva, 1000);
  setInterval(cargarContador, 15000);
})();

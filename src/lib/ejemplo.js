/**
 * Funciones de ejemplo (puras) para la API académica AUY1104.
 * Separar lógica de rutas facilita probar con Jest sin levantar HTTP.
 */

const VERSION = process.env.APP_VERSION || 'dev';

function normalizarNombre(nombre) {
  const n = typeof nombre === 'string' && nombre.trim() ? nombre.trim() : 'estudiante';
  return n;
}

function construirSaludo(nombre) {
  const n = normalizarNombre(nombre);
  return {
    metodo: 'GET',
    ruta: '/api/saludo',
    mensaje: `Hola, ${n}. Esta es una respuesta JSON de ejemplo.`,
  };
}

function construirEchoRespuesta(cuerpo) {
  const recibido =
    cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : {};
  return {
    metodo: 'POST',
    ruta: '/api/echo',
    recibido,
    nota: 'El servidor devuelve lo que enviaste en el cuerpo (útil para practicar POST + JSON).',
  };
}

function healthPayload() {
  return {
    ok: true,
    servicio: 'auy1104-api-ejemplo',
    // Expone la versión del build (APP_VERSION, seteada en el Dockerfile).
    // Útil para demostrar en vivo qué pods responden con la versión canary
    // y cuáles con la estable durante la defensa.
    version: VERSION,
    mensaje: `El servicio está en ejecución (${VERSION})`,
  };
}

function sumar(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('sumar: se esperaban números finitos');
  }
  return x + y;
}

function respuestaSumaGet(a, b) {
  const resultado = sumar(a, b);
  return {
    metodo: 'GET',
    ruta: '/api/suma',
    a: Number(a),
    b: Number(b),
    resultado,
  };
}

function respuestaSumaPost(a, b) {
  const resultado = sumar(a, b);
  return {
    metodo: 'POST',
    ruta: '/api/suma',
    a: Number(a),
    b: Number(b),
    resultado,
  };
}

module.exports = {
  normalizarNombre,
  construirSaludo,
  construirEchoRespuesta,
  healthPayload,
  sumar,
  respuestaSumaGet,
  respuestaSumaPost,
};

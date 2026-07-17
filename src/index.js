const express = require('express');
const {
  construirSaludo,
  construirEchoRespuesta,
  healthPayload,
  respuestaSumaGet,
  respuestaSumaPost,
} = require('./lib/ejemplo');

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json(healthPayload());
  });

  app.get('/api/saludo', (req, res) => {
    res.json(construirSaludo(req.query.nombre));
  });

  app.post('/api/echo', (req, res) => {
    res.status(201).json(construirEchoRespuesta(req.body));
  });

  app.get('/api/suma', (req, res) => {
    try {
      res.json(respuestaSumaGet(req.query.a, req.query.b));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/suma', (req, res) => {
    const cuerpo = req.body || {};
    try {
      res.status(201).json(respuestaSumaPost(cuerpo.a, cuerpo.b));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  return app;
}

// Solo levanta el servidor HTTP si el archivo se ejecuta directamente
// (node src/index.js). Al importarlo desde los tests (createApp()),
// no escucha en ningún puerto — así Supertest puede probarlo en memoria.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  createApp().listen(PORT, () => {
    console.log(`API escuchando en http://0.0.0.0:${PORT}`);
  });
}

module.exports = { createApp };

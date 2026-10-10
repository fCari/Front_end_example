const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const project = require('node:path').resolve(__dirname, '..');
const fromProject = createRequire(project + '/package.json');
const ts = fromProject('typescript');
const source = fs.readFileSync(project + '/src/api.ts', 'utf8');
let count = 0;

function adapter(mode, base = 'https://api.example.test', fetchImpl, protocol = 'https:') {
  const code = source.replaceAll('import.meta.env.VITE_DATA_SOURCE', JSON.stringify(mode))
    .replaceAll('import.meta.env.VITE_API_BASE_URL', JSON.stringify(base));
  const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  const memory = new Map();
  const context = {
    exports, AbortController, performance, URL,
    window: { location: { protocol }, setTimeout, clearTimeout },
    localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
    fetch: fetchImpl || (() => { throw new Error('A demo request must not hit the network'); }),
  };
  vm.runInNewContext(result.outputText, context);
  return exports;
}
async function test(name, operation) { await operation(); count++; console.log('PASS ' + name); }

(async () => {
  await test('Demostración sin tráfico HTTP; registro y lectura posterior', async () => {
    const api = adapter('demo');
    assert.equal((await api.getUsers()).data.length, 12);
    const result = await api.createUser({ name: 'Persona de prueba', email: 'prueba@example.test' });
    assert.equal(result.data.id, 13);
    assert.equal((await api.getUsers()).data.length, 13);
    await assert.rejects(api.createUser({ name: 'Duplicado', email: 'PRUEBA@example.test' }), error => error.status === 409);
  });
  await test('GET /users preserva el prefijo de la URL y lee X-Cache', async () => {
    const api = adapter('api', 'https://api.example.test/api/', async (url, options) => {
      assert.equal(url, 'https://api.example.test/api/users');
      assert.equal(options.headers.Accept, 'application/json');
      return new Response(JSON.stringify([{ id: 1, name: 'Ana', email: 'ana@example.test' }]), { headers: { 'X-Cache': 'HIT' } });
    });
    const result = await api.getUsers();
    assert.equal(result.data[0].name, 'Ana');
    assert.equal(result.info.cache, 'HIT');
  });
  await test('POST envía un objeto JSON y acepta HTTP 201', async () => {
    const api = adapter('api', 'https://api.example.test', async (url, options) => {
      assert.equal(url, 'https://api.example.test/users');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(options.body), { name: 'Ana', email: 'ana@example.test' });
      return new Response(JSON.stringify({ id: 3, name: 'Ana', email: 'ana@example.test' }), { status: 201 });
    });
    assert.equal((await api.createUser({ name: 'Ana', email: 'ana@example.test' })).data.id, 3);
  });
  await test('HTTP 409 se muestra como correo duplicado', async () => {
    const api = adapter('api', undefined, async () => new Response('{"detail":"Email exists"}', { status: 409 }));
    await assert.rejects(api.createUser({ name: 'Ana', email: 'ana@example.test' }), /correo ya está registrado/);
  });
  await test('HTTP 422 se muestra como datos rechazados', async () => {
    const api = adapter('api', undefined, async () => new Response('{"detail":[{"msg":"invalid"}]}', { status: 422 }));
    await assert.rejects(api.createUser({ name: 'Ana', email: 'ana@example.test' }), /rechazó los datos/);
  });
  await test('Fallo HTTP o de red nunca sustituye la API por usuarios demo', async () => {
    const api = adapter('api', undefined, async () => { throw new TypeError('Failed to fetch'); });
    await assert.rejects(api.getUsers(), /No se pudo conectar/);
    await assert.rejects(api.createUser({ name: 'Ana', email: 'ana@example.test' }), /Actualiza el listado antes de repetirlo/);
  });
  await test('Una respuesta que incumple el contrato se rechaza', async () => {
    const api = adapter('api', undefined, async () => new Response('{"users":[]}'));
    await assert.rejects(api.getUsers(), /debe devolver una lista/);
    await assert.rejects(api.createUser({ name: 'Ana', email: 'ana@example.test' }), /Actualiza el listado antes de repetirla/);
  });
  await test('Página HTTPS no intenta llamar a una API HTTP', async () => {
    const api = adapter('api', 'http://api.example.test', () => { throw new Error('Must not fetch'); });
    await assert.rejects(api.getUsers(), /configura también una URL HTTPS/);
  });
  await test('Modo API sin URL muestra un error de configuración', async () => {
    const api = adapter('api', '', () => { throw new Error('Must not fetch'); });
    await assert.rejects(api.getUsers(), /Falta configurar/);
  });
  await test('Health consulta el endpoint correcto y conserva el cuerpo JSON', async () => {
    const api = adapter('api', undefined, async url => {
      assert.equal(url, 'https://api.example.test/health');
      return new Response('{"status":"ok","database":"ok"}');
    });
    assert.equal((await api.checkHealth()).data.database, 'ok');
  });
  console.log(`${count} verificaciones del adaptador HTTP completadas.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

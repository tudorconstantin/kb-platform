import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { conf } from "../config.js";
import { extractUser } from "../middleware/auth.js";
import { checkAccess, listPublicVaults, listUserVaults } from "../services/vaults.js";

/**
 * Serve Quartz static builds with auth gating.
 * 
 * Quartz outputs to: data/builds/{username}/{vault}/
 * We serve these as static files under /{username}/{vault}/
 * with access control checks.
 */
export async function webRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", extractUser);

  // Landing page
  app.get("/", async (req, reply) => {
    const publicVaults = listPublicVaults();
    const ownVaults = req.user
      ? listUserVaults(req.user.username, req.user.id)
      : [];

    reply.type("text/html");
    return landingHtml(publicVaults, ownVaults, req.user);
  });

  // Catch-all: serve Quartz static files for /{username}/{vault}/**
  app.get<{ Params: { username: string; vault: string; "*": string } }>(
    "/:username/:vault/*",
    async (req, reply) => {
      const { username, vault } = req.params;
      const rest = req.params["*"] || "index.html";

      // Access check
      const access = checkAccess(username, vault, req.user);
      if (access === "denied") {
        if (!req.user) {
          return reply.redirect(`/login?next=/${username}/${vault}/${rest}`);
        }
        return reply.code(403).send("Access denied");
      }

      // Resolve to Quartz build output
      const buildDir = resolve(conf.buildsDir, username, vault);
      let filePath = resolve(buildDir, rest);

      // Prevent path traversal
      if (!filePath.startsWith(buildDir)) {
        return reply.code(400).send("Invalid path");
      }

      // Try exact file, then index.html in dir, then .html suffix
      if (!existsSync(filePath)) {
        if (existsSync(`${filePath}/index.html`)) {
          filePath = `${filePath}/index.html`;
        } else if (existsSync(`${filePath}.html`)) {
          filePath = `${filePath}.html`;
        } else {
          return reply.code(404).send("Not found");
        }
      }

      const ext = filePath.split(".").pop() || "";
      const mimeTypes: Record<string, string> = {
        html: "text/html",
        css: "text/css",
        js: "application/javascript",
        json: "application/json",
        svg: "image/svg+xml",
        png: "image/png",
        jpg: "image/jpeg",
        woff2: "font/woff2",
        woff: "font/woff",
        xml: "application/xml",
      };

      reply.type(mimeTypes[ext] || "application/octet-stream");
      return readFileSync(filePath);
    }
  );

  // Vault root (no trailing content)
  app.get<{ Params: { username: string; vault: string } }>(
    "/:username/:vault",
    async (req, reply) => {
      const { username, vault } = req.params;
      const access = checkAccess(username, vault, req.user);
      if (access === "denied") {
        if (!req.user) return reply.redirect(`/login?next=/${username}/${vault}`);
        return reply.code(403).send("Access denied");
      }

      const indexPath = resolve(conf.buildsDir, username, vault, "index.html");
      if (!existsSync(indexPath)) {
        return reply.code(404).send("Vault not built yet. Trigger a build first.");
      }
      reply.type("text/html");
      return readFileSync(indexPath);
    }
  );

  // Minimal login page
  app.get("/login", async (_req, reply) => {
    reply.type("text/html");
    return loginHtml();
  });

  // Minimal register page
  app.get("/register", async (_req, reply) => {
    reply.type("text/html");
    return registerHtml();
  });

  // Dashboard
  app.get("/dashboard", async (req, reply) => {
    if (!req.user) return reply.redirect("/login?next=/dashboard");
    const vaults = listUserVaults(req.user.username, req.user.id);
    reply.type("text/html");
    return dashboardHtml(req.user, vaults);
  });
}

// ── Inline HTML templates ──────────────────────────────────
// Kept minimal — Quartz handles the real rendering.

function shell(title: string, body: string, user?: any): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — kb.constantin.rocks</title>
<style>
:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--accent:#58a6ff;--surface:#161b22}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:var(--bg);color:var(--fg);line-height:1.6}
nav{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1.5rem;border-bottom:1px solid var(--border);background:var(--surface)}
nav a{color:var(--muted);text-decoration:none;font-size:.875rem;margin-left:1rem}
nav a:hover{color:var(--fg)}
.logo{font-family:monospace;font-size:1.25rem;font-weight:700;color:var(--fg);text-decoration:none}
.logo b{color:var(--accent)}
main{max-width:720px;margin:2rem auto;padding:0 1.5rem}
h1{font-size:1.75rem;margin-bottom:1rem}
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:.75rem}
.card a{color:var(--fg);text-decoration:none;font-weight:600}
.card a:hover{color:var(--accent)}
.card small{color:var(--muted);font-size:.8rem}
.btn{display:inline-block;padding:.4rem .9rem;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--fg);cursor:pointer;font-size:.85rem;text-decoration:none}
.btn-p{background:var(--accent);color:#0d1117;border-color:var(--accent)}
input,select{width:100%;padding:.45rem .65rem;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--fg);font-size:.875rem;margin-bottom:.75rem}
label{display:block;font-size:.8rem;color:var(--muted);margin-bottom:.25rem}
.badge{font-size:.65rem;padding:.1rem .4rem;border-radius:99px;text-transform:uppercase}
.badge-public{background:rgba(63,185,80,.15);color:#3fb950}
.badge-private{background:rgba(248,81,73,.15);color:#f85149}
.badge-unlisted{background:rgba(210,153,34,.15);color:#d29922}
#alert{display:none;padding:.6rem;border-radius:6px;margin-bottom:1rem;font-size:.85rem;background:rgba(248,81,73,.1);border:1px solid #f85149;color:#f85149}
</style></head><body>
<nav>
  <a href="/" class="logo">kb<b>.</b></a>
  <div>${user ? `<a href="/dashboard">dashboard</a><span style="color:var(--muted);font-size:.85rem;margin-left:1rem">${user.username}</span><a href="#" onclick="fetch('/auth/logout',{method:'POST'}).then(()=>location='/')">logout</a>` : `<a href="/login">login</a><a href="/register" class="btn btn-p" style="margin-left:.5rem">register</a>`}</div>
</nav>
<main>${body}</main>
<script>
async function api(url,method='GET',body=null){
  const o={method,headers:{'Content-Type':'application/json'}};
  if(body)o.body=JSON.stringify(body);
  const r=await fetch(url,o);
  if(!r.ok){const e=await r.json().catch(()=>({error:'Failed'}));throw new Error(e.error||e.detail||'Failed')}
  return r.json();
}
</script></body></html>`;
}

function landingHtml(publicVaults: any[], ownVaults: any[], user: any): string {
  let body = `<h1>kb<span style="color:var(--accent)">.</span></h1>
<p style="color:var(--muted);margin-bottom:2rem">Self-evolving knowledge bases. Write, connect, remember.</p>`;

  if (user && ownVaults.length) {
    body += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem"><h2 style="font-size:1.1rem">Your vaults</h2><a href="/dashboard" class="btn btn-p" style="font-size:.8rem">+ new vault</a></div>`;
    for (const v of ownVaults) {
      body += `<div class="card"><a href="/${v.username}/${v.slug}">${v.title}</a> <span class="badge badge-${v.visibility}">${v.visibility}</span><br><small>${v.username}/${v.slug}</small></div>`;
    }
  }

  if (publicVaults.length) {
    body += `<h2 style="font-size:1.1rem;margin:2rem 0 1rem">Public vaults</h2>`;
    for (const v of publicVaults) {
      body += `<div class="card"><a href="/${v.username}/${v.slug}">${v.title}</a><br><small>${v.username}/${v.slug} — ${v.description || ""}</small></div>`;
    }
  }

  if (!user) {
    body += `<div style="text-align:center;margin-top:3rem;padding:2rem;border:1px solid var(--border);border-radius:8px"><p style="color:var(--muted);margin-bottom:1rem">Create your own knowledge base.</p><a href="/register" class="btn btn-p">Get started</a></div>`;
  }
  return shell("Knowledge Base", body, user);
}

function loginHtml(): string {
  return shell("Login", `<h1>Login</h1>
<div id="alert"></div>
<form onsubmit="return doLogin(event)">
  <label>Username</label><input name="u" required>
  <label>Password</label><input name="p" type="password" required>
  <button class="btn btn-p" style="width:100%">Login</button>
</form>
<p style="text-align:center;margin-top:1rem;font-size:.85rem;color:var(--muted)">No account? <a href="/register" style="color:var(--accent)">Register</a></p>
<script>
async function doLogin(e){
  e.preventDefault();const f=e.target;
  try{await api('/auth/login','POST',{username:f.u.value,password:f.p.value});
  const n=new URLSearchParams(location.search).get('next');location=n||'/dashboard'}
  catch(err){const a=document.getElementById('alert');a.textContent=err.message;a.style.display='block'}
  return false}
</script>`);
}

function registerHtml(): string {
  return shell("Register", `<h1>Register</h1>
<div id="alert"></div>
<form onsubmit="return doReg(event)">
  <label>Username</label><input name="u" required pattern="[a-z0-9_-]+">
  <label>Email</label><input name="e" type="email" required>
  <label>Password</label><input name="p" type="password" required minlength="8">
  <button class="btn btn-p" style="width:100%">Create account</button>
</form>
<p style="text-align:center;margin-top:1rem;font-size:.85rem;color:var(--muted)">Have an account? <a href="/login" style="color:var(--accent)">Login</a></p>
<script>
async function doReg(e){
  e.preventDefault();const f=e.target;
  try{await api('/auth/register','POST',{username:f.u.value,email:f.e.value,password:f.p.value});
  await api('/auth/login','POST',{username:f.u.value,password:f.p.value});location='/dashboard'}
  catch(err){const a=document.getElementById('alert');a.textContent=err.message;a.style.display='block'}
  return false}
</script>`);
}

function dashboardHtml(user: any, vaults: any[]): string {
  let cards = "";
  for (const v of vaults) {
    cards += `<div class="card"><a href="/${user.username}/${v.slug}">${v.title}</a> <span class="badge badge-${v.visibility}">${v.visibility}</span><br><small>${user.username}/${v.slug}</small></div>`;
  }
  if (!vaults.length) {
    cards = `<div class="card" style="text-align:center;padding:2rem"><p style="color:var(--muted)">No vaults yet.</p></div>`;
  }

  return shell("Dashboard", `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
  <h1 style="font-size:1.4rem">Your vaults</h1>
  <button class="btn btn-p" onclick="document.getElementById('modal').style.display='flex'">+ New vault</button>
</div>
${cards}
<h2 style="font-size:1.1rem;margin:2rem 0 .75rem">API keys</h2>
<p style="color:var(--muted);font-size:.85rem;margin-bottom:.75rem">For LLM agents (Copilot CLI, Claude Code, etc.)</p>
<button class="btn" onclick="genKey()">Generate API key</button>
<pre id="keyOut" style="display:none;margin-top:.75rem;padding:.75rem;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-family:monospace;font-size:.8rem;white-space:pre-wrap"></pre>

<div id="modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99;align-items:center;justify-content:center">
<div class="card" style="width:100%;max-width:440px;margin:1rem">
<h2 style="margin-bottom:1rem;font-size:1.1rem">Create vault</h2>
<form onsubmit="return createVault(event)">
  <label>Title</label><input name="t" required placeholder="My KB">
  <label>Slug</label><input name="s" required pattern="[a-z0-9-]+" placeholder="my-kb">
  <label>Description</label><input name="d" placeholder="What is this about?">
  <label>Visibility</label><select name="v"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select>
  <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.5rem">
    <button type="button" class="btn" onclick="document.getElementById('modal').style.display='none'">Cancel</button>
    <button class="btn btn-p">Create</button>
  </div>
</form></div></div>
<script>
document.querySelector('[name="t"]')?.addEventListener('input',e=>{
  document.querySelector('[name="s"]').value=e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
});
async function createVault(e){
  e.preventDefault();const f=e.target;
  try{await api('/api/vaults','POST',{title:f.t.value,slug:f.s.value,description:f.d.value,visibility:f.v.value});location.reload()}
  catch(err){alert(err.message)} return false}
async function genKey(){
  try{const r=await api('/auth/api-keys','POST');
  document.getElementById('keyOut').textContent='API Key (save it now!):\\n'+r.key+'\\n\\nUsage:\\ncurl -H "Authorization: Bearer '+r.key+'" ${conf.baseUrl}/api/vaults/${user.username}';
  document.getElementById('keyOut').style.display='block'}catch(err){alert(err.message)}}
</script>`, user);
}

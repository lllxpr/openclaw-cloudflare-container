import { Container, switchPort } from "@cloudflare/containers";
import { getAdminHtml } from "./admin-html";

export interface Env {
  OPENCLAW_CONTAINER: DurableObjectNamespace<OpenClawContainer>;
  OPENCLAW_R2: R2Bucket;
  WORKER_URL?: string;
  GATEWAY_AUTH_TOKEN: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_AUTH_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
}

function buildEntrypoint(workerUrl: string, gatewayToken: string, telegramToken?: string): string[] {
  return [
    "sh", "-c",
    [
      // 0. Try to restore persisted data from R2 (via Worker endpoint)
      "mkdir -p /home/node/.openclaw",
      "echo 'Attempting to restore data from R2...'",
      `curl -sf --max-time 30 ${workerUrl}/persist/load > /tmp/snap_restore.b64 2>/dev/null || true`,
      "if [ -s /tmp/snap_restore.b64 ] && head -c 4 /tmp/snap_restore.b64 | grep -qv '{'; then",
      "  base64 -d /tmp/snap_restore.b64 | tar xzf - -C /home/node/.openclaw/ 2>/dev/null && echo 'R2 restore OK' || echo 'R2 restore failed, will onboard fresh'",
      "else",
      "  echo 'No R2 snapshot found or empty, will onboard fresh'",
      "fi",
      "rm -f /tmp/snap_restore.b64",
      // 1. Save Telegram config from R2-restored openclaw.json BEFORE onboard overwrites it
      "if [ -f /home/node/.openclaw/openclaw.json ]; then node -e \"try{var c=JSON.parse(require('fs').readFileSync('/home/node/.openclaw/openclaw.json','utf8'));if(c.channels&&c.channels.telegram){require('fs').writeFileSync('/tmp/tg_config.json',JSON.stringify(c.channels.telegram));console.log('Saved Telegram config from R2');}}catch(e){}\" || true; fi",
      // 2. Onboard (initializes DB, keys, etc. - idempotent, safe with restored data)
      "node dist/index.js onboard --mode local --no-install-daemon 2>/dev/null || true",
      // 2b. Write base config (gateway overwrites user changes, so R2 restore is unreliable for config)
      "cat > /home/node/.openclaw/openclaw.json << 'CFGEOF'",
      `{"gateway":{"mode":"local","bind":"lan","port":18789,"controlUi":{"enabled":true,"allowInsecureAuth":true,"allowedOrigins":["*"]},"auth":{"mode":"token","token":"${gatewayToken}"},"trustedProxies":["0.0.0.0/0"]}}`,
      "CFGEOF",
      // 2c. Merge Telegram config back if it was saved (and no env token provided)
      telegramToken
        ? `node -e "var c=JSON.parse(require('fs').readFileSync('/home/node/.openclaw/openclaw.json','utf8'));c.channels={telegram:{enabled:true,botToken:'${telegramToken}',dmPolicy:'allow'}};require('fs').writeFileSync('/home/node/.openclaw/openclaw.json',JSON.stringify(c,null,2));console.log('Telegram configured from env');"`
        : "if [ -f /tmp/tg_config.json ]; then node -e \"var c=JSON.parse(require('fs').readFileSync('/home/node/.openclaw/openclaw.json','utf8'));var tg=JSON.parse(require('fs').readFileSync('/tmp/tg_config.json','utf8'));c.channels={telegram:tg};require('fs').writeFileSync('/home/node/.openclaw/openclaw.json',JSON.stringify(c,null,2));console.log('Telegram restored from R2');\"; fi",
      "echo 'Config written'",
      // 2b. Write auth-profiles for OpenAI-compatible provider (Workers AI via AI Gateway)
      "mkdir -p /home/node/.openclaw/agents/main/agent",
      "cat > /home/node/.openclaw/agents/main/agent/auth-profiles.json << 'AUTHEOF'",
      `{"openai-compatible":{"apiKey":"dummy","baseUrl":"${workerUrl}/openai/v1"}}`,
      "AUTHEOF",
      // 3. Write management server via heredoc (no escaping needed)
      "cat > /tmp/mgmt.js << 'JSEOF'",
      "const http=require('http'),https=require('https'),fs=require('fs'),{execSync}=require('child_process'),os=require('os');",
      `const WORKER_URL='${workerUrl}';`,
      "function saveSnapshot(){return new Promise((resolve,reject)=>{try{execSync('cd /home/node/.openclaw && tar czf /tmp/snap.tar.gz openclaw.json devices/ identity/ agents/ workspace/ 2>/dev/null || tar czf /tmp/snap.tar.gz openclaw.json devices/ identity/ agents/',{timeout:10000});const data=fs.readFileSync('/tmp/snap.tar.gz').toString('base64');const u=new URL(WORKER_URL+'/persist/save');const r=https.request({hostname:u.hostname,path:u.pathname,method:'POST',headers:{'Content-Type':'text/plain','Content-Length':Buffer.byteLength(data)}},resp=>{let b='';resp.on('data',d=>b+=d);resp.on('end',()=>{console.log('R2 saved:',b.trim());resolve(b);});});r.on('error',e=>{console.error('R2 save net err:',e.message);reject(e);});r.write(data);r.end();}catch(e){console.error('R2 save failed:',e.message);reject(e);}});}",
      "// Devices cache: refresh in background every 30s instead of on every request",
      "let devicesCache='';let devicesCacheTime=0;",
      "function refreshDevices(){try{devicesCache=execSync('node dist/index.js devices list 2>&1',{encoding:'utf8',timeout:15000});devicesCacheTime=Date.now();}catch(e){console.error('devices refresh err:',e.message);}}",
      "setInterval(refreshDevices,30000);setTimeout(refreshDevices,3000);",
      "// Auto-save to R2 every 5 minutes + once after 60s startup",
      "setInterval(()=>{saveSnapshot().catch(e=>console.error('auto-save err:',e.message));},300000);",
      "setTimeout(()=>{saveSnapshot().catch(e=>console.error('startup-save err:',e.message));},60000);",
      "http.createServer((req,res)=>{",
      "  res.setHeader('content-type','text/plain');",
      "  try{",
      "    if(req.url==='/config'){res.end(fs.readFileSync('/home/node/.openclaw/openclaw.json','utf8'));}",
      "    else if(req.url==='/devices'){if(!devicesCache)refreshDevices();res.end(devicesCache);}",
      "    else if(req.url==='/devices/refresh'){refreshDevices();res.end(devicesCache);}",
      "    else if(req.url.startsWith('/approve?')){const id=new URL('http://x'+req.url).searchParams.get('id');const r=execSync('node dist/index.js devices approve '+id+' 2>&1',{encoding:'utf8'});saveSnapshot().catch(()=>{});refreshDevices();res.end(r);}",
      "    else if(req.url==='/debug'){const {readdirSync,readFileSync,existsSync}=fs;const base='/home/node/.openclaw';const agentDir=base+'/agents/main/agent';const files=existsSync(agentDir)?readdirSync(agentDir):[];const auth=existsSync(agentDir+'/auth-profiles.json')?readFileSync(agentDir+'/auth-profiles.json','utf8'):'not found';const agentYaml=existsSync(agentDir+'/agent.yaml')?readFileSync(agentDir+'/agent.yaml','utf8'):'not found';const dotFiles=existsSync(base)?readdirSync(base,{recursive:true}).slice(0,50):[];res.end(JSON.stringify({agentDir,files,auth,agentYaml,dotFiles},null,2));}",
      "    else if(req.url==='/fix-model'){const c=JSON.parse(fs.readFileSync('/home/node/.openclaw/openclaw.json','utf8'));if(!c.agents)c.agents={};if(!c.agents.defaults)c.agents.defaults={};if(!c.agents.defaults.models)c.agents.defaults.models={};c.agents.defaults.models['openai-compatible/workers-ai/@cf/moonshotai/kimi-k2.5']={baseUrl:WORKER_URL+'/openai/v1',apiKey:'dummy'};fs.writeFileSync('/home/node/.openclaw/openclaw.json',JSON.stringify(c,null,2));res.end(JSON.stringify(c.agents.defaults,null,2));}",
      "    else if(req.url.startsWith('/run?')){const cmd=new URL('http://x'+req.url).searchParams.get('cmd');res.end(execSync(cmd+' 2>&1',{encoding:'utf8',timeout:15000}));}",
      "    else if(req.url==='/approve-all'){",
      "      const out=execSync('node dist/index.js devices list 2>&1',{encoding:'utf8'});",
      "      const ids=[...out.matchAll(/([0-9a-f]{8,}-[0-9a-f-]+)/g)].map(m=>m[1]);",
      "      const results=ids.map(id=>{try{return execSync('node dist/index.js devices approve '+id+' 2>&1',{encoding:'utf8'});}catch(e){return 'err:'+id;}});",
      "      if(ids.length>0)saveSnapshot().catch(()=>{});",
      "      refreshDevices();",
      "      res.end(JSON.stringify({raw:out,ids,results}));",
      "    }",
      "    else if(req.url==='/save'){saveSnapshot().then(r=>res.end(r||'saved')).catch(e=>res.end('save failed: '+e.message));}",
      "    else if(req.url==='/stats'){const mem=process.memoryUsage();const up=os.uptime();res.setHeader('content-type','application/json');res.end(JSON.stringify({uptime:up,loadAvg:os.loadavg(),totalMem:os.totalmem(),freeMem:os.freemem(),heapUsed:mem.heapUsed,heapTotal:mem.heapTotal,devicesCacheAge:devicesCache?Date.now()-devicesCacheTime:null}));}",
      "    else {res.end('ok');}",
      "  }catch(e){res.statusCode=500;res.end(e.message);}",
      "}).listen(18700,()=>console.log('mgmt:18700'));",
      "JSEOF",
      // 4. Write model-patch script via heredoc
      "cat > /tmp/patch-model.js << 'PATCHEOF'",
      "var f='/home/node/.openclaw/openclaw.json';",
      "var c=JSON.parse(require('fs').readFileSync(f,'utf8'));",
      "// Set default model",
      "if(!c.agents)c.agents={};",
      "if(!c.agents.defaults)c.agents.defaults={};",
      "c.agents.defaults.model={primary:'workers-ai/@cf/moonshotai/kimi-k2.5'};",
      "// Clean up any invalid model entries",
      "delete c.agents.defaults.models;",
      "// Define custom provider with baseUrl, apiKey, api type, and model catalog",
      "if(!c.models)c.models={};",
      "if(!c.models.providers)c.models.providers={};",
      "c.models.providers['workers-ai']={",
      `  baseUrl:'${workerUrl}/openai/v1',`,
      "  apiKey:'dummy',",
      "  api:'openai-completions',",
      "  models:[{id:'@cf/moonshotai/kimi-k2.5',name:'Kimi K2.5 (Workers AI)',reasoning:true,input:['text'],contextWindow:131072,maxTokens:8192}]",
      "};",
      "// Add Telegram channel if token is configured (from env or preserved from R2 snapshot)",
      `var tgToken='${telegramToken || ''}';`,
      "if(tgToken){if(!c.channels)c.channels={};c.channels.telegram={enabled:true,botToken:tgToken,dmPolicy:'allow'};console.log('Telegram channel configured from env');}",
      "else{try{var origC=JSON.parse(require('fs').readFileSync(f,'utf8'));if(origC.channels&&origC.channels.telegram&&origC.channels.telegram.botToken){if(!c.channels)c.channels={};c.channels.telegram=origC.channels.telegram;console.log('Telegram channel preserved from R2 snapshot');}}catch(e){}}",
      "require('fs').writeFileSync(f,JSON.stringify(c,null,2));",
      "// Write exec-approvals.json: allow all commands for all agents (wildcard)",
      "var ea={version:1,socket:{},defaults:{},agents:{'*':{allowlist:[{pattern:'*',lastUsedAt:Date.now()},{pattern:'**',lastUsedAt:Date.now()}]}}};require('fs').writeFileSync('/home/node/.openclaw/exec-approvals.json',JSON.stringify(ea,null,2));console.log('exec-approvals: wildcard allow set (* and **)');",
      "// Sync agent-level models.json to match global config",
      "require('fs').mkdirSync('/home/node/.openclaw/agents/main/agent',{recursive:true});",
      "require('fs').writeFileSync('/home/node/.openclaw/agents/main/agent/models.json',JSON.stringify(c.models,null,2));",
      "// Clear stale providerOverride/modelOverride from sessions (can break model lookup after R2 restore)",
      "var sf='/home/node/.openclaw/agents/main/sessions/sessions.json';",
      "if(require('fs').existsSync(sf)){var s=JSON.parse(require('fs').readFileSync(sf,'utf8'));var changed=0;for(var k in s){if(s[k].providerOverride||s[k].modelOverride){delete s[k].providerOverride;delete s[k].modelOverride;changed++;}}if(changed){require('fs').writeFileSync(sf,JSON.stringify(s,null,2));console.log('Cleared model overrides from '+changed+' session(s).');}}",
      "console.log('Model config patched: workers-ai/@cf/moonshotai/kimi-k2.5');",
      "PATCHEOF",
      // 5. Start management server in background
      "node /tmp/mgmt.js &",
      // 6. Start gateway in background, wait for ready, patch model, then wait
      "node dist/index.js gateway &",
      "GWPID=$!",
      "trap 'kill $GWPID 2>/dev/null' TERM INT",
      "for i in $(seq 1 30); do sleep 2; curl -s http://localhost:18789/healthz | grep -q ok && break; done",
      "echo 'Gateway ready, patching model config...'",
      "node /tmp/patch-model.js",
      // 7. Wait for gateway process
      "wait $GWPID",
    ].join("\n"),
  ];
}

export class OpenClawContainer extends Container {
  defaultPort = 18789;
  sleepAfter = "10m";
  private gatewayToken: string;
  private telegramToken?: string;
  private urlDetected = false;

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    this.gatewayToken = env.GATEWAY_AUTH_TOKEN || "change-me";
    this.telegramToken = env.TELEGRAM_BOT_TOKEN;
    // If WORKER_URL is explicitly set, use it; otherwise auto-detect on first fetch
    if (env.WORKER_URL && !env.WORKER_URL.includes("your-worker") && !env.WORKER_URL.includes("your-subdomain")) {
      this.entrypoint = buildEntrypoint(env.WORKER_URL, this.gatewayToken, this.telegramToken);
      this.urlDetected = true;
    }
  }

  // Auto-detect Worker URL from the first incoming request before the container starts
  override async fetch(request: Request): Promise<Response> {
    if (!this.urlDetected) {
      const url = new URL(request.url);
      const workerUrl = `${url.protocol}//${url.hostname}`;
      this.entrypoint = buildEntrypoint(workerUrl, this.gatewayToken, this.telegramToken);
      this.urlDetected = true;
      console.log(`Auto-detected WORKER_URL: ${workerUrl}`);
    }
    return super.fetch(request);
  }

  override onStart(): void {
    console.log("OpenClaw container started (port 18789)");
  }

  override onStop(): void {
    console.log("OpenClaw container stopped");
  }

  override onError(error: unknown): void {
    console.error("OpenClaw container error:", error);
  }

  async forceRestart(): Promise<string> {
    await this.destroy();
    return "destroyed";
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.OPENCLAW_CONTAINER.idFromName("main");
    const stub = env.OPENCLAW_CONTAINER.get(id) as DurableObjectStub<OpenClawContainer>;

    const url = new URL(request.url);
    const path = url.pathname;

    // Worker health check
    if (path === "/health") {
      return json({
        ok: true,
        service: "openclaw-cloudflare",
        image: "alpine/openclaw:2026.3.24-slim",
        instanceType: "standard-2",
        containerPort: 18789,
      });
    }

    // Force restart container
    if (path === "/admin/restart") {
      try {
        const stub = env.OPENCLAW_CONTAINER.getByName("primary") as unknown as OpenClawContainer;
        await stub.forceRestart();
      } catch {
        // ignore
      }
      return json({ ok: true, message: "Container restart triggered. Wait ~60s for OpenClaw to start." });
    }

    // Admin dashboard UI
    if (path === "/admin" || path === "/admin/") {
      return new Response(getAdminHtml(env.GATEWAY_AUTH_TOKEN || "change-me"), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Management API endpoints → proxy to mgmt server on port 18700
    if (path.startsWith("/admin/api/") || path === "/admin/api/debug") {
      const container = env.OPENCLAW_CONTAINER.getByName("primary");
      const mgmtPath = path.replace("/admin/api", "") + url.search;
      const mgmtUrl = new URL(mgmtPath, url.origin).toString();
      return container.fetch(switchPort(new Request(mgmtUrl), 18700));
    }

    // R2 persistence endpoints (handled by Worker, not proxied to container)
    if (path === "/persist/save") {
      if (request.method !== "POST") return json({ error: "POST required" }, 405);
      try {
        const data = await request.text();
        await env.OPENCLAW_R2.put("openclaw-snapshot", data);
        return json({ ok: true, size: data.length, ts: new Date().toISOString() });
      } catch (err: unknown) {
        return json({ error: "R2 write failed", detail: String(err) }, 500);
      }
    }
    if (path === "/persist/load") {
      try {
        const obj = await env.OPENCLAW_R2.get("openclaw-snapshot");
        if (!obj) return json({ ok: false, message: "No snapshot found" }, 404);
        const data = await obj.text();
        return new Response(data, { headers: { "content-type": "text/plain" } });
      } catch (err: unknown) {
        return json({ error: "R2 read failed", detail: String(err) }, 500);
      }
    }
    if (path === "/persist/status") {
      try {
        const listed = await env.OPENCLAW_R2.list({ prefix: "openclaw-" });
        const info = listed.objects.map(o => ({ name: o.key, size: o.size, uploaded: o.uploaded.toISOString() }));
        return json({ ok: true, objects: info });
      } catch (err: unknown) {
        return json({ error: "R2 list failed", detail: String(err) }, 500);
      }
    }

    // OpenAI-compatible API proxy → AI Gateway (for Workers AI Kimi 2.5)
    if (path === "/openai/v1/chat/completions") {
      return handleAIGatewayProxy(request, env, "/chat/completions");
    }
    if (path === "/openai/v1/embeddings") {
      return handleAIGatewayProxy(request, env, "/embeddings");
    }
    if (path === "/openai/v1/models") {
      return json({
        object: "list",
        data: [
          { id: "workers-ai/@cf/moonshotai/kimi-k2.5", object: "model", created: 1742342400, owned_by: "cloudflare" },
          { id: "workers-ai/@cf/baai/bge-large-en-v1.5", object: "model", created: 1735689600, owned_by: "cloudflare" },
        ],
      });
    }

    // Everything else → proxy to OpenClaw on port 18789
    const container = env.OPENCLAW_CONTAINER.getByName("primary");
    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-For", "127.0.0.1");
    headers.set("X-Real-IP", "127.0.0.1");
    const proxiedRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
    });
    const resp = await container.fetch(proxiedRequest);

    // Inject pairing-help banner into Control UI HTML pages
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("text/html")) {
      let html = await resp.text();
      const pairingHelpScript = `<script>
(function(){
  var iv=setInterval(function(){
    var el=document.body?document.body.innerText:'';
    if(el.indexOf('pairing required')!==-1 && !document.getElementById('oc-pair-hint')){
      var d=document.createElement('div');
      d.id='oc-pair-hint';
      d.innerHTML='<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1e293b;color:#e2e8f0;padding:12px 24px;border-radius:12px;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:flex;align-items:center;gap:10px;font-family:system-ui,sans-serif">'
        +'<span style="font-size:18px">&#128268;</span>'
        +'<span>Device pairing required. </span>'
        +'<a href="/admin/" target="_blank" style="color:#60a5fa;text-decoration:underline;font-weight:600">Open Admin Dashboard</a>'
        +'<span> to approve this device.</span>'
        +'<span onclick="this.parentElement.remove()" style="cursor:pointer;margin-left:8px;opacity:0.6">&#10005;</span>'
        +'</div>';
      document.body.appendChild(d);
    }
    if(el.indexOf('pairing required')===-1){var h=document.getElementById('oc-pair-hint');if(h)h.remove();}
  },1000);
})();
</script>`;
      html = html.replace("</body>", pairingHelpScript + "</body>");
      return new Response(html, {
        status: resp.status,
        headers: resp.headers,
      });
    }

    return resp;
  },
} satisfies ExportedHandler<Env>;

async function handleAIGatewayProxy(request: Request, env: Env, endpoint: string): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const accountId = env.AI_GATEWAY_ACCOUNT_ID;
  const gatewayId = env.AI_GATEWAY_ID || "default";
  const authToken = env.AI_GATEWAY_AUTH_TOKEN;
  if (!accountId || !authToken) {
    return json({ error: "AI Gateway not configured. Set AI_GATEWAY_ACCOUNT_ID and AI_GATEWAY_AUTH_TOKEN." }, 500);
  }
  const baseUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat`;
  try {
    const body = await request.text();
    const payload = JSON.parse(body);
    if (endpoint === "/chat/completions") {
      // Map model names to AI Gateway format
      if (!payload.model || payload.model === "kimi-k2.5") {
        payload.model = "workers-ai/@cf/moonshotai/kimi-k2.5";
      } else if (payload.model.startsWith("@cf/")) {
        payload.model = "workers-ai/" + payload.model;
      }
      // Limit max_tokens to prevent extremely long reasoning chains that cause stuck responses
      if (!payload.max_tokens) {
        payload.max_tokens = 4096;
      }
      // Kimi K2.5 reasoning model requires explicit tool_choice to reliably call tools in streaming mode
      if (payload.tools?.length > 0 && payload.tool_choice === undefined) {
        payload.tool_choice = "auto";
      }
      // Normalize tool result messages: OpenAI spec requires role:"tool" after assistant tool_calls.
      // If OpenClaw sends role:"user" at that position, convert to role:"tool" with proper tool_call_id.
      {
        const ms: Array<{role: string; content?: unknown; tool_calls?: Array<{id: string}>; tool_call_id?: string}> = payload.messages ?? [];
        for (let i = 1; i < ms.length; i++) {
          const prev = ms[i - 1];
          const curr = ms[i];
          if (prev.role === "assistant" && Array.isArray(prev.tool_calls) && prev.tool_calls.length > 0 && curr.role === "user") {
            curr.role = "tool";
            if (!curr.tool_call_id) curr.tool_call_id = prev.tool_calls[0].id;
            if (Array.isArray(curr.content)) {
              curr.content = (curr.content as Array<{type: string; text?: string; content?: string}>)
                .map(c => (typeof c === "string" ? c : (c.text ?? c.content ?? JSON.stringify(c))))
                .join("\n");
            }
          }
        }
      }
    
    }
    const headers = new Headers();
    headers.set("cf-aig-authorization", `Bearer ${authToken}`);
    headers.set("content-type", "application/json");
    const resp = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    // Pass through response with all headers (supports streaming SSE)
    return new Response(resp.body, {
      status: resp.status,
      headers: resp.headers,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: "AI Gateway proxy error", detail: message }, 502);
  }
}

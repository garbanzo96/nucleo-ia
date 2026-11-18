// Fase 3: no se despliega ni realiza llamadas a Meta.
// La implementación futura debe consultar content_publishing_limit, usar medios JPEG
// públicos y exigir aprobación humana y checklist antes de crear los contenedores.
Deno.serve(() => new Response(JSON.stringify({ error: 'Publicación en Instagram no habilitada' }), {
  status: 501, headers: { 'Content-Type': 'application/json' },
}));

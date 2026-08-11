export const runtime = 'edge';

export async function GET() {
  const key = process.env.INDEXNOW_KEY;

  if (!key) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(key, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

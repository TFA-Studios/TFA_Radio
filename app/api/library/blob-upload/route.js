import { handleUpload } from '@vercel/blob/client';

// Client-side direct-to-Blob upload handshake for the library's music/voice
// audio files. The old approach sent the audio file itself through a Server
// Action's request body — Next.js caps that at 1MB by default, and even
// raising the limit runs straight into Vercel's own ~4.5MB serverless
// function body cap, which no next.config setting can lift. Real voice and
// music files routinely exceed both, so adds were silently failing.
//
// Uploading straight from the browser to Blob storage sidesteps both limits:
// this route only ever issues a short-lived upload token (see
// components/LibraryClient.js's uploadFileToBlob, which calls @vercel/blob's
// client-side upload() against this URL) — the actual file bytes never pass
// through a Next.js request handler at all.
const BLOB_ENABLED = !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

export async function POST(request) {
  if (!BLOB_ENABLED) {
    // Same "no Blob store configured yet" case actions.js used to degrade
    // gracefully — the client catches this and adds the item without audio
    // rather than blocking the whole import.
    return Response.json({ error: 'no_blob_store_configured' }, { status: 501 });
  }

  const body = await request.json();
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a',
          'audio/aac', 'audio/ogg', 'audio/flac', 'audio/webm',
        ],
        addRandomSuffix: true,
        // A generous ceiling, not a meaningful constraint for a radio spot's
        // voice-over or music bed — just a sane upper bound in case someone
        // selects the wrong (huge) file by accident.
        maximumSizeInBytes: 300 * 1024 * 1024,
      }),
    });
    return Response.json(jsonResponse);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}

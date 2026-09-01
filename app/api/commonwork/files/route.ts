import { getAttachment, saveAttachment } from '../../../../lib/commonwork-db';
import { getCommonworkUser } from '../../../../lib/commonwork-auth';

export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await getCommonworkUser(request);
  if (!user || user.isAnonymous) return json({ error: 'Sign in with ChatGPT to upload room files.' }, 401);
  try {
    const form = await request.formData();
    const roomId = form.get('room_id');
    const contributionId = form.get('contribution_id');
    const file = form.get('file');
    if (typeof roomId !== 'string' || !roomId.trim()) throw new Error('room_id is required.');
    if (!(file instanceof File)) throw new Error('file is required.');
    return json(await saveAttachment(
      roomId.trim(),
      file,
      typeof contributionId === 'string' && contributionId.trim() ? contributionId.trim() : null,
      user,
    ), 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Upload failed.' }, 400);
  }
}

export async function GET(request: Request) {
  const user = await getCommonworkUser(request);
  if (!user) return json({ error: 'Sign in with ChatGPT to download room files.' }, 401);
  try {
    const attachmentId = new URL(request.url).searchParams.get('attachment_id');
    if (!attachmentId) throw new Error('attachment_id is required.');
    const result = await getAttachment(attachmentId, user);
    if (!result) return json({ error: 'File not found.' }, 404);
    const { attachment, object } = result;
    return new Response(object.body, {
      headers: {
        'content-type': String(attachment.content_type),
        'content-length': String(attachment.size_bytes),
        'content-disposition': `attachment; filename="${String(attachment.filename).replace(/["\\]/g, '_')}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Download failed.' }, 400);
  }
}

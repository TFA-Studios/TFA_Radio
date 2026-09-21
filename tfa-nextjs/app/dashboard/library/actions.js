'use server';

import { revalidatePath } from 'next/cache';
import {
  createTrack, deleteTrack, updateTrack, deleteTracksBulk, updateTracksBulk, renameTracksBulk,
  createVoice, deleteVoice, updateVoice, deleteVoicesBulk, updateVoicesBulk,
} from '../../../lib/library';

// Audio files are uploaded directly from the browser to Blob storage (see
// components/LibraryClient.js's uploadFileToBlob + app/api/library/
// blob-upload/route.js) — these actions only ever receive the resulting
// blob URL as a plain string field, never the file itself. That's a
// deliberate change: routing the raw file through a Server Action's request
// body used to hit Next's 1MB default body-size limit (and Vercel's own
// ~4.5MB serverless function cap besides, which no config can lift), so any
// real voice or music file would silently fail to add.

export async function addTrackAction(formData) {
  await createTrack({
    title: formData.get('title'),
    artist: formData.get('artist'),
    category: formData.get('category'),
    fileId: formData.get('fileId') || '',
    audioUrl: formData.get('audioUrl') || '',
    originalFilename: formData.get('originalFilename') || '',
  });
  revalidatePath('/dashboard/library');
}

export async function removeTrackAction(id) {
  await deleteTrack(id);
  revalidatePath('/dashboard/library');
}

// Edit an existing track in place — audioUrl is optional here (unlike the
// add form, where it's just skipped if empty): only replace it when the
// producer actually uploaded a new file (the client only sends this field
// when that happened), otherwise leave the existing audio alone.
export async function updateTrackAction(id, formData) {
  const patch = {
    title: formData.get('title'),
    artist: formData.get('artist'),
    category: formData.get('category'),
    fileId: formData.get('fileId') || '',
  };
  const audioUrl = formData.get('audioUrl');
  if (audioUrl) {
    patch.audioUrl = audioUrl;
    patch.originalFilename = formData.get('originalFilename') || '';
  }
  await updateTrack(id, patch);
  revalidatePath('/dashboard/library');
}

// Batch delete — the library view's "select several, delete at once" flow
// submits every checked id in one FormData (repeated `id` entries) instead
// of firing removeTrackAction once per row.
export async function removeTracksBulkAction(formData) {
  const ids = formData.getAll('id').map(String).filter(Boolean);
  await deleteTracksBulk(ids);
  revalidatePath('/dashboard/library');
}

export async function addVoiceAction(formData) {
  const tagsRaw = formData.get('tags') || '';
  const tags = tagsRaw
    .toString()
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  await createVoice({
    name: formData.get('name'),
    gender: formData.get('gender'),
    ageRange: formData.get('ageRange'),
    tags,
    fileId: formData.get('fileId') || '',
    audioUrl: formData.get('audioUrl') || '',
    originalFilename: formData.get('originalFilename') || '',
  });
  revalidatePath('/dashboard/library');
}

export async function removeVoiceAction(id) {
  await deleteVoice(id);
  revalidatePath('/dashboard/library');
}

// See updateTrackAction above — same "only replace audio if a new file was
// actually uploaded" behavior, voice side.
export async function updateVoiceAction(id, formData) {
  const tagsRaw = formData.get('tags') || '';
  const tags = tagsRaw.toString().split(',').map((t) => t.trim()).filter(Boolean);
  const patch = {
    name: formData.get('name'),
    gender: formData.get('gender'),
    ageRange: formData.get('ageRange'),
    tags,
    fileId: formData.get('fileId') || '',
  };
  const audioUrl = formData.get('audioUrl');
  if (audioUrl) {
    patch.audioUrl = audioUrl;
    patch.originalFilename = formData.get('originalFilename') || '';
  }
  await updateVoice(id, patch);
  revalidatePath('/dashboard/library');
}

// See removeTracksBulkAction above — voice side.
export async function removeVoicesBulkAction(formData) {
  const ids = formData.getAll('id').map(String).filter(Boolean);
  await deleteVoicesBulk(ids);
  revalidatePath('/dashboard/library');
}

// Bulk import — the drag-and-drop multi-file flow in LibraryClient uploads
// each file to Blob storage client-side first, then stages N items with an
// editable field set per file, then submits one FormData with indexed keys
// (track_0_title, track_0_audioUrl, ...) which we loop through here and
// import one by one. An optional `sharedCategory` field applies one category
// to the whole batch instead of the per-file category picked in the staging
// UI — the "adding 10 tracks that are all the same category" case.
export async function addTracksBulkAction(formData) {
  const count = Number(formData.get('count') || 0);
  const sharedCategory = formData.get('sharedCategory') || '';
  for (let i = 0; i < count; i++) {
    await createTrack({
      title: formData.get(`track_${i}_title`),
      artist: formData.get(`track_${i}_artist`),
      category: sharedCategory || formData.get(`track_${i}_category`),
      fileId: formData.get(`track_${i}_fileId`) || '',
      audioUrl: formData.get(`track_${i}_audioUrl`) || '',
      originalFilename: formData.get(`track_${i}_originalFilename`) || '',
    });
  }
  revalidatePath('/dashboard/library');
}

// Batch re-categorize a selected set of tracks in one go.
export async function setTracksCategoryBulkAction(formData) {
  const ids = formData.getAll('id').map(String).filter(Boolean);
  const category = formData.get('category');
  await updateTracksBulk(ids, { category });
  revalidatePath('/dashboard/library');
}

// Hide/unhide a selected set of tracks — pulls them out of the client-facing
// picker (see app/api/library/tracks/route.js) without deleting them.
export async function setTracksHiddenBulkAction(formData) {
  const ids = formData.getAll('id').map(String).filter(Boolean);
  const hidden = formData.get('hidden') === 'true';
  await updateTracksBulk(ids, { hidden });
  revalidatePath('/dashboard/library');
}

// Batch rename by find/replace across a selected set of tracks — e.g.
// stripping a shared prefix like "REC_" from a batch of imported titles.
export async function renameTracksBulkAction(formData) {
  const ids = formData.getAll('id').map(String).filter(Boolean);
  const find = formData.get('find') || '';
  const replace = formData.get('replace') || '';
  await renameTracksBulk(ids, { find, replace });
  revalidatePath('/dashboard/library');
}

export async function addVoicesBulkAction(formData) {
  const count = Number(formData.get('count') || 0);
  for (let i = 0; i < count; i++) {
    const tagsRaw = formData.get(`voice_${i}_tags`) || '';
    const tags = tagsRaw.toString().split(',').map((t) => t.trim()).filter(Boolean);
    await createVoice({
      name: formData.get(`voice_${i}_name`),
      gender: formData.get(`voice_${i}_gender`),
      ageRange: formData.get(`voice_${i}_ageRange`),
      tags,
      fileId: formData.get(`voice_${i}_fileId`) || '',
      audioUrl: formData.get(`voice_${i}_audioUrl`) || '',
      originalFilename: formData.get(`voice_${i}_originalFilename`) || '',
    });
  }
  revalidatePath('/dashboard/library');
}

// See setTracksHiddenBulkAction above — voice side.
export async function setVoicesHiddenBulkAction(formData) {
  const ids = formData.getAll('id').map(String).filter(Boolean);
  const hidden = formData.get('hidden') === 'true';
  await updateVoicesBulk(ids, { hidden });
  revalidatePath('/dashboard/library');
}

import { NextRequest, NextResponse } from 'next/server';
import { ApiRouteError, apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { ensureObject, readJsonBody, readOptionalBoolean, readOptionalObject, readOptionalString } from '@/lib/api/validation';
import { createClient } from '@/lib/supabase/server';
import { getFileExtension } from '@/lib/vault/items';
import {
  createSignedAvatarUrl,
  getDefaultUserPreferences,
  getOrCreateProfile,
  mapUserProfile,
  normalizeUserPreferences,
  PROFILE_ASSETS_BUCKET,
} from '@/lib/supabase/profile';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const AVATAR_SIZE_TOLERANCE_BYTES = 1024;

type AvatarFileData = {
  base64: string;
  mimeType: string;
  name?: string;
  size?: number;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const profile = await getOrCreateProfile(supabase, user);
    const avatarUrl = profile.avatar_path
      ? await createSignedAvatarUrl(supabase, profile.avatar_path)
      : undefined;

    return apiSuccess(mapUserProfile(profile, avatarUrl));
  } catch (error) {
    return handleApiRouteError(error, 'profile.get');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const body = ensureObject(await readJsonBody(req));
    const existingProfile = await getOrCreateProfile(supabase, user);
    const updates: Record<string, unknown> = {};
    const fullName = readOptionalString(body.fullName, {
      field: 'Full name',
      maxLength: 80,
    })?.replace(/\s+/g, ' ');

    if (fullName !== undefined) {
      updates.full_name = fullName || null;
    }

    const preferences = readOptionalObject(body.preferences, 'preferences');
    if (preferences !== undefined) {
      updates.preferences = normalizeUserPreferences({
        ...getDefaultUserPreferences(),
        ...normalizeUserPreferences(existingProfile.preferences),
        ...preferences,
      });
    }

    let nextAvatarPath = existingProfile.avatar_path;
    const shouldRemoveAvatar = readOptionalBoolean(body.removeAvatar, 'removeAvatar') === true;

    if (shouldRemoveAvatar && nextAvatarPath) {
      const { error: removeError } = await supabase.storage.from(PROFILE_ASSETS_BUCKET).remove([nextAvatarPath]);

      if (removeError) {
        console.error('Failed to remove previous avatar:', removeError);
      }

      nextAvatarPath = null;
      updates.avatar_path = null;
    }

    if (body.avatarFileData !== undefined) {
      const avatarFileData = parseAvatarFileData(body.avatarFileData);

      if (!avatarFileData) {
        throw new ApiRouteError(400, 'Avatar upload payload is invalid.', {
          code: 'invalid_upload',
        });
      }

      if (!ALLOWED_AVATAR_MIME_TYPES.has(avatarFileData.mimeType)) {
        throw new ApiRouteError(400, 'Avatar must be a JPG, PNG, WEBP, or GIF image.', {
          code: 'invalid_upload_type',
        });
      }

      const actualSize = getBase64ByteSize(avatarFileData.base64);
      const declaredSize = typeof avatarFileData.size === 'number' && avatarFileData.size > 0
        ? avatarFileData.size
        : actualSize;

      if (Math.abs(declaredSize - actualSize) > AVATAR_SIZE_TOLERANCE_BYTES) {
        throw new ApiRouteError(400, 'Avatar upload metadata does not match the payload.', {
          code: 'invalid_upload_size',
        });
      }

      if (actualSize > MAX_AVATAR_SIZE) {
        throw new ApiRouteError(400, 'Avatar must be 5 MB or smaller.', {
          code: 'upload_too_large',
        });
      }

      const extension = getFileExtension(avatarFileData.name, avatarFileData.mimeType);
      const avatarPath = `${user.id}/avatar-${Date.now()}.${extension}`;
      const fileBuffer = Buffer.from(avatarFileData.base64, 'base64');

      if (!matchesAvatarSignature(fileBuffer, avatarFileData.mimeType)) {
        throw new ApiRouteError(400, 'Avatar file content does not match the provided image type.', {
          code: 'invalid_upload_type',
        });
      }

      const { error: uploadError } = await supabase.storage.from(PROFILE_ASSETS_BUCKET).upload(avatarPath, fileBuffer, {
        contentType: avatarFileData.mimeType,
        upsert: false,
      });

      if (uploadError) {
        throw new ApiRouteError(500, 'Unable to upload avatar right now.', {
          code: 'avatar_upload_failed',
          cause: uploadError,
        });
      }

      if (nextAvatarPath) {
        const { error: removeError } = await supabase.storage.from(PROFILE_ASSETS_BUCKET).remove([nextAvatarPath]);

        if (removeError) {
          console.error('Failed to remove replaced avatar:', removeError);
        }
      }

      nextAvatarPath = avatarPath;
      updates.avatar_path = avatarPath;
    }

    let updatedProfile = existingProfile;

    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select('*')
        .single();

      if (error || !data) {
        throw new ApiRouteError(500, 'Unable to update profile right now.', {
          code: 'profile_update_failed',
          cause: error,
        });
      }

      updatedProfile = data;
    }

    if (fullName !== undefined) {
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          full_name: fullName || undefined,
        },
      });

      if (metadataError) {
        console.error('Failed to sync auth metadata full name:', metadataError);
      }
    }

    const avatarUrl = updatedProfile.avatar_path
      ? await createSignedAvatarUrl(supabase, updatedProfile.avatar_path)
      : undefined;

    return apiSuccess(mapUserProfile(updatedProfile, avatarUrl));
  } catch (error) {
    return handleApiRouteError(error, 'profile.update');
  }
}

function parseAvatarFileData(value: unknown): AvatarFileData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const data = value as Record<string, unknown>;
  const base64 = typeof data.base64 === 'string' ? data.base64 : '';
  const mimeType = typeof data.mimeType === 'string' ? data.mimeType.split(';')[0].trim().toLowerCase() : '';
  const name = typeof data.name === 'string' ? data.name : undefined;
  const size = typeof data.size === 'number' ? data.size : undefined;

  if (!base64 || !mimeType) {
    return null;
  }

  return { base64, mimeType, name, size };
}

function getBase64ByteSize(value: string) {
  const normalized = value.replace(/\s/g, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function matchesAvatarSignature(fileBuffer: Buffer, mimeType: string) {
  if (fileBuffer.length < 4) {
    return false;
  }

  if (mimeType === 'image/png') {
    return fileBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff;
  }

  if (mimeType === 'image/gif') {
    const header = fileBuffer.subarray(0, 6).toString('ascii');
    return header === 'GIF87a' || header === 'GIF89a';
  }

  if (mimeType === 'image/webp') {
    return (
      fileBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      fileBuffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  return false;
}

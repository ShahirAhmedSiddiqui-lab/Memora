const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.m4v'];
const DIRECT_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.svg'];
const DIRECT_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'];
const DIRECT_PDF_EXTENSIONS = ['.pdf'];

export function inferPreviewFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();
    const pathnameSegments = parsedUrl.pathname.split('/').filter(Boolean);

    if (DIRECT_PDF_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
      return {
        mediaKind: 'pdf' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: parsedUrl.toString(),
        thumbnailUrl: undefined,
      };
    }

    if (DIRECT_IMAGE_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
      return {
        mediaKind: 'image' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: undefined,
        thumbnailUrl: parsedUrl.toString(),
      };
    }

    if (DIRECT_AUDIO_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
      return {
        mediaKind: 'audio' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: undefined,
        thumbnailUrl: undefined,
      };
    }

    if (DIRECT_VIDEO_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: undefined,
        thumbnailUrl: undefined,
      };
    }

    if (hostname.includes('youtu.be')) {
      const videoId = pathnameSegments[0];
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : undefined,
        thumbnailUrl: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined,
      };
    }

    if (hostname.includes('youtube.com')) {
      const videoId =
        parsedUrl.pathname === '/watch'
          ? parsedUrl.searchParams.get('v')
          : pathnameSegments[1];
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : undefined,
        thumbnailUrl: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined,
      };
    }

    if (hostname.includes('vimeo.com')) {
      const videoId = pathnameSegments.find((segment) => /^\d+$/.test(segment));
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://player.vimeo.com/video/${videoId}` : undefined,
        thumbnailUrl: undefined,
      };
    }

    if (hostname.includes('loom.com')) {
      const videoId = pathnameSegments[pathnameSegments.length - 1];
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://www.loom.com/embed/${videoId}` : undefined,
        thumbnailUrl: undefined,
      };
    }

    if (hostname === 'dai.ly' || hostname.includes('dailymotion.com')) {
      const videoId = hostname === 'dai.ly'
        ? pathnameSegments[0]
        : pathnameSegments[pathnameSegments.length - 1];
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://www.dailymotion.com/embed/video/${videoId}` : undefined,
        thumbnailUrl: undefined,
      };
    }

    if (hostname.includes('wistia.com') || hostname.includes('fast.wistia.net')) {
      const mediaIndex = pathnameSegments.findIndex((segment) => segment === 'medias');
      const videoId = mediaIndex >= 0 ? pathnameSegments[mediaIndex + 1] : pathnameSegments[pathnameSegments.length - 1];
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://fast.wistia.net/embed/iframe/${videoId}` : undefined,
        thumbnailUrl: undefined,
      };
    }

    if (hostname.includes('drive.google.com')) {
      const fileIndex = pathnameSegments.findIndex((segment) => segment === 'd');
      const fileId = fileIndex >= 0 ? pathnameSegments[fileIndex + 1] : undefined;
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: fileId ? `https://drive.google.com/file/d/${fileId}/preview` : undefined,
        thumbnailUrl: undefined,
      };
    }

    return {
      mediaKind: 'unknown' as const,
      previewUrl: parsedUrl.toString(),
      embedUrl: undefined,
      thumbnailUrl: undefined,
    };
  } catch {
    return {
      mediaKind: 'unknown' as const,
      previewUrl: url,
      embedUrl: undefined,
      thumbnailUrl: undefined,
    };
  }
}

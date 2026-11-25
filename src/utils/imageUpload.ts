const MAX_PHOTO_DATA_URL_LENGTH = 75000;

export async function processProfilePhotoFile(file: File): Promise<string> {
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Veuillez sélectionner un fichier image valide (JPG, PNG, WebP).');
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('L’image sélectionnée est trop volumineuse (max. 15 Mo).');
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new Error('Impossible de lire ce fichier image.'));
      image.src = objectUrl;
    });

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error('Dimensions d’image invalides.');
    }

    const cropSize = Math.min(sourceWidth, sourceHeight);
    const sx = Math.floor((sourceWidth - cropSize) / 2);
    const sy = Math.floor((sourceHeight - cropSize) / 2);

    const tryEncode = (targetDim: number, quality: number): string => {
      const canvas = document.createElement('canvas');
      canvas.width = targetDim;
      canvas.height = targetDim;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Traitement d’image indisponible sur ce navigateur.');
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetDim, targetDim);
      ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, targetDim, targetDim);
      return canvas.toDataURL('image/jpeg', quality);
    };

    const attempts: [number, number][] = [
      [256, 0.82],
      [256, 0.68],
      [192, 0.72],
      [160, 0.62],
    ];

    for (const [dim, quality] of attempts) {
      const result = tryEncode(dim, quality);
      if (result.length <= MAX_PHOTO_DATA_URL_LENGTH) {
        return result;
      }
    }

    throw new Error(
      'Impossible de compresser suffisamment cette image. Essayez une photo plus simple.'
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const MAX_EVENT_COVER_DATA_URL_LENGTH = 150000;

export async function processEventCoverImageFile(file: File): Promise<string> {
  const isImageByType = Boolean(file.type && file.type.startsWith('image/'));
  const isImageByExt = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(
    file.name || ''
  );
  if (!isImageByType && !isImageByExt) {
    throw new Error('Veuillez sélectionner un fichier image valide (JPG, PNG, WebP).');
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('L’image sélectionnée est trop volumineuse (max. 15 Mo).');
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new Error('Impossible de lire ce fichier image.'));
      image.src = objectUrl;
    });

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error('Dimensions d’image invalides.');
    }

    const tryEncode = (maxEdge: number, quality: number): string => {
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Traitement d’image indisponible sur ce navigateur.');
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
      return canvas.toDataURL('image/jpeg', quality);
    };

    const attempts: [number, number][] = [
      [1200, 0.8],
      [1024, 0.74],
      [900, 0.68],
      [760, 0.62],
      [640, 0.56],
      [560, 0.5],
      [480, 0.45],
    ];

    for (const [maxEdge, quality] of attempts) {
      const result = tryEncode(maxEdge, quality);
      if (result.length <= MAX_EVENT_COVER_DATA_URL_LENGTH) {
        return result;
      }
    }

    throw new Error(
      'Impossible de compresser suffisamment cette image. Essayez un visuel plus léger.'
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}


export const writingFonts = {
  'ar-formal': { family: 'IBM Plex Sans Arabic', label: 'Formal', sample: 'أغنية لهاللقطة' },
  'ar-hand': { family: 'Aref Ruqaa', label: 'Handwritten', sample: 'أغنية لهاللقطة' },
  'ar-vintage': { family: 'Amiri', label: 'Vintage', sample: 'أغنية لهاللقطة' },
  'en-formal': { family: 'Playfair Display', label: 'Elegant', sample: 'A song for this moment' },
  'en-hand': { family: 'Caveat', label: 'Handwritten', sample: 'A song for this moment' },
  'en-vintage': { family: 'DM Serif Display', label: 'Vintage', sample: 'A song for this moment' },
} as const;

export const palettes = {
  paper: { label: 'Paper', background: '#F4F2E9', ink: '#171C29', muted: '#52596A' },
  ink: { label: 'Ink', background: '#171C29', ink: '#FFF1E6', muted: '#D3CBD5' },
  olive: { label: 'Olive', background: '#26382C', ink: '#F4F2E9', muted: '#CFDFCB' },
  rose: { label: 'Dusty rose', background: '#EDD5CE', ink: '#321D29', muted: '#664958' },
} as const;
